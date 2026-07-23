begin;

create type public.duplicate_protection_rule_status as enum (
  'active',
  'paused',
  'archived'
);

create type public.duplicate_protection_lock_mode as enum (
  'session',
  'duration',
  'until_date',
  'until_offer_expiry',
  'permanent'
);

create type public.duplicate_decision as enum (
  'accepted',
  'duplicate'
);

create type public.fraud_risk_level as enum (
  'low',
  'medium',
  'high'
);

create table public.duplicate_protection_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  network_account_id uuid not null
    references public.network_accounts (id)
    on delete restrict,
  offer_id uuid
    references public.offers (id)
    on delete restrict,
  name text not null,
  lock_mode public.duplicate_protection_lock_mode not null,
  session_window_seconds integer,
  lock_duration_seconds integer,
  lock_until timestamptz,
  offer_expiry_at timestamptz,
  match_visitor_id boolean not null default true,
  match_ip_and_user_agent boolean not null default true,
  rapid_repeat_window_seconds integer not null default 60,
  rapid_repeat_threshold integer not null default 5,
  status public.duplicate_protection_rule_status not null default 'active',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint duplicate_protection_rules_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint duplicate_protection_rules_identity_signals_check
    check (
      match_visitor_id
      or match_ip_and_user_agent
    ),

  constraint duplicate_protection_rules_rapid_repeat_check
    check (
      rapid_repeat_window_seconds between 10 and 86400
      and rapid_repeat_threshold between 2 and 1000
    ),

  constraint duplicate_protection_rules_scope_check
    check (
      lock_mode <> 'until_offer_expiry'
      or offer_id is not null
    ),

  constraint duplicate_protection_rules_timing_check
    check (
      (
        lock_mode = 'session'
        and session_window_seconds between 30 and 86400
        and lock_duration_seconds is null
        and lock_until is null
        and offer_expiry_at is null
      )
      or (
        lock_mode = 'duration'
        and session_window_seconds is null
        and lock_duration_seconds between 30 and 31536000
        and lock_until is null
        and offer_expiry_at is null
      )
      or (
        lock_mode = 'until_date'
        and session_window_seconds is null
        and lock_duration_seconds is null
        and lock_until is not null
        and offer_expiry_at is null
      )
      or (
        lock_mode = 'until_offer_expiry'
        and session_window_seconds is null
        and lock_duration_seconds is null
        and lock_until is null
        and offer_expiry_at is not null
      )
      or (
        lock_mode = 'permanent'
        and session_window_seconds is null
        and lock_duration_seconds is null
        and lock_until is null
        and offer_expiry_at is null
      )
    )
);

create unique index duplicate_protection_rules_account_scope_unique
  on public.duplicate_protection_rules (
    company_id,
    network_account_id
  )
  where offer_id is null
    and status <> 'archived';

create unique index duplicate_protection_rules_offer_scope_unique
  on public.duplicate_protection_rules (
    company_id,
    network_account_id,
    offer_id
  )
  where offer_id is not null
    and status <> 'archived';

create index duplicate_protection_rules_company_status_idx
  on public.duplicate_protection_rules (
    company_id,
    status,
    created_at desc,
    id desc
  );

create index duplicate_protection_rules_resolution_idx
  on public.duplicate_protection_rules (
    network_account_id,
    offer_id,
    status,
    created_at desc
  );

create trigger duplicate_protection_rules_set_updated_at
before update
on public.duplicate_protection_rules
for each row
execute function private.set_updated_at();

create or replace function private.validate_duplicate_protection_rule_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  account_company_id uuid;
  offer_company_id uuid;
  offer_network_account_id uuid;
begin
  select account.company_id
  into account_company_id
  from public.network_accounts as account
  where account.id = new.network_account_id;

  if account_company_id is null
    or account_company_id <> new.company_id
  then
    raise exception
      using
        errcode = '23514',
        message = 'Duplicate-protection network account must belong to the selected company.';
  end if;

  if new.offer_id is not null then
    select
      offer.company_id,
      offer.network_account_id
    into
      offer_company_id,
      offer_network_account_id
    from public.offers as offer
    where offer.id = new.offer_id;

    if offer_company_id is null
      or offer_company_id <> new.company_id
      or offer_network_account_id <> new.network_account_id
    then
      raise exception
        using
          errcode = '23514',
          message = 'Duplicate-protection offer must belong to the selected network account.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger duplicate_protection_rules_validate_scope
