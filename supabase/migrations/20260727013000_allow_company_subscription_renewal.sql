begin;

create or replace function private.enforce_company_subscription_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if not private.is_platform_super_admin() then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin can modify company subscriptions.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Company subscription identity and creation fields are immutable.';
    end if;

    if old.status in (
      'canceled',
      'expired'
    )
      and (
        new.plan_id is distinct from old.plan_id
        or new.status is distinct from old.status
        or new.starts_at is distinct from old.starts_at
        or new.trial_ends_at is distinct from old.trial_ends_at
        or new.current_period_starts_at is distinct from old.current_period_starts_at
        or new.current_period_ends_at is distinct from old.current_period_ends_at
        or new.grace_ends_at is distinct from old.grace_ends_at
        or new.canceled_at is distinct from old.canceled_at
        or new.ended_at is distinct from old.ended_at
        or new.external_reference is distinct from old.external_reference
      )
      and not (
        new.status = 'active'
        and new.current_period_ends_at is not null
        and new.current_period_ends_at > now()
        and new.current_period_starts_at <= new.current_period_ends_at
        and new.canceled_at is null
        and new.ended_at is null
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'A terminal company subscription can only be renewed as active with a future billing-period end.';
    end if;
  end if;

  if not exists (
    select 1
    from public.billing_plans as plan
    where plan.id = new.plan_id
      and plan.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'A company subscription requires an active billing plan.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

commit;
