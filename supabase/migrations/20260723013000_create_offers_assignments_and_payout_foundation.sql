begin;

create type public.offer_status as enum (
  'draft',
  'active',
  'paused',
  'archived'
);

create type public.payout_mode as enum (
  'fixed_member',
  'per_offer'
);

create type public.offer_assignment_status as enum (
  'active',
  'paused',
  'revoked'
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  network_account_id uuid not null
    references public.network_accounts (id)
    on delete restrict,
  code text not null,
  external_offer_id text,
  name text not null,
  description text,
  destination_url text not null,
  status public.offer_status not null default 'draft',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint offers_company_code_unique
    unique (company_id, code),

  constraint offers_code_check
    check (
      code = lower(code)
      and code ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'
      and char_length(code) between 2 and 80
    ),

  constraint offers_external_offer_id_check
    check (
      external_offer_id is null
      or char_length(btrim(external_offer_id)) between 1 and 255
    ),

  constraint offers_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint offers_description_check
    check (
      description is null
      or char_length(btrim(description)) between 1 and 4000
    ),

  constraint offers_destination_url_check
    check (
      char_length(btrim(destination_url)) between 8 and 2048
      and destination_url ~* '^https?://'
    )
);

create unique index offers_network_external_id_unique
  on public.offers (
    network_account_id,
    external_offer_id
  )
  where external_offer_id is not null;

create index offers_company_status_created_at_idx
  on public.offers (
    company_id,
    status,
    created_at desc,
    id desc
  );

create index offers_network_account_status_idx
  on public.offers (
    network_account_id,
    status,
    updated_at desc,
    id desc
  );

create table public.member_payout_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  membership_id uuid not null
    references public.company_memberships (id)
    on delete cascade,
  mode public.payout_mode not null,
  fixed_payout_amount_minor integer,
  payout_currency text,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_payout_profiles_membership_unique
    unique (membership_id),

  constraint member_payout_profiles_mode_values_check
    check (
      (
        mode = 'fixed_member'
        and fixed_payout_amount_minor is not null
        and fixed_payout_amount_minor between 1 and 2147483647
        and payout_currency is not null
        and payout_currency ~ '^[A-Z]{3}$'
      )
      or (
        mode = 'per_offer'
        and fixed_payout_amount_minor is null
        and payout_currency is null
      )
    )
);

create index member_payout_profiles_company_mode_idx
  on public.member_payout_profiles (
    company_id,
    mode,
    updated_at desc,
    id desc
  );

create table public.offer_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  offer_id uuid not null
    references public.offers (id)
    on delete cascade,
  membership_id uuid not null
    references public.company_memberships (id)
    on delete cascade,
  status public.offer_assignment_status not null default 'active',
  manual_payout_amount_minor integer,
  manual_payout_currency text,
  assigned_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint offer_assignments_offer_membership_unique
    unique (offer_id, membership_id),

  constraint offer_assignments_manual_payout_pair_check
    check (
      (
        manual_payout_amount_minor is null
        and manual_payout_currency is null
      )
      or (
        manual_payout_amount_minor is not null
        and manual_payout_amount_minor between 1 and 2147483647
        and manual_payout_currency is not null
        and manual_payout_currency ~ '^[A-Z]{3}$'
      )
    )
);

create index offer_assignments_company_membership_status_idx
  on public.offer_assignments (
    company_id,
    membership_id,
    status,
    updated_at desc,
    id desc
  );

create index offer_assignments_offer_status_created_at_idx
  on public.offer_assignments (
    offer_id,
    status,
    created_at desc,
    id desc
  );

create trigger offers_set_updated_at
before update on public.offers
for each row
execute function private.set_updated_at();

create trigger member_payout_profiles_set_updated_at
before update on public.member_payout_profiles
for each row
execute function private.set_updated_at();

create trigger offer_assignments_set_updated_at
before update on public.offer_assignments
for each row
execute function private.set_updated_at();

create or replace function private.enforce_offer_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  target_company_id uuid;
  account_company_id uuid;
  account_status public.network_account_status;
