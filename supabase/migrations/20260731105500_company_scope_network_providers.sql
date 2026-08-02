begin;

lock table public.network_providers in share row exclusive mode;
lock table public.network_accounts in share row exclusive mode;
lock table public.tracking_clicks in share row exclusive mode;
lock table public.conversions in share row exclusive mode;

alter table public.network_providers
  add column company_id uuid;

create temporary table provider_company_owners (
  provider_id uuid not null,
  company_id uuid not null,
  primary key (provider_id, company_id)
) on commit drop;

insert into provider_company_owners (
  provider_id,
  company_id
)
select distinct
  account.provider_id,
  account.company_id
from public.network_accounts as account;

insert into provider_company_owners (
  provider_id,
  company_id
)
select
  provider.id,
  (array_agg(distinct event.company_id order by event.company_id))[1]
from public.network_providers as provider
inner join public.audit_events as event
  on event.entity_type = 'network_provider'
  and event.entity_id = provider.id::text
  and event.company_id is not null
where not exists (
  select 1
  from provider_company_owners as owner
  where owner.provider_id = provider.id
)
group by provider.id
having count(distinct event.company_id) = 1
on conflict do nothing;

do $migration$
declare
  unresolved_provider record;
begin
  select
    provider.id,
    provider.code,
    provider.name
  into unresolved_provider
  from public.network_providers as provider
  where not exists (
    select 1
    from provider_company_owners as owner
    where owner.provider_id = provider.id
  )
  order by provider.created_at asc, provider.id asc
  limit 1;

  if found then
    raise exception
      using
        errcode = '23514',
        message = format(
          'Network provider %s (%s) has no deterministic company owner. Assign it to a company before applying this migration.',
          unresolved_provider.code,
          unresolved_provider.id
        );
  end if;
end;
$migration$;

create temporary table provider_company_map (
  old_provider_id uuid not null,
  company_id uuid not null,
  new_provider_id uuid not null,
  owner_rank integer not null,
  primary key (old_provider_id, company_id),
  unique (new_provider_id)
) on commit drop;

insert into provider_company_map (
  old_provider_id,
  company_id,
  new_provider_id,
  owner_rank
)
select
  ranked.provider_id,
  ranked.company_id,
  case
    when ranked.owner_rank = 1 then ranked.provider_id
    else gen_random_uuid()
  end,
  ranked.owner_rank
from (
  select
    owner.provider_id,
    owner.company_id,
    (
      row_number() over (
        partition by owner.provider_id
        order by owner.company_id
      )
    )::integer as owner_rank
  from provider_company_owners as owner
) as ranked;

alter table public.network_providers
  disable trigger user;

alter table public.network_accounts
  disable trigger user;

alter table public.tracking_clicks
  disable trigger user;

alter table public.conversions
  disable trigger user;

alter table public.network_providers
  drop constraint if exists network_providers_code_unique;

update public.network_providers as provider
set company_id = mapping.company_id
from provider_company_map as mapping
where mapping.old_provider_id = provider.id
  and mapping.owner_rank = 1;

insert into public.network_providers (
  id,
  company_id,
  code,
  name,
  status,
  website_url,
  documentation_url,
  created_by,
  created_at,
  updated_at
)
select
  mapping.new_provider_id,
  mapping.company_id,
  provider.code,
  provider.name,
  provider.status,
  provider.website_url,
  provider.documentation_url,
  provider.created_by,
  provider.created_at,
  provider.updated_at
from provider_company_map as mapping
inner join public.network_providers as provider
  on provider.id = mapping.old_provider_id
where mapping.owner_rank > 1;

update public.network_accounts as account
set provider_id = mapping.new_provider_id
from provider_company_map as mapping
where account.provider_id = mapping.old_provider_id
  and account.company_id = mapping.company_id
  and account.provider_id is distinct from mapping.new_provider_id;

update public.tracking_clicks as click
set
  network_provider_id = mapping.new_provider_id,
  network_snapshot = jsonb_set(
    click.network_snapshot,
    '{providerId}',
    to_jsonb(mapping.new_provider_id::text),
    true
  )
from provider_company_map as mapping
where click.network_provider_id = mapping.old_provider_id
  and click.company_id = mapping.company_id
  and click.network_provider_id is distinct from mapping.new_provider_id;

update public.conversions as conversion
set network_provider_id = mapping.new_provider_id
from provider_company_map as mapping
where conversion.network_provider_id = mapping.old_provider_id
  and conversion.company_id = mapping.company_id
  and conversion.network_provider_id is distinct from mapping.new_provider_id;

