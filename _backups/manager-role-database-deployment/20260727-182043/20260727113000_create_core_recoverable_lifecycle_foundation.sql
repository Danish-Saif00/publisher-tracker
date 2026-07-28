begin;

-- Core recoverable lifecycle foundation.
--
-- This migration:
--   * blocks physical deletion of core tenancy records;
--   * adds recoverable lifecycle metadata to companies and memberships;
--   * permits safe restore transitions;
--   * scopes Manager membership visibility/management to owned Publishers;
--   * records lifecycle transitions in the existing audit_events table.
--
-- Applied historical migrations are intentionally left unchanged.

alter table public.companies
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references auth.users (id)
    on delete set null,
  add column if not exists deleted_reason text,
  add column if not exists status_before_deletion public.company_status,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid
    references auth.users (id)
    on delete set null;

alter table public.company_memberships
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references auth.users (id)
    on delete set null,
  add column if not exists deleted_reason text,
  add column if not exists status_before_deletion public.company_membership_status,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid
    references auth.users (id)
    on delete set null;

update public.companies
set
  deleted_at = coalesce(deleted_at, updated_at, created_at, now()),
  deleted_reason = coalesce(
    nullif(btrim(deleted_reason), ''),
    'Legacy archived record; the original deletion reason is unavailable.'
  )
where status = 'archived'
  and deleted_at is null;

update public.company_memberships
set
  deleted_at = coalesce(deleted_at, updated_at, created_at, now()),
  deleted_reason = coalesce(
    nullif(btrim(deleted_reason), ''),
    'Legacy revoked record; the original deletion reason is unavailable.'
  )
where status = 'revoked'
  and deleted_at is null;

alter table public.companies
  drop constraint if exists companies_deleted_reason_check;

alter table public.companies
  add constraint companies_deleted_reason_check
  check (
    deleted_reason is null
    or char_length(btrim(deleted_reason)) between 1 and 1000
  );

alter table public.companies
  drop constraint if exists companies_lifecycle_state_check;

alter table public.companies
  add constraint companies_lifecycle_state_check
  check (
    (
      status = 'archived'
      and deleted_at is not null
    )
    or (
      status <> 'archived'
      and deleted_at is null
      and deleted_by is null
      and deleted_reason is null
      and status_before_deletion is null
    )
  );

alter table public.company_memberships
  drop constraint if exists company_memberships_deleted_reason_check;

alter table public.company_memberships
  add constraint company_memberships_deleted_reason_check
  check (
    deleted_reason is null
    or char_length(btrim(deleted_reason)) between 1 and 1000
  );

alter table public.company_memberships
  drop constraint if exists company_memberships_lifecycle_state_check;

alter table public.company_memberships
  add constraint company_memberships_lifecycle_state_check
  check (
    (
      status = 'revoked'
      and deleted_at is not null
    )
    or (
      status <> 'revoked'
      and deleted_at is null
      and deleted_by is null
      and deleted_reason is null
      and status_before_deletion is null
    )
  );

create index if not exists companies_lifecycle_status_deleted_at_idx
  on public.companies (
    status,
    deleted_at desc,
    id
  );

create index if not exists company_memberships_lifecycle_scope_idx
  on public.company_memberships (
    company_id,
    role,
    status,
    deleted_at desc,
    id
  );

create index if not exists company_memberships_invited_by_role_status_idx
  on public.company_memberships (
    invited_by,
    role,
    status,
    company_id,
    id
  )
  where invited_by is not null;

-- Replace destructive cascade behavior with deletion protection.
alter table public.user_profiles
  drop constraint if exists user_profiles_user_id_fkey;

alter table public.user_profiles
  add constraint user_profiles_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete restrict;

alter table public.company_memberships
  drop constraint if exists company_memberships_company_id_fkey;

alter table public.company_memberships
  add constraint company_memberships_company_id_fkey
  foreign key (company_id)
  references public.companies (id)
  on delete restrict;

alter table public.company_memberships
  drop constraint if exists company_memberships_user_id_fkey;

alter table public.company_memberships
  add constraint company_memberships_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete restrict;

