begin;

create or replace function private.has_company_access(
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
    or exists (
      select 1
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.status = 'active'
        and company.status = 'active'
    );
$function$;

create or replace function private.has_company_role(
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
    private.is_platform_super_admin()
    or exists (
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

create or replace function private.can_view_user_profile(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    target_user_id = private.current_actor_user_id()
    or private.is_platform_super_admin()
    or exists (
      select 1
      from public.company_memberships as actor_membership
      inner join public.company_memberships as target_membership
        on target_membership.company_id = actor_membership.company_id
      inner join public.companies as company
        on company.id = actor_membership.company_id
      where actor_membership.user_id = private.current_actor_user_id()
        and actor_membership.status = 'active'
        and actor_membership.role in ('company_admin', 'manager')
        and target_membership.user_id = target_user_id
        and target_membership.status in (
          'invited',
          'active',
          'suspended'
        )
        and company.status = 'active'
    );
$function$;

create or replace function private.enforce_company_update_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.id is distinct from old.id
    or new.slug is distinct from old.slug
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception
      using
        errcode = '42501',
        message = 'Company identity and creation fields are immutable.';
  end if;

  if new.status is distinct from old.status
    and not private.is_platform_super_admin()
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin can change company status.';
  end if;

  if old.status = 'archived'
    and new.status <> 'archived'
  then
    raise exception
      using
        errcode = '23514',
        message = 'An archived company cannot be reactivated or suspended.';
  end if;

  return new;
end;
$function$;

drop trigger if exists companies_enforce_update_rules
on public.companies;

create trigger companies_enforce_update_rules
before update on public.companies
for each row
execute function private.enforce_company_update_rules();

create or replace function private.enforce_user_profile_update_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.user_id is distinct from old.user_id
    or new.platform_role is distinct from old.platform_role
    or new.created_at is distinct from old.created_at
  then
    raise exception
      using
        errcode = '42501',
        message = 'User identity, platform role, and creation fields are immutable.';
  end if;

  if new.status is distinct from old.status then
    if not private.is_platform_super_admin() then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin can change user status.';
    end if;

    if new.user_id = private.current_actor_user_id()
      and new.status = 'suspended'
    then
      raise exception
        using
          errcode = '23514',
          message = 'A Platform Super Admin cannot suspend their own account.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists user_profiles_enforce_update_rules
on public.user_profiles;

create trigger user_profiles_enforce_update_rules
before update on public.user_profiles
for each row
execute function private.enforce_user_profile_update_rules();

drop policy if exists user_profiles_update_platform_admin
on public.user_profiles;

create policy user_profiles_update_platform_admin
on public.user_profiles
for update
to authenticated
using (
  private.is_platform_super_admin()
)
with check (
  private.is_platform_super_admin()
);

grant update (
  status
)
on public.user_profiles
to authenticated;

create index if not exists user_profiles_status_updated_at_idx
  on public.user_profiles (status, updated_at desc, user_id);

create index if not exists audit_events_company_event_created_at_idx
  on public.audit_events (
    company_id,
    event_name,
    created_at desc,
    id desc
  );

commit;
