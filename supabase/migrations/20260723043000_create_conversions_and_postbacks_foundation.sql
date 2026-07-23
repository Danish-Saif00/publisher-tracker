
begin;

create type public.network_postback_endpoint_status as enum (
  'active',
  'paused',
  'archived'
);

create type public.conversion_status as enum (
  'pending',
  'approved',
  'rejected',
  'reversed'
);

create type public.conversion_source as enum (
  'provider_postback'
);

create table public.network_postback_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  network_account_id uuid not null
    references public.network_accounts (id)
    on delete restrict,
  name text not null,
  endpoint_key_hash text not null,
  endpoint_key_last4 text not null,
  status public.network_postback_endpoint_status not null default 'active',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint network_postback_endpoints_company_name_unique
    unique (company_id, network_account_id, name),

  constraint network_postback_endpoints_key_hash_unique
    unique (endpoint_key_hash),

  constraint network_postback_endpoints_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint network_postback_endpoints_key_hash_check
    check (
      endpoint_key_hash = lower(endpoint_key_hash)
      and endpoint_key_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint network_postback_endpoints_key_last4_check
    check (
      endpoint_key_last4 = lower(endpoint_key_last4)
      and endpoint_key_last4 ~ '^[a-f0-9]{4}$'
    )
);

create index network_postback_endpoints_company_account_status_idx
  on public.network_postback_endpoints (
    company_id,
    network_account_id,
    status,
    created_at desc,
    id desc
  );

create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  public_conversion_id text generated always as (
    'cnv_' || replace(id::text, '-', '')
  ) stored,
  company_id uuid not null
    references public.companies (id)
    on delete restrict,
  tracking_click_id uuid not null
    references public.tracking_clicks (id)
    on delete restrict,
  public_click_id text not null,
  tracking_link_id uuid not null
    references public.tracking_links (id)
    on delete restrict,
  offer_id uuid not null
    references public.offers (id)
    on delete restrict,
  network_account_id uuid not null
    references public.network_accounts (id)
    on delete restrict,
  network_provider_id uuid not null
    references public.network_providers (id)
    on delete restrict,
  owner_membership_id uuid not null
    references public.company_memberships (id)
    on delete restrict,
  owner_user_id uuid not null,
  offer_assignment_id uuid not null
    references public.offer_assignments (id)
    on delete restrict,
  postback_endpoint_id uuid not null
    references public.network_postback_endpoints (id)
    on delete restrict,
  external_conversion_id text not null,
  source public.conversion_source not null default 'provider_postback',
  status public.conversion_status not null,
  revenue_amount_minor bigint,
  revenue_currency text,
  payout_mode public.payout_mode not null,
  payout_amount_minor bigint not null,
  payout_currency text not null,
  provider_payload jsonb not null default '{}'::jsonb,
  click_snapshot jsonb not null,
  payout_snapshot jsonb not null,
  converted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversions_public_conversion_id_unique
    unique (public_conversion_id),

  constraint conversions_endpoint_external_id_unique
    unique (postback_endpoint_id, external_conversion_id),

  constraint conversions_public_conversion_id_check
    check (
      public_conversion_id = lower(public_conversion_id)
      and public_conversion_id ~ '^cnv_[a-f0-9]{32}$'
    ),

  constraint conversions_public_click_id_check
    check (
      public_click_id = lower(public_click_id)
      and public_click_id ~ '^clk_[a-f0-9]{32}$'
    ),

  constraint conversions_external_conversion_id_check
    check (
      char_length(btrim(external_conversion_id)) between 1 and 255
      and external_conversion_id !~ '[[:cntrl:]]'
    ),

  constraint conversions_revenue_pair_check
    check (
      (
        revenue_amount_minor is null
        and revenue_currency is null
      )
      or (
        revenue_amount_minor is not null
        and revenue_amount_minor between 0 and 9223372036854775807
        and revenue_currency is not null
        and revenue_currency ~ '^[A-Z]{3}$'
      )
    ),

  constraint conversions_payout_check
    check (
      payout_amount_minor between 1 and 9223372036854775807
      and payout_currency ~ '^[A-Z]{3}$'
    ),

  constraint conversions_provider_payload_check
    check (
      jsonb_typeof(provider_payload) = 'object'
      and pg_column_size(provider_payload) <= 65536
    )
);