before insert or update
on public.duplicate_protection_rules
for each row
execute function private.validate_duplicate_protection_rule_scope();

create or replace function private.prevent_archived_duplicate_rule_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.status = 'archived' then
    raise exception
      using
        errcode = '42501',
        message = 'Archived duplicate-protection rules are immutable.';
  end if;

  if old.company_id <> new.company_id
    or old.network_account_id <> new.network_account_id
    or old.offer_id is distinct from new.offer_id
    or old.created_by is distinct from new.created_by
    or old.created_at <> new.created_at
  then
    raise exception
      using
        errcode = '42501',
        message = 'Duplicate-protection rule identity fields are immutable.';
  end if;

  return new;
end;
$function$;

create trigger duplicate_protection_rules_protect_identity
before update
on public.duplicate_protection_rules
for each row
execute function private.prevent_archived_duplicate_rule_mutation();

create or replace function private.can_view_duplicate_protection_rule(
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
      array[
        'company_admin',
        'manager'
      ]::public.company_role[]
    );
$function$;

create or replace function private.can_write_duplicate_protection_rule(
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
      array[
        'company_admin'
      ]::public.company_role[]
    );
$function$;

alter table public.duplicate_protection_rules
  enable row level security;

create policy duplicate_protection_rules_select_authorized
on public.duplicate_protection_rules
for select
to authenticated
using (
  private.can_view_duplicate_protection_rule(company_id)
);

create policy duplicate_protection_rules_insert_company_admin
on public.duplicate_protection_rules
for insert
to authenticated
with check (
  private.can_write_duplicate_protection_rule(company_id)
);

create policy duplicate_protection_rules_update_company_admin
on public.duplicate_protection_rules
for update
to authenticated
using (
  private.can_write_duplicate_protection_rule(company_id)
)
with check (
  private.can_write_duplicate_protection_rule(company_id)
);

alter table public.tracking_clicks
  add column duplicate_decision public.duplicate_decision not null default 'accepted',
  add column duplicate_reason text,
  add column duplicate_of_click_id uuid
    references public.tracking_clicks (id)
    on delete restrict,
  add column duplicate_rule_id uuid
    references public.duplicate_protection_rules (id)
    on delete restrict,
  add column lock_expires_at timestamptz,
  add column fraud_risk_level public.fraud_risk_level not null default 'low',
  add column fraud_signals jsonb not null default '[]'::jsonb,
  add column attribution_eligible boolean not null default true,
  add column duplicate_decision_snapshot jsonb not null default '{}'::jsonb;

alter table public.tracking_clicks
  add constraint tracking_clicks_duplicate_pair_check
    check (
      (
        duplicate_decision = 'accepted'
        and duplicate_reason is null
        and duplicate_of_click_id is null
      )
      or (
        duplicate_decision = 'duplicate'
        and duplicate_reason is not null
        and duplicate_of_click_id is not null
        and duplicate_rule_id is not null
        and attribution_eligible = false
      )
    ),
  add constraint tracking_clicks_fraud_signals_check
    check (
      jsonb_typeof(fraud_signals) = 'array'
      and jsonb_typeof(duplicate_decision_snapshot) = 'object'
    );

create index tracking_clicks_duplicate_review_idx
  on public.tracking_clicks (
    company_id,
    duplicate_decision,
    captured_at desc,
    id desc
  );

create index tracking_clicks_fraud_review_idx
  on public.tracking_clicks (
    company_id,
    fraud_risk_level,
    captured_at desc,
    id desc
  );

create index tracking_clicks_identity_duplicate_lookup_idx
  on public.tracking_clicks (
    network_account_id,
    offer_id,
    visitor_id,
    captured_at desc
  )
  where attribution_eligible;

create index tracking_clicks_ip_ua_duplicate_lookup_idx
  on public.tracking_clicks (
    network_account_id,
    offer_id,
    ip_hash,
    user_agent_hash,
    captured_at desc
  )
  where attribution_eligible;

drop function public.capture_public_tracking_click(
  text,
  text,
  text,
  uuid,
  public.visitor_identity_source,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
);