alter table public.network_providers
  enable trigger user;

alter table public.network_accounts
  enable trigger user;

alter table public.tracking_clicks
  enable trigger user;

alter table public.conversions
  enable trigger user;

alter table public.network_providers
  alter column company_id set not null;

alter table public.network_providers
  add constraint network_providers_company_id_fkey
  foreign key (company_id)
  references public.companies (id)
  on delete cascade;

alter table public.network_providers
  add constraint network_providers_company_code_unique
  unique (company_id, code);

alter table public.network_providers
  add constraint network_providers_company_id_id_unique
  unique (company_id, id);

alter table public.network_accounts
  drop constraint if exists network_accounts_provider_id_fkey;

alter table public.network_accounts
  add constraint network_accounts_company_provider_fkey
  foreign key (company_id, provider_id)
  references public.network_providers (company_id, id)
  on delete restrict;

alter table public.tracking_clicks
  drop constraint if exists tracking_clicks_network_provider_id_fkey;

alter table public.tracking_clicks
  add constraint tracking_clicks_company_provider_fkey
  foreign key (company_id, network_provider_id)
  references public.network_providers (company_id, id)
  on delete restrict;

alter table public.conversions
  drop constraint if exists conversions_network_provider_id_fkey;

alter table public.conversions
  add constraint conversions_company_provider_fkey
  foreign key (company_id, network_provider_id)
  references public.network_providers (company_id, id)
  on delete restrict;

drop index if exists public.network_providers_status_created_at_idx;

create index network_providers_company_status_created_at_idx
  on public.network_providers (
    company_id,
    status,
    created_at desc,
    id desc
  );