create or replace function private.prevent_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception
    using
      errcode = '23503',
      message = format(
        'Physical deletion from public.%I is disabled. Use the recoverable lifecycle status instead.',
        tg_table_name
      );
end;
$function$;

drop trigger if exists companies_prevent_hard_delete
on public.companies;

create trigger companies_prevent_hard_delete
before delete on public.companies
for each row
execute function private.prevent_hard_delete();

drop trigger if exists user_profiles_prevent_hard_delete
on public.user_profiles;

create trigger user_profiles_prevent_hard_delete
before delete on public.user_profiles
for each row
execute function private.prevent_hard_delete();

drop trigger if exists company_memberships_prevent_hard_delete
on public.company_memberships;

create trigger company_memberships_prevent_hard_delete
before delete on public.company_memberships
for each row
execute function private.prevent_hard_delete();

drop trigger if exists audit_events_prevent_hard_delete
on public.audit_events;

create trigger audit_events_prevent_hard_delete
before delete on public.audit_events
for each row
execute function private.prevent_hard_delete();

create or replace function private.can_view_company_membership(
  target_membership_id uuid
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
      from public.company_memberships as target_membership
      where target_membership.id = target_membership_id
        and target_membership.user_id = private.current_actor_user_id()
    )
    or exists (
      select 1
      from public.company_memberships as actor_membership
      inner join public.companies as company
        on company.id = actor_membership.company_id
      inner join public.company_memberships as target_membership
        on target_membership.company_id = actor_membership.company_id
       and target_membership.id = target_membership_id
      where actor_membership.user_id = private.current_actor_user_id()
        and actor_membership.status = 'active'
        and actor_membership.role = 'company_admin'
        and company.status = 'active'
    )
    or exists (
      select 1
      from public.company_memberships as actor_membership
      inner join public.companies as company
        on company.id = actor_membership.company_id
      inner join public.company_memberships as target_membership
        on target_membership.company_id = actor_membership.company_id
       and target_membership.id = target_membership_id
      where actor_membership.user_id = private.current_actor_user_id()
        and actor_membership.status = 'active'
        and actor_membership.role = 'manager'
        and company.status = 'active'
        and target_membership.role = 'publisher'
        and (
          target_membership.invited_by = actor_membership.user_id
          or exists (
            select 1
            from public.offer_assignments as publisher_assignment
            where publisher_assignment.company_id = actor_membership.company_id
              and publisher_assignment.membership_id = target_membership.id
              and publisher_assignment.manager_membership_id = actor_membership.id
          )
        )
    );
$function$;

