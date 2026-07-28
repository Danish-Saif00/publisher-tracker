begin;

alter table public.user_profiles
  add column timezone text not null default 'UTC';

alter table public.user_profiles
  add constraint user_profiles_timezone_check
  check (
    char_length(btrim(timezone)) between 1 and 64
    and timezone !~ '[[:cntrl:]]'
  );

create type public.billing_invoice_status as enum (
  'issued',
  'paid',
  'overdue',
  'void'
);

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  subscription_id uuid not null
    references public.company_subscriptions (id)
    on delete cascade,
  plan_id uuid not null
    references public.billing_plans (id)
    on delete restrict,
  invoice_number text not null,
  status public.billing_invoice_status not null default 'issued',
  currency text not null,
  amount_minor bigint not null,
  period_starts_at timestamptz not null,
  period_ends_at timestamptz,
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  external_reference text,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_invoices_company_number_unique
    unique (company_id, invoice_number),

  constraint billing_invoices_subscription_period_unique
    unique (subscription_id, period_starts_at),

  constraint billing_invoices_number_check
    check (
      invoice_number ~ '^INV-[A-Z0-9]{12}$'
    ),

  constraint billing_invoices_currency_check
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  constraint billing_invoices_amount_check
    check (
      amount_minor between 0 and 9223372036854775807
    ),

  constraint billing_invoices_period_check
    check (
      period_ends_at is null
      or period_ends_at > period_starts_at
    ),

  constraint billing_invoices_payment_check
    check (
      (
        status = 'paid'
        and paid_at is not null
      )
      or (
        status <> 'paid'
        and paid_at is null
      )
    ),

  constraint billing_invoices_external_reference_check
    check (
      external_reference is null
      or (
        char_length(btrim(external_reference)) between 1 and 255
        and external_reference !~ '[[:cntrl:]]'
      )
    )
);

create index billing_invoices_company_issued_at_idx
  on public.billing_invoices (
    company_id,
    issued_at desc,
    id desc
  );

create index billing_invoices_company_status_idx
  on public.billing_invoices (
    company_id,
    status,
    issued_at desc,
    id desc
  );

create or replace function private.enforce_billing_invoice_relationships()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  selected_subscription record;
begin
  select
    subscription.company_id,
    subscription.plan_id
  into selected_subscription
  from public.company_subscriptions as subscription
  where subscription.id = new.subscription_id;

  if not found then
    raise exception
      using
        errcode = '23503',
        message = 'The invoice subscription could not be resolved.';
  end if;

  if
    selected_subscription.company_id <> new.company_id
    or selected_subscription.plan_id <> new.plan_id
  then
    raise exception
      using
        errcode = '23514',
        message = 'The invoice company and plan must match its subscription.';
  end if;

  return new;
end;
$function$;

create trigger billing_invoices_enforce_relationships
before insert or update of
  company_id,
  subscription_id,
  plan_id
on public.billing_invoices
for each row
execute function private.enforce_billing_invoice_relationships();

create trigger billing_invoices_set_updated_at
before update on public.billing_invoices
for each row
execute function private.set_updated_at();

create or replace function private.sync_company_subscription_invoice()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  selected_plan record;
  target_invoice_status public.billing_invoice_status;
