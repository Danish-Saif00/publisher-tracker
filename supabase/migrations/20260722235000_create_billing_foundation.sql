begin;

create type public.billing_plan_status as enum (
  'active',
  'archived'
);

create type public.billing_interval as enum (
  'monthly',
  'annual'
);

create type public.company_subscription_status as enum (
  'trialing',
  'active',
  'grace_period',
  'suspended',
  'canceled',
  'expired'
);

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  status public.billing_plan_status not null default 'active',
  currency text not null,
  price_amount_minor integer not null,
  billing_interval public.billing_interval not null,
  trial_days integer not null default 0,
  grace_period_days integer not null default 0,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_plans_code_unique
    unique (code),

  constraint billing_plans_code_format_check
    check (
      code = lower(code)
      and code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      and char_length(code) between 2 and 80
    ),

  constraint billing_plans_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint billing_plans_description_check
    check (
      description is null
      or char_length(btrim(description)) between 1 and 2000
    ),

  constraint billing_plans_currency_check
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  constraint billing_plans_price_amount_minor_check
    check (
      price_amount_minor between 0 and 2147483647
    ),

  constraint billing_plans_trial_days_check
    check (
      trial_days between 0 and 365
    ),

  constraint billing_plans_grace_period_days_check
    check (
      grace_period_days between 0 and 90
    )
);

create table public.billing_plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null
    references public.billing_plans (id)
    on delete cascade,
  entitlement_key text not null,
  enabled boolean not null default true,
  limit_value integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_plan_entitlements_plan_key_unique
    unique (plan_id, entitlement_key),

  constraint billing_plan_entitlements_key_check
    check (
      entitlement_key ~ '^[a-z][a-z0-9_]*$'
      and char_length(entitlement_key) between 2 and 80
    ),

  constraint billing_plan_entitlements_limit_check
    check (
      limit_value is null
      or limit_value between 0 and 2147483647
    ),

  constraint billing_plan_entitlements_disabled_limit_check
    check (
      enabled
      or limit_value is null
    )
);

create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  plan_id uuid not null
    references public.billing_plans (id)
    on delete restrict,
  status public.company_subscription_status not null,
  starts_at timestamptz not null,
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz not null,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  external_reference text,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_subscriptions_company_unique
    unique (company_id),

  constraint company_subscriptions_trial_status_check
    check (
      status <> 'trialing'
      or trial_ends_at is not null
    ),

  constraint company_subscriptions_grace_status_check
    check (
      status <> 'grace_period'
      or grace_ends_at is not null
    ),

  constraint company_subscriptions_canceled_status_check
    check (
      status <> 'canceled'
      or canceled_at is not null
    ),

  constraint company_subscriptions_expired_status_check
    check (
      status <> 'expired'
      or ended_at is not null
    ),

  constraint company_subscriptions_trial_range_check
    check (
      trial_ends_at is null
      or trial_ends_at > starts_at
    ),

  constraint company_subscriptions_period_range_check
    check (
      current_period_ends_at is null
      or current_period_ends_at > current_period_starts_at
    ),

  constraint company_subscriptions_grace_range_check
    check (
      grace_ends_at is null
      or grace_ends_at > starts_at
    ),

  constraint company_subscriptions_external_reference_check
    check (
      external_reference is null
      or char_length(btrim(external_reference)) between 1 and 255
    )
);

create index billing_plans_status_created_at_idx
  on public.billing_plans (status, created_at desc, id desc);

create index billing_plan_entitlements_plan_key_idx
  on public.billing_plan_entitlements (plan_id, entitlement_key);

create index company_subscriptions_plan_status_idx
  on public.company_subscriptions (plan_id, status, updated_at desc);

create index company_subscriptions_status_period_idx
  on public.company_subscriptions (
    status,
    current_period_ends_at,
    grace_ends_at,
    company_id
  );

create trigger billing_plans_set_updated_at
before update on public.billing_plans
for each row
execute function private.set_updated_at();

create trigger billing_plan_entitlements_set_updated_at
before update on public.billing_plan_entitlements
for each row
execute function private.set_updated_at();

create trigger company_subscriptions_set_updated_at
before update on public.company_subscriptions
for each row
execute function private.set_updated_at();

create or replace function private.can_view_billing_plan(
  target_plan_id uuid
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
      from public.company_subscriptions as subscription
      where subscription.plan_id = target_plan_id
        and private.has_company_role(
          subscription.company_id,
          array[
            'company_admin',
            'manager'
          ]::public.company_role[]
        )
    );
$function$;

