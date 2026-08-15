-- Manager deletion performs an internal lifecycle cascade:
--
--   Manager membership -> revoked
--   child Publisher memberships -> revoked
--   related Offer assignments -> revoked
--   related tracking links -> archived
--
-- The Offer-assignment governance trigger normally requires an active
-- Company Admin / Manager context and active assignment memberships.
-- Those checks are correct for direct assignment writes, but they must
-- not reject the narrowly scoped nested revoke emitted by
-- private.cascade_deleted_manager_access().
--
-- Direct client updates remain governed by the existing authorization
-- and integrity checks because they execute at trigger depth 1.
create or replace function private.enforce_offer_assignment_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id uuid;
  actor_is_platform_admin boolean;
  actor_is_company_admin boolean;
  actor_manager_membership_id uuid;
  target_company_id uuid;
  offer_company_id uuid;
  offer_status public.offer_status;
  membership_company_id uuid;
  membership_role public.company_role;
  membership_status public.company_membership_status;
  manager_company_id uuid;
  manager_role public.company_role;
  manager_status public.company_membership_status;
  profile_mode public.payout_mode;
begin
  actor_user_id := private.current_actor_user_id();
  /*
   * Internal Manager-deletion cascade exception.
   *
   * private.cascade_deleted_manager_access() performs only:
   *
   *     UPDATE offer_assignments
   *     SET status = 'revoked'
   *
   * after the owning Manager membership has entered revoked state.
   *
   * Restrict the exception to a nested trigger invocation and to a pure
   * non-revoked -> revoked status transition with every protected
   * assignment field unchanged.
   *
   * A direct client UPDATE executes at trigger depth 1 and therefore
   * cannot use this lifecycle exception.
   */
  if tg_op = 'UPDATE'
    and pg_trigger_depth() > 1
    and old.status is distinct from 'revoked'
    and new.status = 'revoked'
    and new.id is not distinct from old.id
    and new.company_id is not distinct from old.company_id
    and new.offer_id is not distinct from old.offer_id
    and new.membership_id is not distinct from old.membership_id
    and new.manager_membership_id is not distinct from old.manager_membership_id
    and new.assigned_by is not distinct from old.assigned_by
    and new.created_at is not distinct from old.created_at
    and new.manual_payout_amount_minor is not distinct from old.manual_payout_amount_minor
    and new.manual_payout_currency is not distinct from old.manual_payout_currency
  then
    new.updated_by := actor_user_id;
    return new;
  end if;
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id :=
    case
      when tg_op = 'INSERT' then new.company_id
      else old.company_id
    end;
  actor_is_company_admin := private.has_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );
  select membership.id
  into actor_manager_membership_id
  from public.company_memberships as membership
  where membership.company_id = target_company_id
    and membership.user_id = actor_user_id
    and membership.role = 'manager'
    and membership.status = 'active'
  limit 1;
  if not actor_is_platform_admin
    and not actor_is_company_admin
    and actor_manager_membership_id is null
  then
    raise exception
      using
        errcode = '42501',
        message =
          'Only a Platform Super Admin, Company Admin, or assigned Manager can modify offer assignments.';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.offer_id is distinct from old.offer_id
      or new.membership_id is distinct from old.membership_id
      or new.manager_membership_id is distinct from old.manager_membership_id
      or new.assigned_by is distinct from old.assigned_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Offer assignment identity, hierarchy, and creation fields are immutable.';
    end if;
    if old.status = 'revoked'
      and new.status = 'revoked'
      and (
        new.manual_payout_amount_minor
          is distinct from old.manual_payout_amount_minor
        or new.manual_payout_currency
          is distinct from old.manual_payout_currency
      )
    then
      raise exception
        using
          errcode = '23514',
          message =
            'A revoked offer assignment cannot be edited without reactivation.';
    end if;
    if new.status is distinct from old.status
      and not (
        (
          old.status = 'active'
          and new.status in ('paused', 'revoked')
        )
        or (
          old.status = 'paused'
          and new.status in ('active', 'revoked')
        )
        or (
          old.status = 'revoked'
          and new.status = 'active'
        )
      )
    then
      raise exception
        using
          errcode = '23514',
          message =
            'The requested offer-assignment status transition is invalid.';
    end if;
  end if;
  if not exists (
    select 1
    from public.companies as company
    where company.id = target_company_id
      and company.status = 'active'
  )
  then
    raise exception
      using
        errcode = '23514',
        message =
          'Offer assignments require an active company.';
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
        message =
          'The assignment requires a non-archived offer from the same company.';
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
        message =
          'The assignment requires an active Manager or Publisher membership from the same company.';
  end if;
  if membership_role = 'manager' then
    if new.manager_membership_id is not null then
      raise exception
        using
          errcode = '23514',
          message =
            'A Manager offer assignment cannot have a parent Manager.';
    end if;
    if not actor_is_platform_admin
      and not actor_is_company_admin
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only a Platform Super Admin or Company Admin can assign offers to Managers.';
    end if;
  else
    if new.manager_membership_id is null then
      raise exception
        using
          errcode = '23514',
          message =
            'A Publisher offer assignment requires its assigning Manager.';
    end if;
    select
      membership.company_id,
      membership.role,
      membership.status
    into
      manager_company_id,
      manager_role,
      manager_status
    from public.company_memberships as membership
    where membership.id = new.manager_membership_id;
    if manager_company_id is null
      or manager_company_id <> target_company_id
      or manager_role <> 'manager'
      or manager_status <> 'active'
      or not exists (
        select 1
        from public.offer_assignments as manager_assignment
        where manager_assignment.company_id = target_company_id
          and manager_assignment.offer_id = new.offer_id
          and manager_assignment.membership_id =
              new.manager_membership_id
          and manager_assignment.manager_membership_id is null
          and manager_assignment.status = 'active'
      )
    then
      raise exception
        using
          errcode = '23514',
          message =
            'A Publisher can only receive an offer from an active Manager assigned to that offer.';
    end if;
    if actor_manager_membership_id
      is distinct from new.manager_membership_id
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only the assigned Manager can assign or manage this Offer for a Publisher.';
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
          message =
            'A Publisher assignment requires a member payout profile.';
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
          message =
            'per_offer mode requires a manual payout on every open Publisher assignment.';
    end if;
  end if;
  new.updated_by := actor_user_id;
  return new;
end;
$function$;
revoke all
on function private.enforce_offer_assignment_write_rules()
from public;
