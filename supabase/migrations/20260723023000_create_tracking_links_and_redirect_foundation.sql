begin;

create type public.tracking_link_status as enum (
  'draft',
  'active',
  'paused',
  'archived'
);

create or replace function private.tracking_link_query_parameters_valid(
  target_parameters jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select
    jsonb_typeof(target_parameters) = 'object'
    and (
      select count(*) <= 50
      from jsonb_each(target_parameters)
    )
    and not exists (
      select 1
      from jsonb_each(target_parameters) as parameter(key, value)
      where char_length(parameter.key) not between 1 and 64
        or parameter.key !~ '^[A-Za-z0-9_.-]+$'
        or jsonb_typeof(parameter.value) <> 'string'
        or char_length(parameter.value #>> '{}') > 500
        or parameter.value #>> '{}' ~ '[[:cntrl:]]'
    );
$function$;

create table public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  offer_id uuid not null
    references public.offers (id)
    on delete restrict,
  tracking_domain_id uuid not null
    references public.tracking_domains (id)
    on delete restrict,
  owner_membership_id uuid not null
    references public.company_memberships (id)
    on delete restrict,
  tracking_code text not null,
  custom_slug text,
  destination_url text not null,
  query_parameters jsonb not null default '{}'::jsonb,
  status public.tracking_link_status not null default 'draft',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tracking_links_tracking_code_unique
    unique (tracking_code),

  constraint tracking_links_tracking_code_check
    check (
      tracking_code = lower(tracking_code)
      and tracking_code ~ '^[a-f0-9]{40}$'
    ),

  constraint tracking_links_custom_slug_check
    check (
      custom_slug is null
      or (
        custom_slug = lower(custom_slug)
        and custom_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(custom_slug) between 2 and 80
      )
    ),

  constraint tracking_links_destination_url_check
    check (
      char_length(btrim(destination_url)) between 8 and 2048
      and destination_url ~* '^https?://'
    ),

  constraint tracking_links_query_parameters_check
    check (
      private.tracking_link_query_parameters_valid(query_parameters)
    )
);

create unique index tracking_links_domain_custom_slug_unique
  on public.tracking_links (
    tracking_domain_id,
    custom_slug
  )
  where custom_slug is not null;

create index tracking_links_company_status_created_at_idx
  on public.tracking_links (
    company_id,
    status,
    created_at desc,
    id desc
  );

create index tracking_links_offer_status_idx
  on public.tracking_links (
    offer_id,
    status,
    updated_at desc,
    id desc
  );

create index tracking_links_owner_status_idx
  on public.tracking_links (
    owner_membership_id,
    status,
    updated_at desc,
    id desc
  );

create index tracking_links_domain_status_idx
  on public.tracking_links (
    tracking_domain_id,
    status,
    updated_at desc,
    id desc
  );

create trigger tracking_links_set_updated_at
before update on public.tracking_links
for each row
execute function private.set_updated_at();

create or replace function private.enforce_tracking_link_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id uuid;
  actor_is_platform_admin boolean;
  target_company_id uuid;
  offer_company_id uuid;
  offer_status public.offer_status;
  domain_company_id uuid;
  domain_status public.tracking_domain_status;
  owner_company_id uuid;
  owner_user_id uuid;
  owner_role public.company_role;
  owner_status public.company_membership_status;
  actor_can_manage_all boolean;
begin
  actor_user_id := private.current_actor_user_id();
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  actor_can_manage_all :=
    actor_is_platform_admin
    or private.has_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    );

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.offer_id is distinct from old.offer_id
      or new.owner_membership_id is distinct from old.owner_membership_id
      or new.tracking_code is distinct from old.tracking_code
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Tracking-link identity, company, offer, owner, code, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.tracking_domain_id is distinct from old.tracking_domain_id
        or new.custom_slug is distinct from old.custom_slug
        or new.destination_url is distinct from old.destination_url
        or new.query_parameters is distinct from old.query_parameters
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived tracking link is immutable.';
    end if;

    if new.status is distinct from old.status
      and not (
        (old.status = 'draft' and new.status in ('active', 'archived'))
        or (old.status = 'active' and new.status in ('paused', 'archived'))
        or (old.status = 'paused' and new.status in ('active', 'archived'))
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'The requested tracking-link status transition is invalid.';
    end if;
  end if;

  if not exists (
    select 1
    from public.companies as company
    where company.id = target_company_id
      and company.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Tracking links require an active company.';
  end if;

  select
    offer.company_id,
    offer.status
  into
    offer_company_id,
    offer_status
  from public.offers as offer
  where offer.id = new.offer_id;

  if offer_company_id is null
    or offer_company_id <> target_company_id
  then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking-link offer must belong to the same company.';
  end if;

  select
    domain.company_id,
    domain.status
  into
    domain_company_id,
    domain_status
  from public.tracking_domains as domain
  where domain.id = new.tracking_domain_id;

  if domain_company_id is null
    or domain_company_id <> target_company_id
  then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking domain must belong to the same company.';
  end if;

  select
    membership.company_id,
    membership.user_id,
    membership.role,
    membership.status
  into
    owner_company_id,
    owner_user_id,
    owner_role,
    owner_status
  from public.company_memberships as membership
  where membership.id = new.owner_membership_id;

  if owner_company_id is null
    or owner_company_id <> target_company_id
    or owner_role not in ('manager', 'publisher')
    or owner_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking-link owner must be an active Manager or Publisher in the same company.';
  end if;

  if not actor_can_manage_all
    and (
      actor_user_id is null
      or actor_user_id <> owner_user_id
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Managers and Publishers can modify only their own tracking links.';
  end if;

  if new.status = 'active' then
    if offer_status <> 'active' then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active offer.';
    end if;

    if domain_status <> 'active' then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active verified tracking domain.';
    end if;

    if not exists (
      select 1
      from public.offer_assignments as assignment
      where assignment.company_id = target_company_id
        and assignment.offer_id = new.offer_id
        and assignment.membership_id = new.owner_membership_id
        and assignment.status = 'active'
    ) then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active offer assignment for its owner.';
    end if;
  end if;

  new.updated_by := actor_user_id;

  return new;
end;
$function$;

create trigger tracking_links_enforce_write_rules
before insert or update
on public.tracking_links
for each row
execute function private.enforce_tracking_link_write_rules();

create or replace function private.can_view_tracking_link(
  target_company_id uuid,
  target_owner_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    private.is_platform_super_admin()
    or private.has_company_role(
      target_company_id,
      array[
        'company_admin',
        'manager'
      ]::public.company_role[]
    )
    or exists (
      select 1
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.id = target_owner_membership_id
        and membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.role = 'publisher'
        and membership.status = 'active'
        and company.status = 'active'
    );
$function$;

create or replace function private.can_write_tracking_link(
  target_company_id uuid,
  target_owner_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    private.is_platform_super_admin()
    or private.has_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
    or exists (
      select 1
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.id = target_owner_membership_id
        and membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.role in ('manager', 'publisher')
        and membership.status = 'active'
        and company.status = 'active'
    );
$function$;

alter table public.tracking_links
  enable row level security;

create policy tracking_links_select_authorized
on public.tracking_links
for select
to authenticated
using (
  private.can_view_tracking_link(
    company_id,
    owner_membership_id
  )
);

create policy tracking_links_insert_authorized
on public.tracking_links
for insert
to authenticated
with check (
  private.can_write_tracking_link(
    company_id,
    owner_membership_id
  )
);

create policy tracking_links_update_authorized
on public.tracking_links
for update
to authenticated
using (
  private.can_write_tracking_link(
    company_id,
    owner_membership_id
  )
)
with check (
  private.can_write_tracking_link(
    company_id,
    owner_membership_id
  )
);

create or replace function public.resolve_public_tracking_link(
  target_hostname text,
  target_public_token text
)
returns table (
  tracking_link_id uuid,
  company_id uuid,
  offer_id uuid,
  tracking_domain_id uuid,
  owner_membership_id uuid,
  destination_url text,
  query_parameters jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    link.id as tracking_link_id,
    link.company_id,
    link.offer_id,
    link.tracking_domain_id,
    link.owner_membership_id,
    link.destination_url,
    link.query_parameters
  from public.tracking_links as link
  inner join public.tracking_domains as domain
    on domain.id = link.tracking_domain_id
  inner join public.offers as offer
    on offer.id = link.offer_id
  inner join public.company_memberships as membership
    on membership.id = link.owner_membership_id
  inner join public.offer_assignments as assignment
    on assignment.company_id = link.company_id
    and assignment.offer_id = link.offer_id
    and assignment.membership_id = link.owner_membership_id
  inner join public.companies as company
    on company.id = link.company_id
  where lower(domain.hostname) = lower(btrim(target_hostname, '.'))
    and (
      link.tracking_code = lower(target_public_token)
      or link.custom_slug = lower(target_public_token)
    )
    and link.status = 'active'
    and domain.status = 'active'
    and offer.status = 'active'
    and membership.status = 'active'
    and membership.role in ('manager', 'publisher')
    and assignment.status = 'active'
    and company.status = 'active'
  order by
    case
      when link.custom_slug = lower(target_public_token) then 0
      else 1
    end,
    link.id
  limit 1;
$function$;

revoke all
on public.tracking_links
from anon, authenticated;

grant select, insert, update
on public.tracking_links
to authenticated;

grant all
on public.tracking_links
to service_role;

revoke all
on function private.tracking_link_query_parameters_valid(jsonb),
   private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid),
   public.resolve_public_tracking_link(text, text)
from public;

grant execute
on function private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.resolve_public_tracking_link(text, text)
to anon, authenticated, service_role;

commit;