create or replace function public.capture_public_tracking_click(
  target_hostname text,
  target_public_token text,
  target_public_click_id text,
  target_visitor_id uuid,
  target_visitor_identity_source public.visitor_identity_source,
  target_ip_hash text,
  target_user_agent text,
  target_user_agent_hash text,
  target_visitor_fingerprint text,
  target_referrer_url text,
  target_referrer_hostname text,
  target_request_path text,
  target_attribution jsonb
)
returns table (
  tracking_click_id uuid,
  public_click_id text,
  tracking_link_id uuid,
  company_id uuid,
  offer_id uuid,
  network_account_id uuid,
  tracking_domain_id uuid,
  owner_membership_id uuid,
  destination_url text,
  query_parameters jsonb,
  duplicate_decision public.duplicate_decision,
  fraud_risk_level public.fraud_risk_level,
  fraud_signals jsonb,
  attribution_eligible boolean,
  captured_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_hostname text;
  normalized_public_token text;
  resolved record;
  selected_rule record;
  prior_click record;
  inserted_click_id uuid;
  inserted_captured_at timestamptz;
  duplicate_decision_value public.duplicate_decision := 'accepted';
  duplicate_reason_value text;
  duplicate_of_click_id_value uuid;
  duplicate_rule_id_value uuid;
  lock_expires_at_value timestamptz;
  fraud_risk_level_value public.fraud_risk_level := 'low';
  fraud_signals_value jsonb := '[]'::jsonb;
  attribution_eligible_value boolean := true;
  duplicate_lower_bound timestamptz;
  rapid_repeat_count bigint := 0;
  visitor_matched boolean := false;
  ip_ua_matched boolean := false;
begin
  normalized_hostname := lower(btrim(target_hostname, '.'));
  normalized_public_token := lower(btrim(target_public_token));

  if normalized_hostname is null
    or char_length(normalized_hostname) not between 1 and 253
    or normalized_hostname ~ '[[:cntrl:]]'
    or position('/' in normalized_hostname) > 0
    or position(':' in normalized_hostname) > 0
    or position(chr(92) in normalized_hostname) > 0
    or normalized_public_token is null
    or char_length(normalized_public_token) not between 2 and 80
    or normalized_public_token !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  then
    return;
  end if;

  if target_public_click_id is null
    or target_public_click_id !~ '^clk_[a-f0-9]{32}$'
    or target_visitor_id is null
    or target_visitor_identity_source is null
    or target_ip_hash is null
    or target_ip_hash !~ '^[a-f0-9]{64}$'
    or target_user_agent_hash is null
    or target_user_agent_hash !~ '^[a-f0-9]{64}$'
    or target_visitor_fingerprint is null
    or target_visitor_fingerprint !~ '^[a-f0-9]{64}$'
    or target_request_path is null
    or char_length(target_request_path) not between 1 and 1024
    or left(target_request_path, 1) <> '/'
    or target_request_path ~ '[[:cntrl:]]'
    or target_attribution is null
    or not private.tracking_click_attribution_valid(target_attribution)
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click capture input is invalid.';
  end if;

  if target_user_agent is not null
    and (
      char_length(target_user_agent) not between 1 and 1024
      or target_user_agent ~ '[[:cntrl:]]'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click user agent is invalid.';
  end if;

  if target_referrer_url is not null
    and (
      char_length(target_referrer_url) not between 8 and 2048
      or target_referrer_url !~* '^https?://'
      or target_referrer_url ~ '[[:cntrl:]]'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click referrer URL is invalid.';
  end if;

  if target_referrer_hostname is not null
    and (
      char_length(target_referrer_hostname) not between 1 and 253
      or target_referrer_hostname <> lower(target_referrer_hostname)
      or target_referrer_hostname ~ '[[:cntrl:]]'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click referrer hostname is invalid.';
  end if;

  if (target_referrer_url is null) <> (target_referrer_hostname is null) then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click referrer URL and hostname must be provided together.';
  end if;

  select
    link.id as tracking_link_id,
    link.company_id,
    link.offer_id,
    link.tracking_domain_id,
    link.owner_membership_id,
    link.tracking_code,
    link.custom_slug,
    link.destination_url as link_destination_url,
    link.query_parameters,
    link.status as tracking_link_status,

    offer.code as offer_code,
    offer.external_offer_id,
    offer.name as offer_name,
    offer.destination_url as offer_destination_url,
    offer.status as offer_status,
    offer.network_account_id,

    domain.hostname,
    domain.status as domain_status,

    membership.user_id as owner_user_id,
    membership.role as owner_role,
    membership.status as owner_membership_status,

    assignment.id as offer_assignment_id,
    assignment.status as assignment_status,

    account.provider_id as network_provider_id,
    account.name as network_account_name,
    account.external_account_id,
    account.status as network_account_status,

    provider.code as network_provider_code,
    provider.name as network_provider_name,
    provider.status as network_provider_status
  into resolved
  from public.tracking_links as link
  inner join public.tracking_domains as domain
    on domain.id = link.tracking_domain_id
  inner join public.offers as offer
    on offer.id = link.offer_id
  inner join public.company_memberships as membership
    on membership.id = link.owner_membership_id
  inner join public.offer_assignments as assignment
    on assignment.company_id = link.company_id
    and assignment.offer_id = link.offer_id
    and assignment.membership_id = link.owner_membership_id
  inner join public.companies as company
    on company.id = link.company_id
  inner join public.network_accounts as account
    on account.id = offer.network_account_id
    and account.company_id = link.company_id
  inner join public.network_providers as provider
    on provider.id = account.provider_id
  where lower(domain.hostname) = normalized_hostname
    and (
      link.tracking_code = normalized_public_token
      or link.custom_slug = normalized_public_token
    )
    and link.status = 'active'
    and domain.status = 'active'
    and offer.status = 'active'
    and membership.status = 'active'
    and membership.role in ('manager', 'publisher')
    and assignment.status = 'active'
    and company.status = 'active'
    and account.status = 'active'
    and provider.status = 'active'
  order by
    case
      when link.custom_slug = normalized_public_token then 0
      else 1
    end,
    link.id
  limit 1
  for share of
    link,
    domain,
    offer,
    membership,
    assignment,
    company,
    account,
    provider;

  if not found then
    return;
  end if;

  select rule.*
  into selected_rule
  from public.duplicate_protection_rules as rule
  where rule.company_id = resolved.company_id
    and rule.network_account_id = resolved.network_account_id
    and rule.status = 'active'
    and (
      rule.offer_id = resolved.offer_id
      or rule.offer_id is null
    )
    and (
      rule.lock_mode not in ('until_date', 'until_offer_expiry')
      or (
        rule.lock_mode = 'until_date'
        and rule.lock_until > clock_timestamp()
      )
      or (
        rule.lock_mode = 'until_offer_expiry'
        and rule.offer_expiry_at > clock_timestamp()
      )
    )
  order by
    case
      when rule.offer_id = resolved.offer_id then 0
      else 1
    end,
    rule.created_at desc,
    rule.id
  limit 1;

  if found then
    duplicate_rule_id_value := selected_rule.id;

    case selected_rule.lock_mode
      when 'session' then
        duplicate_lower_bound :=
          clock_timestamp() - make_interval(secs => selected_rule.session_window_seconds);
      when 'duration' then
        duplicate_lower_bound :=
          clock_timestamp() - make_interval(secs => selected_rule.lock_duration_seconds);
      when 'until_date' then
        duplicate_lower_bound := selected_rule.created_at;
        lock_expires_at_value := selected_rule.lock_until;
      when 'until_offer_expiry' then
        duplicate_lower_bound := selected_rule.created_at;
        lock_expires_at_value := selected_rule.offer_expiry_at;
      when 'permanent' then
        duplicate_lower_bound := '-infinity'::timestamptz;
    end case;

    select
      click.id,
      click.captured_at,
      (
        selected_rule.match_visitor_id
        and click.visitor_id = target_visitor_id
      ) as visitor_matched,
      (
        selected_rule.match_ip_and_user_agent
        and click.ip_hash = target_ip_hash
        and click.user_agent_hash = target_user_agent_hash
      ) as ip_ua_matched
    into prior_click
    from public.tracking_clicks as click
    where click.company_id = resolved.company_id
      and click.network_account_id = resolved.network_account_id
      and (
        selected_rule.offer_id is null
        or click.offer_id = resolved.offer_id
      )
      and click.captured_at >= duplicate_lower_bound
      and click.attribution_eligible
      and (
        (
          selected_rule.match_visitor_id
          and click.visitor_id = target_visitor_id
        )
        or (
          selected_rule.match_ip_and_user_agent
          and click.ip_hash = target_ip_hash
          and click.user_agent_hash = target_user_agent_hash
        )
      )
    order by
      click.captured_at desc,
      click.id desc
    limit 1;

    if found then
      visitor_matched := prior_click.visitor_matched;
      ip_ua_matched := prior_click.ip_ua_matched;
      duplicate_decision_value := 'duplicate';
      duplicate_of_click_id_value := prior_click.id;
      attribution_eligible_value := false;

      if visitor_matched and ip_ua_matched then
        duplicate_reason_value := 'visitor_and_ip_user_agent_match';
        fraud_signals_value :=
          fraud_signals_value
          || jsonb_build_array('duplicate_visitor', 'duplicate_ip_user_agent');
      elsif visitor_matched then
        duplicate_reason_value := 'visitor_match';
        fraud_signals_value :=
          fraud_signals_value
          || jsonb_build_array('duplicate_visitor');
      else
        duplicate_reason_value := 'ip_user_agent_match';
        fraud_signals_value :=
          fraud_signals_value
          || jsonb_build_array('duplicate_ip_user_agent');
      end if;

      if selected_rule.lock_mode = 'session' then
        lock_expires_at_value :=
          prior_click.captured_at
          + make_interval(secs => selected_rule.session_window_seconds);
      elsif selected_rule.lock_mode = 'duration' then
        lock_expires_at_value :=
          prior_click.captured_at
          + make_interval(secs => selected_rule.lock_duration_seconds);
      end if;
    elsif selected_rule.lock_mode = 'session' then
      lock_expires_at_value :=
        clock_timestamp()
        + make_interval(secs => selected_rule.session_window_seconds);
    elsif selected_rule.lock_mode = 'duration' then
      lock_expires_at_value :=
        clock_timestamp()
        + make_interval(secs => selected_rule.lock_duration_seconds);
    end if;

    select count(*)
    into rapid_repeat_count
    from public.tracking_clicks as click
    where click.company_id = resolved.company_id
      and click.network_account_id = resolved.network_account_id
      and (
        selected_rule.offer_id is null
        or click.offer_id = resolved.offer_id
      )
      and click.visitor_fingerprint = target_visitor_fingerprint
      and click.captured_at >= (
        clock_timestamp()
        - make_interval(secs => selected_rule.rapid_repeat_window_seconds)
      );

    if rapid_repeat_count + 1 >= selected_rule.rapid_repeat_threshold then
      fraud_signals_value :=
        fraud_signals_value
        || jsonb_build_array('rapid_repeat');

      if rapid_repeat_count + 1 >= selected_rule.rapid_repeat_threshold * 2 then
        fraud_risk_level_value := 'high';
      elsif duplicate_decision_value = 'accepted' then
        fraud_risk_level_value := 'medium';
      end if;
    end if;
  end if;

  if duplicate_decision_value = 'duplicate' then
    fraud_risk_level_value := 'high';
  elsif target_user_agent is null then
    fraud_signals_value :=
      fraud_signals_value
      || jsonb_build_array('missing_user_agent');

    if fraud_risk_level_value = 'low' then
      fraud_risk_level_value := 'medium';
    end if;
  end if;

  insert into public.tracking_clicks as click (
    public_click_id,
    company_id,
    tracking_link_id,
    offer_id,
    network_account_id,
    network_provider_id,
    tracking_domain_id,
    owner_membership_id,
    owner_user_id,
    offer_assignment_id,
    visitor_id,
    visitor_identity_source,
    ip_hash,
    user_agent,
    user_agent_hash,
    visitor_fingerprint,
    referrer_url,
    referrer_hostname,
    request_hostname,
    request_path,
    attribution,
    tracking_link_snapshot,
    offer_snapshot,
    network_snapshot,
    domain_snapshot,
    owner_snapshot,
    assignment_snapshot,
    duplicate_decision,
    duplicate_reason,
    duplicate_of_click_id,
    duplicate_rule_id,
    lock_expires_at,
    fraud_risk_level,
    fraud_signals,
    attribution_eligible,
    duplicate_decision_snapshot
  )
  values (
    target_public_click_id,
    resolved.company_id,
    resolved.tracking_link_id,
    resolved.offer_id,
    resolved.network_account_id,
    resolved.network_provider_id,
    resolved.tracking_domain_id,
    resolved.owner_membership_id,
    resolved.owner_user_id,
    resolved.offer_assignment_id,
    target_visitor_id,
    target_visitor_identity_source,
    target_ip_hash,
    target_user_agent,
    target_user_agent_hash,
    target_visitor_fingerprint,
    target_referrer_url,
    target_referrer_hostname,
    normalized_hostname,
    target_request_path,
    target_attribution,
    jsonb_build_object(
      'id', resolved.tracking_link_id,
      'trackingCode', resolved.tracking_code,
      'customSlug', resolved.custom_slug,
      'destinationUrl', resolved.link_destination_url,
      'queryParameters', resolved.query_parameters,
      'status', resolved.tracking_link_status
    ),
    jsonb_build_object(
      'id', resolved.offer_id,
      'code', resolved.offer_code,
      'externalOfferId', resolved.external_offer_id,
      'name', resolved.offer_name,
      'destinationUrl', resolved.offer_destination_url,
      'status', resolved.offer_status
    ),
    jsonb_build_object(
      'accountId', resolved.network_account_id,
      'accountName', resolved.network_account_name,
      'externalAccountId', resolved.external_account_id,
      'accountStatus', resolved.network_account_status,
      'providerId', resolved.network_provider_id,
      'providerCode', resolved.network_provider_code,
      'providerName', resolved.network_provider_name,
      'providerStatus', resolved.network_provider_status
    ),
    jsonb_build_object(
      'id', resolved.tracking_domain_id,
      'hostname', resolved.hostname,
      'status', resolved.domain_status
    ),
    jsonb_build_object(
      'membershipId', resolved.owner_membership_id,
      'userId', resolved.owner_user_id,
      'role', resolved.owner_role,
      'membershipStatus', resolved.owner_membership_status
    ),
    jsonb_build_object(
      'id', resolved.offer_assignment_id,
      'status', resolved.assignment_status
    ),
    duplicate_decision_value,
    duplicate_reason_value,
    duplicate_of_click_id_value,
    duplicate_rule_id_value,
    lock_expires_at_value,
    fraud_risk_level_value,
    fraud_signals_value,
    attribution_eligible_value,
    jsonb_build_object(
      'ruleId', duplicate_rule_id_value,
      'decision', duplicate_decision_value,
      'reason', duplicate_reason_value,
      'lockExpiresAt', lock_expires_at_value,
      'riskLevel', fraud_risk_level_value,
      'signals', fraud_signals_value,
      'attributionEligible', attribution_eligible_value
    )
  )
  returning
    click.id,
    click.captured_at
  into
    inserted_click_id,
    inserted_captured_at;

  return query
  select
    inserted_click_id,
    target_public_click_id,
    resolved.tracking_link_id,
    resolved.company_id,
    resolved.offer_id,
    resolved.network_account_id,
    resolved.tracking_domain_id,
    resolved.owner_membership_id,
    resolved.link_destination_url,
    resolved.query_parameters,
    duplicate_decision_value,
    fraud_risk_level_value,
    fraud_signals_value,
    attribution_eligible_value,
    inserted_captured_at;
end;
$function$;

revoke all
on public.duplicate_protection_rules
from anon, authenticated;

grant select, insert, update
on public.duplicate_protection_rules
to authenticated;

grant all
on public.duplicate_protection_rules
to service_role;

revoke all
on function private.validate_duplicate_protection_rule_scope(),
   function private.prevent_archived_duplicate_rule_mutation(),
   function private.can_view_duplicate_protection_rule(uuid),
   function private.can_write_duplicate_protection_rule(uuid),
   function public.capture_public_tracking_click(
     text,
     text,
     text,
     uuid,
     public.visitor_identity_source,
     text,
     text,
     text,
     text,
     text,
     text,
     text,
     jsonb
   )
from public;

grant execute
on function private.can_view_duplicate_protection_rule(uuid),
   function private.can_write_duplicate_protection_rule(uuid)
to authenticated, service_role;

grant execute
on function public.capture_public_tracking_click(
  text,
  text,
  text,
  uuid,
  public.visitor_identity_source,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
to anon, authenticated, service_role;

commit;