begin
  select
    plan.currency,
    plan.price_amount_minor
  into selected_plan
  from public.billing_plans as plan
  where plan.id = new.plan_id;

  if selected_plan.currency is null then
    raise exception
      using
        errcode = '23503',
        message = 'The subscription billing plan could not be resolved.';
  end if;

  target_invoice_status :=
    case
      when new.status in ('canceled', 'expired')
        then 'void'::public.billing_invoice_status
      else 'issued'::public.billing_invoice_status
    end;

  insert into public.billing_invoices (
    company_id,
    subscription_id,
    plan_id,
    invoice_number,
    status,
    currency,
    amount_minor,
    period_starts_at,
    period_ends_at,
    issued_at,
    due_at,
    external_reference,
    created_by,
    updated_by
  )
  values (
    new.company_id,
    new.id,
    new.plan_id,
    'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    target_invoice_status,
    selected_plan.currency,
    selected_plan.price_amount_minor,
    new.current_period_starts_at,
    new.current_period_ends_at,
    coalesce(new.created_at, now()),
    new.current_period_starts_at,
    new.external_reference,
    new.created_by,
    new.updated_by
  )
  on conflict (subscription_id, period_starts_at)
  do update set
    plan_id = excluded.plan_id,
    status = case
      when billing_invoices.status = 'paid'
        then billing_invoices.status
      else excluded.status
    end,
    currency = excluded.currency,
    amount_minor = excluded.amount_minor,
    period_ends_at = excluded.period_ends_at,
    due_at = excluded.due_at,
    external_reference = excluded.external_reference,
    updated_by = excluded.updated_by;

  return new;
end;
$function$;

create trigger company_subscriptions_sync_invoice
after insert or update of
  plan_id,
  status,
  current_period_starts_at,
  current_period_ends_at,
  external_reference
on public.company_subscriptions
for each row
execute function private.sync_company_subscription_invoice();

insert into public.billing_invoices (
  company_id,
  subscription_id,
  plan_id,
  invoice_number,
  status,
  currency,
  amount_minor,
  period_starts_at,
  period_ends_at,
  issued_at,
  due_at,
  external_reference,
  created_by,
  updated_by
)
select
  subscription.company_id,
  subscription.id,
  subscription.plan_id,
  'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  case
    when subscription.status in ('canceled', 'expired')
      then 'void'::public.billing_invoice_status
    else 'issued'::public.billing_invoice_status
  end,
  plan.currency,
  plan.price_amount_minor,
  subscription.current_period_starts_at,
  subscription.current_period_ends_at,
  subscription.created_at,
  subscription.current_period_starts_at,
  subscription.external_reference,
  subscription.created_by,
  subscription.updated_by
from public.company_subscriptions as subscription
inner join public.billing_plans as plan
  on plan.id = subscription.plan_id
on conflict (subscription_id, period_starts_at) do nothing;

alter table public.billing_invoices enable row level security;

create policy billing_invoices_select_authorized
on public.billing_invoices
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

create policy billing_invoices_update_platform_admin
on public.billing_invoices
for update
to authenticated
using (
  private.is_platform_super_admin()
)
with check (
  private.is_platform_super_admin()
);

revoke all
on public.billing_invoices
from anon, authenticated;

grant select
on public.billing_invoices
to authenticated;

grant all
on public.billing_invoices
to service_role;

revoke all
on function private.enforce_billing_invoice_relationships()
from public;

revoke all
on function private.sync_company_subscription_invoice()
from public;

grant execute
on function private.enforce_billing_invoice_relationships()
to service_role;

grant execute
on function private.sync_company_subscription_invoice()
to service_role;

alter table public.conversions
  alter column source drop default;

create type public.conversion_source_v2 as enum (
  'provider_postback',
  'manual'
);

alter table public.conversions
  alter column source type public.conversion_source_v2
  using source::text::public.conversion_source_v2;

drop type public.conversion_source;

alter type public.conversion_source_v2
  rename to conversion_source;

alter table public.conversions
  alter column source set default 'provider_postback',
  alter column postback_endpoint_id drop not null;

alter table public.conversions
  add constraint conversions_source_endpoint_check
  check (
    (
      source = 'provider_postback'
      and postback_endpoint_id is not null
    )
    or (
      source = 'manual'
      and postback_endpoint_id is null
    )
  );

create unique index conversions_manual_click_unique
  on public.conversions (tracking_click_id)
  where source = 'manual';

comment on column public.user_profiles.timezone is
  'The authenticated user IANA timezone used by Account preferences.';

comment on table public.billing_invoices is
  'Subscription-period invoice snapshots used by the billing dashboard.';

comment on type public.conversion_source is
  'The trusted conversion creation channel: provider postback or authorized manual entry.';

commit;
