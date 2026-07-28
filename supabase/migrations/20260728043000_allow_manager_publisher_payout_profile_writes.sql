begin;
create or replace function private.enforce_member_payout_profile_write_rules()
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
  membership_company_id uuid;
  membership_role public.company_role;
  membership_status public.company_membership_status;
  membership_invited_by uuid;
begin
  actor_user_id := private.current_actor_user_id();
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case
    when tg_op = 'INSERT' then new.company_id
    else old.company_id
  end;
  actor_is_company_admin := private.has_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );
  select
    membership.company_id,
    membership.role,
    membership.status,
    membership.invited_by
  into
    membership_company_id,
    membership_role,
    membership_status,
    membership_invited_by
  from public.company_memberships as membership
  where membership.id = new.membership_id;
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
  then
    if actor_manager_membership_id is null
      or membership_company_id is null
      or membership_company_id <> target_company_id
      or membership_role <> 'publisher'
      or membership_status <> 'active'
      or not (
        membership_invited_by = actor_user_id
        or exists (
          select 1
          from public.offer_assignments as assignment
          where assignment.company_id = target_company_id
            and assignment.membership_id = new.membership_id
            and assignment.manager_membership_id =
              actor_manager_membership_id
        )
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'A Manager can only modify the payout profile of an active Publisher they manage.';
    end if;
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
          message =
            'Payout profile identity, company, membership, and creation fields are immutable.';
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
  if membership_company_id is null
    or membership_company_id <> target_company_id
    or membership_role not in ('manager', 'publisher')
    or membership_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message =
          'A payout profile requires an active Manager or Publisher membership from the same company.';
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
        message =
          'Every open assignment requires a manual payout before per_offer mode can be enabled.';
  end if;
  new.updated_by := actor_user_id;
  return new;
end;
$function$;
commit;