create or replace function private.can_manage_company_membership(
  target_membership_id uuid
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
      from public.company_memberships as actor_membership
      inner join public.companies as company
        on company.id = actor_membership.company_id
      inner join public.company_memberships as target_membership
        on target_membership.company_id = actor_membership.company_id
       and target_membership.id = target_membership_id
      where actor_membership.user_id = private.current_actor_user_id()
        and actor_membership.status = 'active'
        and actor_membership.role = 'company_admin'
        and company.status = 'active'
        and target_membership.role = 'manager'
        and target_membership.user_id <> actor_membership.user_id
    )
    or exists (
      select 1
      from public.company_memberships as actor_membership
      inner join public.companies as company
        on company.id = actor_membership.company_id
      inner join public.company_memberships as target_membership
        on target_membership.company_id = actor_membership.company_id
       and target_membership.id = target_membership_id
      where actor_membership.user_id = private.current_actor_user_id()
        and actor_membership.status = 'active'
        and actor_membership.role = 'manager'
        and company.status = 'active'
        and target_membership.role = 'publisher'
        and target_membership.user_id <> actor_membership.user_id
        and (
          target_membership.invited_by = actor_membership.user_id
          or exists (
            select 1
            from public.offer_assignments as publisher_assignment
            where publisher_assignment.company_id = actor_membership.company_id
              and publisher_assignment.membership_id = target_membership.id
              and publisher_assignment.manager_membership_id = actor_membership.id
          )
        )
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
      from public.company_memberships as target_membership
      where target_membership.user_id = target_user_id
        and private.can_view_company_membership(target_membership.id)
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

  if old.status = 'archived' then
    if new.status = 'archived' then
      if new is distinct from old then
        raise exception
          using
            errcode = '23514',
            message = 'An archived company is immutable until it is restored.';
      end if;

      return new;
    end if;

    if new.status <> 'suspended' then
      raise exception
        using
          errcode = '23514',
          message = 'An archived company can only be restored into suspended status.';
    end if;

    new.deleted_at := null;
    new.deleted_by := null;
    new.deleted_reason := null;
    new.status_before_deletion := null;
    new.restored_at := now();
    new.restored_by := private.current_actor_user_id();

    return new;
  end if;

  if new.status = 'archived' then
    new.status_before_deletion := old.status;
    new.deleted_at := now();
    new.deleted_by := private.current_actor_user_id();
    new.deleted_reason := coalesce(
      nullif(btrim(new.deleted_reason), ''),
      'Archived through a recoverable lifecycle transition.'
    );

    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.deleted_reason is distinct from old.deleted_reason
    or new.status_before_deletion is distinct from old.status_before_deletion
    or new.restored_at is distinct from old.restored_at
    or new.restored_by is distinct from old.restored_by
  then
    raise exception
      using
        errcode = '42501',
        message = 'Company lifecycle metadata can only change through archive or restore transitions.';
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

create or replace function private.enforce_company_membership_update_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_role public.company_role;
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
    or new.role is distinct from old.role
    or new.invited_by is distinct from old.invited_by
    or new.created_at is distinct from old.created_at
  then
    raise exception
      using
        errcode = '42501',
        message = 'Membership identity, role, invitation, and creation fields are immutable.';
  end if;

  select
    actor_membership.role
  into
    actor_role
  from public.company_memberships as actor_membership
  where actor_membership.company_id = old.company_id
    and actor_membership.user_id = private.current_actor_user_id()
    and actor_membership.status = 'active'
  limit 1;

  if not private.is_platform_super_admin() then
    if actor_role = 'company_admin' and old.role <> 'manager' then
      raise exception
        using
          errcode = '42501',
          message = 'A Company Admin can manage Manager memberships only.';
    end if;

    if actor_role = 'manager' then
      if old.role <> 'publisher'
        or not private.can_manage_company_membership(old.id)
      then
        raise exception
          using
            errcode = '42501',
            message = 'A Manager can manage only Publishers within their own scope.';
      end if;
    end if;
  end if;

  if old.status = 'revoked' then
    if new.status = 'revoked' then
      if new is distinct from old then
        raise exception
          using
            errcode = '23514',
            message = 'A revoked membership is immutable until it is restored.';
      end if;

      return new;
    end if;

    if new.status <> 'suspended' then
      raise exception
        using
          errcode = '23514',
          message = 'A revoked membership can only be restored into suspended status.';
    end if;

    new.deleted_at := null;
    new.deleted_by := null;
    new.deleted_reason := null;
    new.status_before_deletion := null;
    new.restored_at := now();
    new.restored_by := private.current_actor_user_id();

    return new;
  end if;

  if new.status = 'revoked' then
    new.status_before_deletion := old.status;
    new.deleted_at := now();
    new.deleted_by := private.current_actor_user_id();
    new.deleted_reason := coalesce(
      nullif(btrim(new.deleted_reason), ''),
      'Revoked through a recoverable lifecycle transition.'
    );

    return new;
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'invited' and new.status in ('active', 'suspended'))
      or (old.status = 'active' and new.status = 'suspended')
      or (old.status = 'suspended' and new.status = 'active')
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'The requested membership status transition is invalid.';
  end if;

  if new.joined_at is distinct from old.joined_at
    and not (
      old.joined_at is null
      and new.joined_at is not null
      and new.status = 'active'
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Membership joined_at can only be stamped when the membership becomes active.';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.deleted_reason is distinct from old.deleted_reason
    or new.status_before_deletion is distinct from old.status_before_deletion
    or new.restored_at is distinct from old.restored_at
    or new.restored_by is distinct from old.restored_by
  then
    raise exception
      using
        errcode = '42501',
        message = 'Membership lifecycle metadata can only change through revoke or restore transitions.';
  end if;

  return new;
end;
$function$;

drop trigger if exists company_memberships_enforce_update_rules
on public.company_memberships;

create trigger company_memberships_enforce_update_rules
before update on public.company_memberships
for each row
execute function private.enforce_company_membership_update_rules();

create or replace function private.audit_core_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  event_name_value text;
  entity_type_value text;
  company_id_value uuid;
  metadata_value jsonb;
begin
  if tg_table_name = 'companies' then
    if old.status is not distinct from new.status then
      return new;
    end if;

    company_id_value := new.id;
    entity_type_value := 'company';

    if new.status = 'archived' then
      event_name_value := 'company.archived';
    elsif old.status = 'archived' then
      event_name_value := 'company.restored';
    else
      return new;
    end if;
  elsif tg_table_name = 'company_memberships' then
    if old.status is not distinct from new.status then
      return new;
    end if;

    company_id_value := new.company_id;
    entity_type_value := 'company_membership';

    if new.status = 'revoked' then
      event_name_value := 'company.membership.revoked';
    elsif old.status = 'revoked' then
      event_name_value := 'company.membership.restored';
    else
      return new;
    end if;
  else
    return new;
  end if;

  metadata_value := jsonb_strip_nulls(
    jsonb_build_object(
      'previousStatus', old.status,
      'newStatus', new.status,
      'deletedAt', coalesce(new.deleted_at, old.deleted_at),
      'deletedBy', coalesce(new.deleted_by, old.deleted_by),
      'deletedReason', coalesce(new.deleted_reason, old.deleted_reason),
      'restoredAt', new.restored_at,
      'restoredBy', new.restored_by
    )
  );

  insert into public.audit_events (
    company_id,
    event_name,
    entity_type,
    entity_id,
    metadata
  )
  values (
    company_id_value,
    event_name_value,
    entity_type_value,
    new.id::text,
    metadata_value
  );

  return new;
end;
$function$;

drop trigger if exists companies_audit_lifecycle_transition
on public.companies;

create trigger companies_audit_lifecycle_transition
after update of status on public.companies
for each row
execute function private.audit_core_lifecycle_transition();

drop trigger if exists company_memberships_audit_lifecycle_transition
on public.company_memberships;

create trigger company_memberships_audit_lifecycle_transition
after update of status on public.company_memberships
for each row
execute function private.audit_core_lifecycle_transition();

drop policy if exists company_memberships_select_authorized
on public.company_memberships;

create policy company_memberships_select_authorized
on public.company_memberships
for select
to authenticated
using (
  private.can_view_company_membership(id)
);

drop policy if exists company_memberships_update_company_admin
on public.company_memberships;

drop policy if exists company_memberships_update_authorized
on public.company_memberships;

create policy company_memberships_update_authorized
on public.company_memberships
for update
to authenticated
using (
  private.can_manage_company_membership(id)
)
with check (
  private.can_manage_company_membership(id)
);

drop policy if exists companies_delete_platform_admin
on public.companies;

drop policy if exists company_memberships_delete_company_admin
on public.company_memberships;

revoke delete
on public.companies
from authenticated;

revoke delete
on public.company_memberships
from authenticated;

revoke delete
on public.user_profiles
from authenticated;

revoke delete
on public.audit_events
from authenticated;

grant update (
  deleted_reason
)
on public.companies
to authenticated;

grant update (
  deleted_reason
)
on public.company_memberships
to authenticated;

revoke all
on function private.prevent_hard_delete()
from public;

revoke all
on function private.can_view_company_membership(uuid)
from public;

revoke all
on function private.can_manage_company_membership(uuid)
from public;

revoke all
on function private.audit_core_lifecycle_transition()
from public;

grant execute
on function private.prevent_hard_delete()
to service_role;

grant execute
on function private.can_view_company_membership(uuid)
to authenticated, service_role;

grant execute
on function private.can_manage_company_membership(uuid)
to authenticated, service_role;

grant execute
on function private.audit_core_lifecycle_transition()
to service_role;

commit;
