begin;
-- Repair Manager -> Publisher Offer assignment cascade.
-- Source security function is read from the live database first.
CREATE OR REPLACE FUNCTION private.enforce_offer_assignment_write_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    if not (
      pg_trigger_depth() > 1
      and (
        actor_is_platform_admin
        or actor_is_company_admin
      )
    )
      and actor_manager_membership_id
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
CREATE OR REPLACE FUNCTION private.cascade_manager_offer_assignment_to_active_publishers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  manager_user_id uuid;
  effective_actor_user_id uuid;
begin
  select membership.user_id
  into manager_user_id
  from public.company_memberships as membership
  where membership.id = new.membership_id
    and membership.company_id = new.company_id
    and membership.role = 'manager'
  limit 1;
  if manager_user_id is null then
    return new;
  end if;
  effective_actor_user_id := coalesce(
    new.updated_by,
    new.assigned_by,
    nullif(
      pg_catalog.current_setting(
        'app.current_actor_user_id',
        true
      ),
      ''
    )::uuid
  );
  if new.status = 'active'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'active'
    )
  then
    insert into public.offer_assignments (
      company_id,
      offer_id,
      membership_id,
      manager_membership_id,
      status,
      manual_payout_amount_minor,
      manual_payout_currency,
      assigned_by,
      updated_by
    )
    select
      new.company_id,
      new.offer_id,
      publisher_membership.id,
      new.membership_id,
      'active'::public.offer_assignment_status,
      case
        when payout_profile.mode = 'per_offer'
        then configuration.default_payout_amount_minor
        else null
      end,
      case
        when payout_profile.mode = 'per_offer'
        then configuration.payout_currency
        else null
      end,
      effective_actor_user_id,
      effective_actor_user_id
    from public.company_memberships as publisher_membership
    inner join public.user_profiles as publisher_profile
      on publisher_profile.user_id =
        publisher_membership.user_id
    inner join public.member_payout_profiles as payout_profile
      on payout_profile.membership_id =
        publisher_membership.id
     and payout_profile.company_id =
        new.company_id
    left join public.offer_operational_configurations as configuration
      on configuration.offer_id =
        new.offer_id
     and configuration.company_id =
        new.company_id
    where publisher_membership.company_id =
      new.company_id
      and publisher_membership.role =
        'publisher'
      and publisher_membership.status =
        'active'
      and publisher_profile.status =
        'active'
      and publisher_membership.invited_by =
        manager_user_id
      and (
        payout_profile.mode = 'fixed_member'
        or (
          payout_profile.mode = 'per_offer'
          and configuration.default_payout_amount_minor is not null
          and configuration.payout_currency is not null
        )
      )
    on conflict (offer_id, membership_id)
    do update
    set
      manager_membership_id =
        excluded.manager_membership_id,
      status =
        excluded.status,
      manual_payout_amount_minor =
        excluded.manual_payout_amount_minor,
      manual_payout_currency =
        excluded.manual_payout_currency,
      updated_by =
        excluded.updated_by
    where
      public.offer_assignments.manager_membership_id
        is not distinct from
        excluded.manager_membership_id;
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status is distinct from 'active'
  then
    update public.offer_assignments as publisher_assignment
    set
      status =
        'revoked'::public.offer_assignment_status,
      updated_by =
        effective_actor_user_id
    from public.company_memberships as publisher_membership
    where publisher_assignment.company_id =
      new.company_id
      and publisher_assignment.offer_id =
        new.offer_id
      and publisher_assignment.manager_membership_id =
        new.membership_id
      and publisher_assignment.status
        is distinct from
        'revoked'::public.offer_assignment_status
      and publisher_membership.id =
        publisher_assignment.membership_id
      and publisher_membership.company_id =
        publisher_assignment.company_id
      and publisher_membership.role =
        'publisher';
  end if;
  return new;
end;
$function$;
revoke all
on function private.enforce_offer_assignment_write_rules()
from public;
revoke all
on function private.cascade_manager_offer_assignment_to_active_publishers()
from public;
grant execute
on function private.enforce_offer_assignment_write_rules()
to authenticated, service_role;
grant execute
on function private.cascade_manager_offer_assignment_to_active_publishers()
to authenticated, service_role;
commit;
