begin;

create type public.tracking_link_source as enum (
  'manual',
  'publisher_assignment'
);

alter table public.tracking_links
  add column source public.tracking_link_source
    not null
    default 'manual'::public.tracking_link_source;

create unique index tracking_links_publisher_assignment_identity_unique
  on public.tracking_links (
    company_id,
    offer_id,
    owner_membership_id
  )
  where source = 'publisher_assignment';

comment on column public.tracking_links.source is
  'Immutable origin of the tracking link. Manual API links are never mutated by assignment synchronization.';

create or replace function private.can_read_company_operations(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array[
      'company_admin',
      'manager',
      'publisher'
    ]::public.company_role[]
  );
$function$;

create or replace function private.can_manage_company_configuration(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );
$function$;

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
    private.has_tenant_company_role(
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
        and private.has_tenant_company_role(
          target_company_id,
          array['publisher']::public.company_role[]
        )
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
    private.has_tenant_company_role(
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
        and private.has_tenant_company_role(
          target_company_id,
          array['manager', 'publisher']::public.company_role[]
        )
    );
$function$;

create or replace function private.can_view_tracking_click(
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
    private.has_tenant_company_role(
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
        and private.has_tenant_company_role(
          target_company_id,
          array['publisher']::public.company_role[]
        )
    );
$function$;

create or replace function private.can_view_duplicate_protection_rule(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  );
$function$;

create or replace function private.can_write_duplicate_protection_rule(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );
$function$;

create or replace function private.can_view_network_postback_endpoint(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array['company_admin', 'manager']::public.company_role[]
  );
$function$;

create or replace function private.can_write_network_postback_endpoint(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );
$function$;

create or replace function private.can_view_conversion(
  target_company_id uuid,
  target_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    private.has_tenant_company_role(
      target_company_id,
      array['company_admin', 'manager']::public.company_role[]
    )
    or (
      target_owner_user_id = private.current_actor_user_id()
      and private.has_tenant_company_role(
        target_company_id,
        array['publisher']::public.company_role[]
      )
    );
$function$;

create or replace function private.enforce_tracking_link_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id uuid;
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
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  actor_can_manage_all := private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.offer_id is distinct from old.offer_id
      or new.owner_membership_id is distinct from old.owner_membership_id
      or new.tracking_code is distinct from old.tracking_code
      or new.source is distinct from old.source
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Tracking-link identity, company, offer, owner, code, source, and creation fields are immutable.';
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

  select offer.company_id, offer.status
  into offer_company_id, offer_status
  from public.offers as offer
  where offer.id = new.offer_id;

  if offer_company_id is null or offer_company_id <> target_company_id then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking-link offer must belong to the same company.';
  end if;

  select domain.company_id, domain.status
  into domain_company_id, domain_status
  from public.tracking_domains as domain
  where domain.id = new.tracking_domain_id;

  if domain_company_id is null or domain_company_id <> target_company_id then
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
    and (actor_user_id is null or actor_user_id <> owner_user_id)
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

create or replace function private.ensure_publisher_offer_tracking_link(
  target_company_id uuid,
  target_offer_id uuid,
  target_publisher_membership_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  original_actor_setting text;
  publisher_user_id uuid;
  target_tracking_domain_id uuid;
  target_destination_url text;
  existing_link_id uuid;
  existing_link_status public.tracking_link_status;
  resolved_link_id uuid;
begin
  original_actor_setting := current_setting('app.current_actor_user_id', true);

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_company_id::text || ':' || target_offer_id::text || ':' ||
      target_publisher_membership_id::text,
      0
    )
  );

  select
    publisher.user_id,
    configuration.tracking_domain_id,
    offer.destination_url
  into
    publisher_user_id,
    target_tracking_domain_id,
    target_destination_url
  from public.company_memberships as publisher
  inner join public.offer_assignments as publisher_assignment
    on publisher_assignment.company_id = publisher.company_id
   and publisher_assignment.membership_id = publisher.id
   and publisher_assignment.offer_id = target_offer_id
   and publisher_assignment.manager_membership_id is not null
   and publisher_assignment.status = 'active'
  inner join public.offer_assignments as manager_assignment
    on manager_assignment.company_id = publisher_assignment.company_id
   and manager_assignment.offer_id = publisher_assignment.offer_id
   and manager_assignment.membership_id = publisher_assignment.manager_membership_id
   and manager_assignment.manager_membership_id is null
   and manager_assignment.status = 'active'
  inner join public.offers as offer
    on offer.id = publisher_assignment.offer_id
   and offer.company_id = publisher_assignment.company_id
   and offer.status = 'active'
  inner join public.offer_operational_configurations as configuration
    on configuration.offer_id = offer.id
   and configuration.company_id = offer.company_id
  inner join public.tracking_domains as domain
    on domain.id = configuration.tracking_domain_id
   and domain.company_id = offer.company_id
   and domain.status = 'active'
  inner join public.companies as company
    on company.id = offer.company_id
   and company.status = 'active'
  where publisher.id = target_publisher_membership_id
    and publisher.company_id = target_company_id
    and publisher.role = 'publisher'
    and publisher.status = 'active'
  limit 1;

  if publisher_user_id is null
    or target_tracking_domain_id is null
    or target_destination_url is null
  then
    return null;
  end if;

  select link.id, link.status
  into existing_link_id, existing_link_status
  from public.tracking_links as link
  where link.company_id = target_company_id
    and link.offer_id = target_offer_id
    and link.owner_membership_id = target_publisher_membership_id
    and link.source = 'publisher_assignment'
  order by link.updated_at desc, link.id desc
  limit 1
  for update;

  if existing_link_id is not null and existing_link_status = 'archived' then
    return existing_link_id;
  end if;

  perform set_config('app.current_actor_user_id', publisher_user_id::text, true);

  if existing_link_id is null then
    insert into public.tracking_links (
      company_id,
      offer_id,
      tracking_domain_id,
      owner_membership_id,
      tracking_code,
      custom_slug,
      destination_url,
      query_parameters,
      source,
      status,
      created_by,
      updated_by
    )
    values (
      target_company_id,
      target_offer_id,
      target_tracking_domain_id,
      target_publisher_membership_id,
      substr(
        md5(
          target_company_id::text || ':' || target_offer_id::text || ':' ||
          target_publisher_membership_id::text || ':' ||
          clock_timestamp()::text || ':' || random()::text
        ),
        1,
        16
      ),
      null,
      target_destination_url,
      '{}'::jsonb,
      'publisher_assignment'::public.tracking_link_source,
      'active'::public.tracking_link_status,
      publisher_user_id,
      publisher_user_id
    )
    returning id into resolved_link_id;
  else
    update public.tracking_links
    set
      tracking_domain_id = target_tracking_domain_id,
      destination_url = target_destination_url,
      updated_by = publisher_user_id
    where id = existing_link_id
    returning id into resolved_link_id;
  end if;

  perform set_config(
    'app.current_actor_user_id',
    coalesce(original_actor_setting, ''),
    true
  );

  return resolved_link_id;
exception
  when others then
    perform set_config(
      'app.current_actor_user_id',
      coalesce(original_actor_setting, ''),
      true
    );
    raise;
end;
$function$;

create or replace function private.provision_publisher_tracking_links_from_offer_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  publisher_assignment record;
begin
  if new.status = 'active'
    and old.status is distinct from new.status
  then
    for publisher_assignment in
      select assignment.membership_id
      from public.offer_assignments as assignment
      inner join public.company_memberships as membership
        on membership.id = assignment.membership_id
       and membership.company_id = assignment.company_id
       and membership.role = 'publisher'
       and membership.status = 'active'
      where assignment.company_id = new.company_id
        and assignment.offer_id = new.id
        and assignment.manager_membership_id is not null
        and assignment.status = 'active'
    loop
      perform private.ensure_publisher_offer_tracking_link(
        new.company_id,
        new.id,
        publisher_assignment.membership_id
      );
    end loop;
  end if;

  return new;
end;
$function$;

drop trigger if exists offers_provision_publisher_tracking_links_on_activation
on public.offers;

create trigger offers_provision_publisher_tracking_links_on_activation
after update of status
on public.offers
for each row
execute function private.provision_publisher_tracking_links_from_offer_status();

revoke all
on function private.can_read_company_operations(uuid),
   private.can_manage_company_configuration(uuid),
   private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid),
   private.can_view_tracking_click(uuid, uuid),
   private.can_view_duplicate_protection_rule(uuid),
   private.can_write_duplicate_protection_rule(uuid),
   private.can_view_network_postback_endpoint(uuid),
   private.can_write_network_postback_endpoint(uuid),
   private.can_view_conversion(uuid, uuid)
from public;

grant execute
on function private.can_read_company_operations(uuid),
   private.can_manage_company_configuration(uuid),
   private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid),
   private.can_view_tracking_click(uuid, uuid),
   private.can_view_duplicate_protection_rule(uuid),
   private.can_write_duplicate_protection_rule(uuid),
   private.can_view_network_postback_endpoint(uuid),
   private.can_write_network_postback_endpoint(uuid),
   private.can_view_conversion(uuid, uuid)
to authenticated, service_role;

revoke all
on function private.enforce_tracking_link_write_rules(),
   private.ensure_publisher_offer_tracking_link(uuid, uuid, uuid),
   private.provision_publisher_tracking_links_from_offer_status()
from public, anon, authenticated;

commit;