create index conversions_company_status_converted_at_idx
  on public.conversions (
    company_id,
    status,
    converted_at desc,
    id desc
  );

create index conversions_company_owner_converted_at_idx
  on public.conversions (
    company_id,
    owner_user_id,
    converted_at desc,
    id desc
  );

create index conversions_company_offer_converted_at_idx
  on public.conversions (
    company_id,
    offer_id,
    converted_at desc,
    id desc
  );

create index conversions_public_click_id_idx
  on public.conversions (public_click_id);

create table public.conversion_postback_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete restrict,
  conversion_id uuid not null
    references public.conversions (id)
    on delete restrict,
  postback_endpoint_id uuid not null
    references public.network_postback_endpoints (id)
    on delete restrict,
  idempotency_key text not null,
  requested_status public.conversion_status not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),

  constraint conversion_postback_events_idempotency_unique
    unique (postback_endpoint_id, idempotency_key),

  constraint conversion_postback_events_idempotency_key_check
    check (
      char_length(btrim(idempotency_key)) between 8 and 255
      and idempotency_key !~ '[[:cntrl:]]'
    ),

  constraint conversion_postback_events_payload_check
    check (
      jsonb_typeof(payload) = 'object'
      and pg_column_size(payload) <= 65536
    )
);

create index conversion_postback_events_conversion_received_at_idx
  on public.conversion_postback_events (
    conversion_id,
    received_at desc,
    id desc
  );

create trigger network_postback_endpoints_set_updated_at
before update on public.network_postback_endpoints
for each row
execute function private.set_updated_at();

create trigger conversions_set_updated_at
before update on public.conversions
for each row
execute function private.set_updated_at();

create or replace function private.prevent_network_postback_endpoint_identity_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.id <> old.id
    or new.company_id <> old.company_id
    or new.network_account_id <> old.network_account_id
    or new.created_at <> old.created_at
    or new.created_by is distinct from old.created_by
  then
    raise exception
      using
        errcode = '23514',
        message = 'Network-postback endpoint identity fields are immutable.';
  end if;

  if old.status = 'archived' and new is distinct from old then
    raise exception
      using
        errcode = '23514',
        message = 'Archived network-postback endpoints are immutable.';
  end if;

  return new;
end;
$function$;

create trigger network_postback_endpoints_protect_identity
before update on public.network_postback_endpoints
for each row
execute function private.prevent_network_postback_endpoint_identity_mutation();

create or replace function private.prevent_conversion_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if current_setting('app.conversion_ingest', true) <> 'on' then
    raise exception
      using
        errcode = '42501',
        message = 'Conversions may only be updated through the postback-ingestion function.';
  end if;

  if new.id <> old.id
    or new.public_conversion_id <> old.public_conversion_id
    or new.company_id <> old.company_id
    or new.tracking_click_id <> old.tracking_click_id
    or new.public_click_id <> old.public_click_id
    or new.tracking_link_id <> old.tracking_link_id
    or new.offer_id <> old.offer_id
    or new.network_account_id <> old.network_account_id
    or new.network_provider_id <> old.network_provider_id
    or new.owner_membership_id <> old.owner_membership_id
    or new.owner_user_id <> old.owner_user_id
    or new.offer_assignment_id <> old.offer_assignment_id
    or new.postback_endpoint_id <> old.postback_endpoint_id
    or new.external_conversion_id <> old.external_conversion_id
    or new.source <> old.source
    or new.payout_mode <> old.payout_mode
    or new.payout_amount_minor <> old.payout_amount_minor
    or new.payout_currency <> old.payout_currency
    or new.click_snapshot <> old.click_snapshot
    or new.payout_snapshot <> old.payout_snapshot
    or new.converted_at <> old.converted_at
    or new.created_at <> old.created_at
  then
    raise exception
      using
        errcode = '23514',
        message = 'Conversion attribution and payout snapshots are immutable.';
  end if;

  return new;
end;
$function$;

create trigger conversions_protect_snapshots
before update or delete on public.conversions
for each row
execute function private.prevent_conversion_snapshot_mutation();