begin
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  if not actor_is_platform_admin
    and not private.has_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin or Company Admin can modify offers.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.network_account_id is distinct from old.network_account_id
      or new.code is distinct from old.code
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Offer identity, company, network account, code, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.external_offer_id is distinct from old.external_offer_id
        or new.name is distinct from old.name
        or new.description is distinct from old.description
        or new.destination_url is distinct from old.destination_url
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived offer is immutable.';
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
          message = 'The requested offer status transition is invalid.';
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
        message = 'Offers require an active company.';
  end if;

  select
    account.company_id,
    account.status
  into
    account_company_id,
    account_status
  from public.network_accounts as account
  where account.id = new.network_account_id;

  if account_company_id is null
    or account_company_id <> target_company_id
  then
    raise exception
      using
        errcode = '23514',
        message = 'The offer network account must belong to the same company.';
  end if;

  if new.status = 'active'
    and account_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message = 'An active offer requires an active network account.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create trigger offers_enforce_write_rules
before insert or update
on public.offers
for each row
execute function private.enforce_offer_write_rules();

create or replace function private.enforce_member_payout_profile_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  target_company_id uuid;
  membership_company_id uuid;
  membership_role public.company_role;
  membership_status public.company_membership_status;
begin
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  if not actor_is_platform_admin
    and not private.has_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin or Company Admin can modify payout profiles.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.membership_id is distinct from old.membership_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Payout profile identity, company, membership, and creation fields are immutable.';
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
        message = 'Payout profiles require an active company.';
  end if;

  select
    membership.company_id,
    membership.role,
    membership.status
  into
    membership_company_id,
    membership_role,
    membership_status
  from public.company_memberships as membership
  where membership.id = new.membership_id;

  if membership_company_id is null
    or membership_company_id <> target_company_id
    or membership_role not in ('manager', 'publisher')
    or membership_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message = 'A payout profile requires an active Manager or Publisher membership from the same company.';
  end if;

  if new.mode = 'per_offer'
    and exists (
      select 1
      from public.offer_assignments as assignment
      where assignment.company_id = target_company_id
        and assignment.membership_id = new.membership_id
        and assignment.status <> 'revoked'
        and (
          assignment.manual_payout_amount_minor is null
          or assignment.manual_payout_currency is null
        )
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'Every open assignment requires a manual payout before per_offer mode can be enabled.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create trigger member_payout_profiles_enforce_write_rules
before insert or update
on public.member_payout_profiles
for each row
execute function private.enforce_member_payout_profile_write_rules();

create or replace function private.enforce_offer_assignment_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  target_company_id uuid;
  offer_company_id uuid;
  offer_status public.offer_status;
  membership_company_id uuid;
  membership_role public.company_role;
  membership_status public.company_membership_status;
  profile_mode public.payout_mode;
begin
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  if not actor_is_platform_admin
    and not private.has_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin or Company Admin can modify offer assignments.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.offer_id is distinct from old.offer_id
      or new.membership_id is distinct from old.membership_id
      or new.assigned_by is distinct from old.assigned_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Offer assignment identity, company, offer, membership, and creation fields are immutable.';
    end if;

    if old.status = 'revoked'
      and (
        new.status is distinct from old.status
        or new.manual_payout_amount_minor is distinct from old.manual_payout_amount_minor
        or new.manual_payout_currency is distinct from old.manual_payout_currency
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'A revoked offer assignment is immutable.';
    end if;

    if new.status is distinct from old.status
      and not (
        (old.status = 'active' and new.status in ('paused', 'revoked'))
        or (old.status = 'paused' and new.status in ('active', 'revoked'))
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'The requested offer-assignment status transition is invalid.';
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
        message = 'Offer assignments require an active company.';
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
    or offer_status = 'archived'
  then
    raise exception
      using
        errcode = '23514',
        message = 'The assignment requires a non-archived offer from the same company.';
  end if;

  select
    membership.company_id,
    membership.role,
    membership.status
  into
    membership_company_id,
    membership_role,
    membership_status
  from public.company_memberships as membership
  where membership.id = new.membership_id;

  if membership_company_id is null
    or membership_company_id <> target_company_id
    or membership_role not in ('manager', 'publisher')
    or membership_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message = 'The assignment requires an active Manager or Publisher membership from the same company.';
  end if;

  select profile.mode
  into profile_mode
  from public.member_payout_profiles as profile
  where profile.membership_id = new.membership_id
    and profile.company_id = target_company_id;

  if profile_mode is null then
    raise exception
      using
        errcode = '23514',
        message = 'The assignment requires a member payout profile.';
  end if;

  if new.status <> 'revoked'
    and profile_mode = 'per_offer'
    and (
      new.manual_payout_amount_minor is null
      or new.manual_payout_currency is null
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'per_offer mode requires a manual payout on every open assignment.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create trigger offer_assignments_enforce_write_rules
before insert or update
on public.offer_assignments
for each row
execute function private.enforce_offer_assignment_write_rules();

create or replace function private.can_view_offer(
  target_offer_id uuid,
  target_company_id uuid
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
      from public.offer_assignments as assignment
      inner join public.company_memberships as membership
        on membership.id = assignment.membership_id
      inner join public.offers as offer
        on offer.id = assignment.offer_id
      inner join public.companies as company
        on company.id = assignment.company_id
      where assignment.offer_id = target_offer_id
        and assignment.company_id = target_company_id
        and assignment.status = 'active'
        and membership.user_id = private.current_actor_user_id()
        and membership.role = 'publisher'
        and membership.status = 'active'
        and offer.status = 'active'
        and company.status = 'active'
    );
$function$;

create or replace function private.can_view_payout_profile(
  target_membership_id uuid,
  target_company_id uuid
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
      where membership.id = target_membership_id
        and membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.role in ('manager', 'publisher')
        and membership.status = 'active'
        and company.status = 'active'
    );
$function$;

create or replace function private.can_view_offer_assignment(
  target_membership_id uuid,
  target_company_id uuid
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
      where membership.id = target_membership_id
        and membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.role = 'publisher'
        and membership.status = 'active'
        and company.status = 'active'
    );
$function$;

alter table public.offers
  enable row level security;

alter table public.member_payout_profiles
  enable row level security;

alter table public.offer_assignments
  enable row level security;

create policy offers_select_authorized
on public.offers
for select
to authenticated
using (
  private.can_view_offer(id, company_id)
);

create policy offers_insert_company_admin
on public.offers
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy offers_update_company_admin
on public.offers
for update
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy payout_profiles_select_authorized
on public.member_payout_profiles
for select
to authenticated
using (
  private.can_view_payout_profile(membership_id, company_id)
);

create policy payout_profiles_insert_company_admin
on public.member_payout_profiles
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy payout_profiles_update_company_admin
on public.member_payout_profiles
for update
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy offer_assignments_select_authorized
on public.offer_assignments
for select
to authenticated
using (
  private.can_view_offer_assignment(membership_id, company_id)
);

create policy offer_assignments_insert_company_admin
on public.offer_assignments
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy offer_assignments_update_company_admin
on public.offer_assignments
for update
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

revoke all
on public.offers,
   public.member_payout_profiles,
   public.offer_assignments
from anon, authenticated;

grant select, insert, update
on public.offers,
   public.member_payout_profiles,
   public.offer_assignments
to authenticated;

grant all
on public.offers,
   public.member_payout_profiles,
   public.offer_assignments
to service_role;

revoke all
on function private.can_view_offer(uuid, uuid),
   function private.can_view_payout_profile(uuid, uuid),
   function private.can_view_offer_assignment(uuid, uuid)
from public;

grant execute
on function private.can_view_offer(uuid, uuid),
   function private.can_view_payout_profile(uuid, uuid),
   function private.can_view_offer_assignment(uuid, uuid)
to authenticated, service_role;

commit;