create or replace function private.enforce_billing_plan_update_rules()
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
        message = 'Only a Platform Super Admin can update billing plans.';
  end if;

  if new.id is distinct from old.id
    or new.code is distinct from old.code
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception
      using
        errcode = '42501',
        message = 'Billing plan identity and creation fields are immutable.';
  end if;

  if old.status = 'archived'
    and (
      new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.status is distinct from old.status
      or new.currency is distinct from old.currency
      or new.price_amount_minor is distinct from old.price_amount_minor
      or new.billing_interval is distinct from old.billing_interval
      or new.trial_days is distinct from old.trial_days
      or new.grace_period_days is distinct from old.grace_period_days
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'An archived billing plan is immutable.';
  end if;

  if old.status = 'active'
    and new.status = 'archived'
    and exists (
      select 1
      from public.company_subscriptions as subscription
      where subscription.plan_id = old.id
        and subscription.status not in (
          'canceled',
          'expired'
        )
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'A billing plan with an open subscription cannot be archived.';
  end if;

  return new;
end;
$function$;

create trigger billing_plans_enforce_update_rules
before update on public.billing_plans
for each row
execute function private.enforce_billing_plan_update_rules();

create or replace function private.enforce_billing_entitlement_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_plan_id uuid;
begin
  if not private.is_platform_super_admin() then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin can modify billing entitlements.';
  end if;

  if tg_op = 'DELETE' then
    target_plan_id := old.plan_id;
  else
    target_plan_id := new.plan_id;
  end if;

  if not exists (
    select 1
    from public.billing_plans as plan
    where plan.id = target_plan_id
      and plan.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Billing entitlements can only be modified for an active plan.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.plan_id is distinct from old.plan_id
      or new.entitlement_key is distinct from old.entitlement_key
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Billing entitlement identity and creation fields are immutable.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

create trigger billing_plan_entitlements_enforce_write_rules
before insert or update or delete
on public.billing_plan_entitlements
for each row
execute function private.enforce_billing_entitlement_write_rules();

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
    then
      raise exception
        using
          errcode = '23514',
          message = 'A terminal company subscription is immutable.';
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

create trigger company_subscriptions_enforce_write_rules
before insert or update
on public.company_subscriptions
for each row
execute function private.enforce_company_subscription_write_rules();

alter table public.billing_plans
  enable row level security;

alter table public.billing_plan_entitlements
  enable row level security;

alter table public.company_subscriptions
  enable row level security;

create policy billing_plans_select_authorized
on public.billing_plans
for select
to authenticated
using (
  private.can_view_billing_plan(id)
);

create policy billing_plans_insert_platform_admin
on public.billing_plans
for insert
to authenticated
with check (
  private.is_platform_super_admin()
);

create policy billing_plans_update_platform_admin
on public.billing_plans
for update
to authenticated
using (
  private.is_platform_super_admin()
)
with check (
  private.is_platform_super_admin()
);

create policy billing_plan_entitlements_select_authorized
on public.billing_plan_entitlements
for select
to authenticated
using (
  private.can_view_billing_plan(plan_id)
);

create policy billing_plan_entitlements_insert_platform_admin
on public.billing_plan_entitlements
for insert
to authenticated
with check (
  private.is_platform_super_admin()
);

create policy billing_plan_entitlements_update_platform_admin
on public.billing_plan_entitlements
for update
to authenticated
using (
  private.is_platform_super_admin()
)
with check (
  private.is_platform_super_admin()
);

create policy billing_plan_entitlements_delete_platform_admin
on public.billing_plan_entitlements
for delete
to authenticated
using (
  private.is_platform_super_admin()
);

create policy company_subscriptions_select_authorized
on public.company_subscriptions
for select
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  )
);

create policy company_subscriptions_insert_platform_admin
on public.company_subscriptions
for insert
to authenticated
with check (
  private.is_platform_super_admin()
);

create policy company_subscriptions_update_platform_admin
on public.company_subscriptions
for update
to authenticated
using (
  private.is_platform_super_admin()
)
with check (
  private.is_platform_super_admin()
);

revoke all
on public.billing_plans
from anon, authenticated;

revoke all
on public.billing_plan_entitlements
from anon, authenticated;

revoke all
on public.company_subscriptions
from anon, authenticated;

grant select, insert, update
on public.billing_plans
to authenticated;

grant select, insert, update, delete
on public.billing_plan_entitlements
to authenticated;

grant select, insert, update
on public.company_subscriptions
to authenticated;

grant all
on public.billing_plans,
   public.billing_plan_entitlements,
   public.company_subscriptions
to service_role;

revoke all
on function private.can_view_billing_plan(uuid)
from public;

grant execute
on function private.can_view_billing_plan(uuid)
to authenticated, service_role;

commit;