create or replace function private.has_tenant_company_role(
  target_company_id uuid,
  allowed_roles public.company_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    not private.is_platform_super_admin()
    and exists (
      select 1
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
        and company.status = 'active'
    );
$function$;

create or replace function private.enforce_network_provider_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_company_id uuid;
begin
  target_company_id := case
    when tg_op = 'INSERT' then new.company_id
    else old.company_id
  end;

  if not private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  ) then
    raise exception
      using
        errcode = '42501',
        message = 'Only the owning Company Admin can modify network providers.';
  end if;

  if private.current_company_id() is distinct from target_company_id then
    raise exception
      using
        errcode = '42501',
        message = 'The provider company must match the active request company.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.code is distinct from old.code
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Network provider identity, company, code, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.name is distinct from old.name
        or new.status is distinct from old.status
        or new.website_url is distinct from old.website_url
        or new.documentation_url is distinct from old.documentation_url
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived network provider is immutable.';
    end if;

    if old.status = 'active'
      and new.status = 'archived'
      and exists (
        select 1
        from public.network_accounts as account
        where account.company_id = old.company_id
          and account.provider_id = old.id
          and account.status <> 'archived'
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'A network provider with open company accounts cannot be archived.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.enforce_network_account_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_company_id uuid;
begin
  target_company_id := case
    when tg_op = 'INSERT' then new.company_id
    else old.company_id
  end;

  if not private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  ) then
    raise exception
      using
        errcode = '42501',
        message = 'Only the owning Company Admin can modify network accounts.';
  end if;

  if private.current_company_id() is distinct from target_company_id then
    raise exception
      using
        errcode = '42501',
        message = 'The network-account company must match the active request company.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.provider_id is distinct from old.provider_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Network account identity, company, provider, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.name is distinct from old.name
        or new.external_account_id is distinct from old.external_account_id
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived network account is immutable.';
    end if;
  end if;

  if not exists (
    select 1
    from public.network_providers as provider
    where provider.id = new.provider_id
      and provider.company_id = target_company_id
      and provider.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'The network account requires an active provider owned by the same company.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create or replace function private.reject_platform_super_admin_operational_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if private.is_platform_super_admin() then
    raise exception
      using
        errcode = '42501',
        message = 'Platform Super Admin cannot modify company operational data.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

drop trigger if exists aaa_reject_platform_admin_write
on public.offers;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.offers
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.offer_assignments;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.offer_assignments
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.member_payout_profiles;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.member_payout_profiles
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.network_account_operational_configurations;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.network_account_operational_configurations
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.offer_operational_configurations;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.offer_operational_configurations
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.network_postback_endpoints;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.network_postback_endpoints
for each row
execute function private.reject_platform_super_admin_operational_write();

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
    private.has_tenant_company_role(
      target_company_id,
      array[
        'company_admin',
        'manager'
      ]::public.company_role[]
    )
    or (
      not private.is_platform_super_admin()
      and exists (
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
      )
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
    private.has_tenant_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
    or (
      not private.is_platform_super_admin()
      and exists (
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
      )
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
    private.has_tenant_company_role(
      target_company_id,
      array[
        'company_admin',
        'manager'
      ]::public.company_role[]
    )
    or (
      not private.is_platform_super_admin()
      and exists (
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
    or (
      not private.is_platform_super_admin()
      and exists (
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
      )
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
      not private.is_platform_super_admin()
      and target_owner_user_id = private.current_actor_user_id()
      and private.has_tenant_company_role(
        target_company_id,
        array['publisher']::public.company_role[]
      )
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
    or (
      not private.is_platform_super_admin()
      and exists (
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
    or (
      not private.is_platform_super_admin()
      and exists (
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

create or replace function private.can_manage_publisher_configuration(
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

drop trigger if exists aaa_reject_platform_admin_write
on public.tracking_links;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.tracking_links
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.duplicate_protection_rules;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.duplicate_protection_rules
for each row
execute function private.reject_platform_super_admin_operational_write();

drop trigger if exists aaa_reject_platform_admin_write
on public.publisher_operational_configurations;

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.publisher_operational_configurations
for each row
execute function private.reject_platform_super_admin_operational_write();

drop policy if exists network_providers_select_authorized
on public.network_providers;

drop policy if exists network_providers_insert_platform_admin
on public.network_providers;

drop policy if exists network_providers_insert_authorized
on public.network_providers;

drop policy if exists network_providers_update_platform_admin
on public.network_providers;

create policy network_providers_select_company
on public.network_providers
for select
to authenticated
using (
  private.has_tenant_company_role(
    company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  )
);

create policy network_providers_insert_company_admin
on public.network_providers
for insert
to authenticated
with check (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy network_providers_update_company_admin
on public.network_providers
for update
to authenticated
using (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

drop policy if exists network_accounts_select_authorized
on public.network_accounts;

drop policy if exists network_accounts_insert_company_admin
on public.network_accounts;

drop policy if exists network_accounts_update_company_admin
on public.network_accounts;

create policy network_accounts_select_company
on public.network_accounts
for select
to authenticated
using (
  private.has_tenant_company_role(
    company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  )
);

create policy network_accounts_insert_company_admin
on public.network_accounts
for insert
to authenticated
with check (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy network_accounts_update_company_admin
on public.network_accounts
for update
to authenticated
using (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

revoke all
on function private.has_tenant_company_role(
     uuid,
     public.company_role[]
   ),
   private.enforce_network_provider_write_rules(),
   private.enforce_network_account_write_rules(),
   private.reject_platform_super_admin_operational_write(),
   private.can_read_company_operations(uuid),
   private.can_manage_company_configuration(uuid),
   private.can_view_offer(uuid, uuid),
   private.can_view_payout_profile(uuid, uuid),
   private.can_view_offer_assignment(uuid, uuid),
   private.can_view_tracking_click(uuid, uuid),
   private.can_view_network_postback_endpoint(uuid),
   private.can_write_network_postback_endpoint(uuid),
   private.can_view_conversion(uuid, uuid),
   private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid),
   private.can_view_duplicate_protection_rule(uuid),
   private.can_write_duplicate_protection_rule(uuid),
   private.can_manage_publisher_configuration(uuid)
from public;

grant execute
on function private.has_tenant_company_role(
     uuid,
     public.company_role[]
   ),
   private.can_read_company_operations(uuid),
   private.can_manage_company_configuration(uuid),
   private.can_view_offer(uuid, uuid),
   private.can_view_payout_profile(uuid, uuid),
   private.can_view_offer_assignment(uuid, uuid),
   private.can_view_tracking_click(uuid, uuid),
   private.can_view_network_postback_endpoint(uuid),
   private.can_write_network_postback_endpoint(uuid),
   private.can_view_conversion(uuid, uuid),
   private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid),
   private.can_view_duplicate_protection_rule(uuid),
   private.can_write_duplicate_protection_rule(uuid),
   private.can_manage_publisher_configuration(uuid)
to authenticated, service_role;

grant execute
on function private.enforce_network_provider_write_rules(),
   private.enforce_network_account_write_rules(),
   private.reject_platform_super_admin_operational_write()
to service_role;

commit;