create or replace function private.prevent_conversion_postback_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception
    using
      errcode = '42501',
      message = 'Conversion postback events are immutable.';
end;
$function$;

create trigger conversion_postback_events_immutable
before update or delete on public.conversion_postback_events
for each row
execute function private.prevent_conversion_postback_event_mutation();

create or replace function private.can_view_network_postback_endpoint(
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
    or private.has_company_role(
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
  select
    private.is_platform_super_admin()
    or private.has_company_role(
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
    private.is_platform_super_admin()
    or private.has_company_role(
      target_company_id,
      array['company_admin', 'manager']::public.company_role[]
    )
    or (
      target_owner_user_id = private.current_actor_user_id()
      and private.has_company_role(
        target_company_id,
        array['publisher']::public.company_role[]
      )
    );
$function$;

alter table public.network_postback_endpoints enable row level security;
alter table public.network_postback_endpoints force row level security;
alter table public.conversions enable row level security;
alter table public.conversions force row level security;
alter table public.conversion_postback_events enable row level security;
alter table public.conversion_postback_events force row level security;

create policy network_postback_endpoints_select_authorized
on public.network_postback_endpoints
for select
to authenticated
using (
  private.can_view_network_postback_endpoint(company_id)
);

create policy network_postback_endpoints_insert_authorized
on public.network_postback_endpoints
for insert
to authenticated
with check (
  private.can_write_network_postback_endpoint(company_id)
);

create policy network_postback_endpoints_update_authorized
on public.network_postback_endpoints
for update
to authenticated
using (
  private.can_write_network_postback_endpoint(company_id)
)
with check (
  private.can_write_network_postback_endpoint(company_id)
);

create policy conversions_select_authorized
on public.conversions
for select
to authenticated
using (
  private.can_view_conversion(company_id, owner_user_id)
);

create policy conversion_postback_events_select_authorized
on public.conversion_postback_events
for select
to authenticated
using (
  exists (
    select 1
    from public.conversions as conversion
    where conversion.id = conversion_postback_events.conversion_id
      and private.can_view_conversion(
        conversion.company_id,
        conversion.owner_user_id
      )
  )
);

create or replace function public.ingest_public_network_postback(
  target_endpoint_key_hash text,
  target_public_click_id text,
  target_external_conversion_id text,
  target_idempotency_key text,
  target_status public.conversion_status,
  target_revenue_amount_minor bigint,
  target_revenue_currency text,
  target_payload jsonb
)
returns table (
  conversion_id uuid,
  public_conversion_id text,
  conversion_status public.conversion_status,
  payout_mode public.payout_mode,
  payout_amount_minor bigint,
  payout_currency text,
  was_idempotent boolean,
  processed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  endpoint_record record;
  click_record record;
  payout_record record;
  conversion_record public.conversions%rowtype;
  existing_event record;
  normalized_external_conversion_id text;
  normalized_idempotency_key text;
  normalized_revenue_currency text;
  normalized_payload jsonb;
  now_value timestamptz := clock_timestamp();
begin
  if target_endpoint_key_hash is null
    or target_endpoint_key_hash !~ '^[a-f0-9]{64}$'
    or target_public_click_id is null
    or target_public_click_id !~ '^clk_[a-f0-9]{32}$'
    or target_external_conversion_id is null
    or target_idempotency_key is null
    or target_status is null
  then
    raise exception
      using
        errcode = '22023',
        message = 'Network-postback input is invalid.';
  end if;

  normalized_external_conversion_id := btrim(target_external_conversion_id);
  normalized_idempotency_key := btrim(target_idempotency_key);
  normalized_revenue_currency := upper(nullif(btrim(target_revenue_currency), ''));
  normalized_payload := coalesce(target_payload, '{}'::jsonb);

  if char_length(normalized_external_conversion_id) not between 1 and 255
    or normalized_external_conversion_id ~ '[[:cntrl:]]'
    or char_length(normalized_idempotency_key) not between 8 and 255
    or normalized_idempotency_key ~ '[[:cntrl:]]'
    or jsonb_typeof(normalized_payload) <> 'object'
    or pg_column_size(normalized_payload) > 65536
  then
    raise exception
      using
        errcode = '22023',
        message = 'Network-postback metadata is invalid.';
  end if;

  if (target_revenue_amount_minor is null) <> (normalized_revenue_currency is null)
    or (
      target_revenue_amount_minor is not null
      and target_revenue_amount_minor < 0
    )
    or (
      normalized_revenue_currency is not null
      and normalized_revenue_currency !~ '^[A-Z]{3}$'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Network-postback revenue values are invalid.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_endpoint_key_hash || ':' || normalized_idempotency_key,
      0
    )
  );

  select
    event.conversion_id,
    event.received_at
  into existing_event
  from public.conversion_postback_events as event
  inner join public.network_postback_endpoints as endpoint
    on endpoint.id = event.postback_endpoint_id
  where endpoint.endpoint_key_hash = target_endpoint_key_hash
    and event.idempotency_key = normalized_idempotency_key
  limit 1;

  if found then
    select *
    into conversion_record
    from public.conversions as conversion
    where conversion.id = existing_event.conversion_id
    limit 1;

    return query
    select
      conversion_record.id,
      conversion_record.public_conversion_id,
      conversion_record.status,
      conversion_record.payout_mode,
      conversion_record.payout_amount_minor,
      conversion_record.payout_currency,
      true,
      existing_event.received_at;

    return;
  end if;

  select
    endpoint.id,
    endpoint.company_id,
    endpoint.network_account_id
  into endpoint_record
  from public.network_postback_endpoints as endpoint
  inner join public.companies as company
    on company.id = endpoint.company_id
  inner join public.network_accounts as account
    on account.id = endpoint.network_account_id
    and account.company_id = endpoint.company_id
  inner join public.network_providers as provider
    on provider.id = account.provider_id
  where endpoint.endpoint_key_hash = target_endpoint_key_hash
    and endpoint.status = 'active'
    and company.status = 'active'
    and account.status = 'active'
    and provider.status = 'active'
  limit 1
  for share of endpoint, company, account, provider;

  if not found then
    return;
  end if;

  select
    click.*
  into click_record
  from public.tracking_clicks as click
  where click.public_click_id = target_public_click_id
    and click.company_id = endpoint_record.company_id
    and click.network_account_id = endpoint_record.network_account_id
    and click.attribution_eligible
  limit 1
  for share of click;

  if not found then
    return;
  end if;

  select
    profile.mode,
    case
      when profile.mode = 'fixed_member'
        then profile.fixed_payout_amount_minor
      else assignment.manual_payout_amount_minor
    end as amount_minor,
    case
      when profile.mode = 'fixed_member'
        then profile.payout_currency
      else assignment.manual_payout_currency
    end as currency
  into payout_record
  from public.member_payout_profiles as profile
  inner join public.offer_assignments as assignment
    on assignment.id = click_record.offer_assignment_id
    and assignment.company_id = click_record.company_id
    and assignment.offer_id = click_record.offer_id
    and assignment.membership_id = click_record.owner_membership_id
  where profile.company_id = click_record.company_id
    and profile.membership_id = click_record.owner_membership_id
    and assignment.status = 'active'
  limit 1
  for share of profile, assignment;

  if not found
    or payout_record.amount_minor is null
    or payout_record.currency is null
  then
    return;
  end if;

  select *
  into conversion_record
  from public.conversions as conversion
  where conversion.postback_endpoint_id = endpoint_record.id
    and conversion.external_conversion_id = normalized_external_conversion_id
  limit 1
  for update;

  if found then
    if conversion_record.public_click_id <> target_public_click_id then
      raise exception
        using
          errcode = '23514',
          message = 'External conversion identity conflicts with an existing click.';
    end if;

    if conversion_record.status in ('rejected', 'reversed')
      and target_status <> conversion_record.status
    then
      raise exception
        using
          errcode = '23514',
          message = 'Terminal conversions cannot transition to another status.';
    end if;

    if conversion_record.status = 'approved'
      and target_status not in ('approved', 'reversed')
    then
      raise exception
        using
          errcode = '23514',
          message = 'Approved conversions may only remain approved or be reversed.';
    end if;

    perform set_config('app.conversion_ingest', 'on', true);

    update public.conversions as conversion
    set
      status = target_status,
      revenue_amount_minor = target_revenue_amount_minor,
      revenue_currency = normalized_revenue_currency,
      provider_payload = normalized_payload
    where conversion.id = conversion_record.id
    returning conversion.*
    into conversion_record;
  else
    insert into public.conversions (
      company_id,
      tracking_click_id,
      public_click_id,
      tracking_link_id,
      offer_id,
      network_account_id,
      network_provider_id,
      owner_membership_id,
      owner_user_id,
      offer_assignment_id,
      postback_endpoint_id,
      external_conversion_id,
      status,
      revenue_amount_minor,
      revenue_currency,
      payout_mode,
      payout_amount_minor,
      payout_currency,
      provider_payload,
      click_snapshot,
      payout_snapshot,
      converted_at
    )
    values (
      click_record.company_id,
      click_record.id,
      click_record.public_click_id,
      click_record.tracking_link_id,
      click_record.offer_id,
      click_record.network_account_id,
      click_record.network_provider_id,
      click_record.owner_membership_id,
      click_record.owner_user_id,
      click_record.offer_assignment_id,
      endpoint_record.id,
      normalized_external_conversion_id,
      target_status,
      target_revenue_amount_minor,
      normalized_revenue_currency,
      payout_record.mode,
      payout_record.amount_minor,
      payout_record.currency,
      normalized_payload,
      jsonb_build_object(
        'trackingClickId', click_record.id,
        'publicClickId', click_record.public_click_id,
        'trackingLinkId', click_record.tracking_link_id,
        'offerId', click_record.offer_id,
        'networkAccountId', click_record.network_account_id,
        'ownerMembershipId', click_record.owner_membership_id,
        'offerAssignmentId', click_record.offer_assignment_id,
        'capturedAt', click_record.captured_at,
        'duplicateDecision', click_record.duplicate_decision,
        'fraudRiskLevel', click_record.fraud_risk_level,
        'attributionEligible', click_record.attribution_eligible
      ),
      jsonb_build_object(
        'mode', payout_record.mode,
        'amountMinor', payout_record.amount_minor,
        'currency', payout_record.currency,
        'profileMembershipId', click_record.owner_membership_id,
        'assignmentId', click_record.offer_assignment_id,
        'snapshottedAt', now_value
      ),
      now_value
    )
    returning *
    into conversion_record;
  end if;

  insert into public.conversion_postback_events (
    company_id,
    conversion_id,
    postback_endpoint_id,
    idempotency_key,
    requested_status,
    payload,
    received_at
  )
  values (
    conversion_record.company_id,
    conversion_record.id,
    endpoint_record.id,
    normalized_idempotency_key,
    target_status,
    normalized_payload,
    now_value
  );

  return query
  select
    conversion_record.id,
    conversion_record.public_conversion_id,
    conversion_record.status,
    conversion_record.payout_mode,
    conversion_record.payout_amount_minor,
    conversion_record.payout_currency,
    false,
    now_value;
end;
$function$;

revoke all
on public.network_postback_endpoints,
   public.conversions,
   public.conversion_postback_events
from anon, authenticated;

grant select, insert, update
on public.network_postback_endpoints
to authenticated;

grant select
on public.conversions,
   public.conversion_postback_events
to authenticated;

grant all
on public.network_postback_endpoints,
   public.conversions,
   public.conversion_postback_events
to service_role;

revoke all
on function private.can_view_network_postback_endpoint(uuid),
   private.can_write_network_postback_endpoint(uuid),
   private.can_view_conversion(uuid, uuid),
   public.ingest_public_network_postback(
     text,
     text,
     text,
     text,
     public.conversion_status,
     bigint,
     text,
     jsonb
   )
from public;

grant execute
on function private.can_view_network_postback_endpoint(uuid),
   private.can_write_network_postback_endpoint(uuid),
   private.can_view_conversion(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.ingest_public_network_postback(
  text,
  text,
  text,
  text,
  public.conversion_status,
  bigint,
  text,
  jsonb
)
to anon, authenticated, service_role;

commit;
