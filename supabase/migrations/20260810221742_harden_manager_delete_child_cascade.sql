begin;

-- V9 hardening:
-- Manager deletion is terminal. The AFTER trigger revokes Publisher/User
-- memberships created by that Manager and archives their operational access.
-- Existing membership governance correctly prevents a Company Admin from
-- directly managing Publishers, so one trigger-depth-scoped internal exception
-- is required for the nested cascade only.

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

  -- Manager deletion cascade: permit only the nested Publisher revoke emitted
  -- by private.cascade_deleted_manager_access(). A direct client UPDATE has
  -- pg_trigger_depth() = 1 and cannot use this exception.
  if pg_trigger_depth() > 1
    and old.role = 'publisher'
    and new.role = 'publisher'
    and old.status is distinct from 'revoked'
    and new.status = 'revoked'
    and new.deleted_reason =
      'Deleted automatically because the owning Manager was deleted.'
  then
    new.status_before_deletion := old.status;
    new.deleted_at := now();
    new.deleted_by := private.current_actor_user_id();
    new.restored_at := null;
    new.restored_by := null;
    return new;
  end if;

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

create or replace function private.cascade_deleted_manager_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  child_membership_ids uuid[];
begin
  if old.role = 'manager'
    and new.role = 'manager'
    and old.status is distinct from 'revoked'
    and new.status = 'revoked'
  then
    select coalesce(array_agg(membership.id), array[]::uuid[])
    into child_membership_ids
    from public.company_memberships as membership
    where membership.company_id = new.company_id
      and membership.role = 'publisher'
      and membership.invited_by = new.user_id
      and membership.status <> 'revoked';

    update public.company_memberships as membership
    set
      status = 'revoked',
      deleted_reason =
        'Deleted automatically because the owning Manager was deleted.'
    where membership.id = any(child_membership_ids);

    update public.offer_assignments as assignment
    set status = 'revoked'
    where assignment.company_id = new.company_id
      and assignment.status <> 'revoked'
      and (
        assignment.membership_id = new.id
        or assignment.manager_membership_id = new.id
        or assignment.membership_id = any(child_membership_ids)
      );

    update public.tracking_links as link
    set status = 'archived'
    where link.company_id = new.company_id
      and link.status <> 'archived'
      and (
        link.owner_membership_id = new.id
        or link.owner_membership_id = any(child_membership_ids)
      );
  end if;

  return new;
end;
$function$;

revoke all
on function private.enforce_company_membership_update_rules()
from public;

revoke all
on function private.cascade_deleted_manager_access()
from public;

grant execute
on function private.enforce_company_membership_update_rules()
to authenticated, service_role;

grant execute
on function private.cascade_deleted_manager_access()
to authenticated, service_role;

commit;
