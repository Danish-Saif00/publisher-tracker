begin;
create type public.company_proxy_configuration_status as enum (
  'active',
  'disabled'
);
create type public.company_proxy_enforcement_mode as enum (
  'monitor',
  'enforce'
);
create type public.company_proxy_failure_behavior as enum (
  'allow',
  'flag',
  'block'
);
create type public.company_proxy_test_status as enum (
  'passed',
  'failed'
);
create type public.proxy_detection_outcome as enum (
  'not_checked',
  'bypassed',
  'clean',
  'flagged',
  'blocked',
  'provider_failed'
);
create table public.company_proxy_configurations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  provider_code text not null,
  encrypted_api_key text not null,
  api_key_iv text not null,
  api_key_auth_tag text not null,
  api_key_last4 text not null,
  status public.company_proxy_configuration_status
    not null
    default 'disabled',
  enforcement_mode public.company_proxy_enforcement_mode
    not null
    default 'monitor',
  risk_threshold smallint
    not null
    default 75,
  request_timeout_ms integer
    not null
    default 1500,
  cache_ttl_seconds integer
    not null
    default 3600,
  failure_behavior public.company_proxy_failure_behavior
    not null
    default 'flag',
  detect_proxy boolean
    not null
    default true,
  detect_vpn boolean
    not null
    default true,
  detect_tor boolean
    not null
    default true,
  bypass_owner_membership_ids uuid[]
    not null
    default '{}'::uuid[],
  api_key_updated_at timestamptz
    not null
    default now(),
  last_tested_at timestamptz,
  last_test_status public.company_proxy_test_status,
  last_test_error_code text,
  created_by uuid
    default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid
    default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz
    not null
    default now(),
  updated_at timestamptz
    not null
    default now(),
  constraint company_proxy_configurations_company_unique
    unique (company_id),
  constraint company_proxy_configurations_provider_check
    check (
      provider_code in (
        'ipqualityscore',
        'proxycheck'
      )
    ),
  constraint company_proxy_configurations_encrypted_key_check
    check (
      char_length(btrim(encrypted_api_key)) between 1 and 8192
      and char_length(btrim(api_key_iv)) between 1 and 512
      and char_length(btrim(api_key_auth_tag)) between 1 and 512
    ),
  constraint company_proxy_configurations_key_last4_check
    check (
      char_length(api_key_last4) = 4
    ),
  constraint company_proxy_configurations_risk_threshold_check
    check (
      risk_threshold between 0 and 100
    ),
  constraint company_proxy_configurations_timeout_check
    check (
      request_timeout_ms between 250 and 5000
    ),
  constraint company_proxy_configurations_cache_ttl_check
    check (
      cache_ttl_seconds between 60 and 86400
    ),
  constraint company_proxy_configurations_bypass_check
    check (
      cardinality(
        bypass_owner_membership_ids
      ) <= 500
      and array_position(
        bypass_owner_membership_ids,
        null
      ) is null
    ),
  constraint company_proxy_configurations_test_check
    check (
      (
        last_tested_at is null
        and last_test_status is null
        and last_test_error_code is null
      )
      or (
        last_tested_at is not null
        and last_test_status = 'passed'
        and last_test_error_code is null
      )
      or (
        last_tested_at is not null
        and last_test_status = 'failed'
        and last_test_error_code is not null
      )
    ),
  constraint company_proxy_configurations_test_error_check
    check (
      last_test_error_code is null
      or (
        char_length(
          btrim(last_test_error_code)
        ) between 1 and 120
        and last_test_error_code
          ~ '^[A-Z0-9_]+$'
      )
    )
);
create table public.proxy_detection_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  provider_code text not null,
  ip_hash text not null,
  risk_score smallint,
  is_proxy boolean,
  is_vpn boolean,
  is_tor boolean,
  provider_snapshot jsonb
    not null
    default '{}'::jsonb,
  checked_at timestamptz
    not null
    default now(),
  expires_at timestamptz
    not null,
  constraint proxy_detection_cache_identity_unique
    unique (
      company_id,
      provider_code,
      ip_hash
    ),
  constraint proxy_detection_cache_provider_check
    check (
      provider_code in (
        'ipqualityscore',
        'proxycheck'
      )
    ),
  constraint proxy_detection_cache_ip_hash_check
    check (
      ip_hash ~ '^[a-f0-9]{64}$'
    ),
  constraint proxy_detection_cache_risk_score_check
    check (
      risk_score is null
      or risk_score between 0 and 100
    ),
  constraint proxy_detection_cache_snapshot_check
    check (
      jsonb_typeof(provider_snapshot) = 'object'
    ),
  constraint proxy_detection_cache_expiry_check
    check (
      expires_at > checked_at
    )
);
alter table public.tracking_clicks
  add column proxy_detection_outcome
    public.proxy_detection_outcome
    not null
    default 'not_checked',
  add column proxy_provider_code text,
  add column proxy_risk_score smallint,
  add column proxy_is_proxy boolean,
  add column proxy_is_vpn boolean,
  add column proxy_is_tor boolean,
  add column proxy_failure_code text,
  add column proxy_decision_snapshot jsonb
    not null
    default '{}'::jsonb,
  add column proxy_checked_at timestamptz;
alter table public.tracking_clicks
  add constraint tracking_clicks_proxy_provider_check
    check (
      proxy_provider_code is null
      or proxy_provider_code in (
        'ipqualityscore',
        'proxycheck'
      )
    ),
  add constraint tracking_clicks_proxy_risk_score_check
    check (
      proxy_risk_score is null
      or proxy_risk_score between 0 and 100
    ),
  add constraint tracking_clicks_proxy_failure_code_check
    check (
      proxy_failure_code is null
      or (
        char_length(
          btrim(proxy_failure_code)
        ) between 1 and 120
        and proxy_failure_code
          ~ '^[A-Z0-9_]+$'
      )
    ),
  add constraint tracking_clicks_proxy_snapshot_check
    check (
      jsonb_typeof(
        proxy_decision_snapshot
      ) = 'object'
    ),
  add constraint tracking_clicks_proxy_outcome_check
    check (
      (
        proxy_detection_outcome = 'not_checked'
        and proxy_provider_code is null
        and proxy_risk_score is null
        and proxy_is_proxy is null
        and proxy_is_vpn is null
        and proxy_is_tor is null
        and proxy_failure_code is null
        and proxy_checked_at is null
      )
      or (
        proxy_detection_outcome = 'bypassed'
        and proxy_failure_code is null
        and proxy_checked_at is null
      )
      or (
        proxy_detection_outcome in (
          'clean',
          'flagged',
          'blocked'
        )
        and proxy_provider_code is not null
        and proxy_failure_code is null
        and proxy_checked_at is not null
      )
      or (
        proxy_detection_outcome = 'provider_failed'
        and proxy_provider_code is not null
        and proxy_failure_code is not null
        and proxy_checked_at is not null
      )
    );
create trigger company_proxy_configurations_set_updated_at
before update
on public.company_proxy_configurations
for each row
execute function private.set_updated_at();
create index proxy_detection_cache_expiry_idx
  on public.proxy_detection_cache (
    expires_at,
    company_id
  );
create index proxy_detection_cache_company_checked_idx
  on public.proxy_detection_cache (
    company_id,
    checked_at desc,
    id desc
  );
create index tracking_clicks_proxy_review_idx
  on public.tracking_clicks (
    company_id,
    proxy_detection_outcome,
    captured_at desc,
    id desc
  );
create index tracking_clicks_proxy_provider_review_idx
  on public.tracking_clicks (
    company_id,
    proxy_provider_code,
    proxy_checked_at desc,
    id desc
  )
  where proxy_provider_code is not null;
alter table
  public.company_proxy_configurations
enable row level security;
alter table
  public.proxy_detection_cache
enable row level security;
create policy company_proxy_configurations_select_authorized
on public.company_proxy_configurations
for select
to authenticated
using (
  private.can_manage_company_configuration(
    company_id
  )
);
create policy company_proxy_configurations_insert_authorized
on public.company_proxy_configurations
for insert
to authenticated
with check (
  private.can_manage_company_configuration(
    company_id
  )
);
create policy company_proxy_configurations_update_authorized
on public.company_proxy_configurations
for update
to authenticated
using (
  private.can_manage_company_configuration(
    company_id
  )
)
with check (
  private.can_manage_company_configuration(
    company_id
  )
);
revoke all
on public.company_proxy_configurations,
   public.proxy_detection_cache
from anon,
     authenticated;
grant select,
      insert,
      update
on public.company_proxy_configurations
to authenticated;
grant all
on public.company_proxy_configurations,
   public.proxy_detection_cache
to service_role;
comment on table
  public.company_proxy_configurations is
  'Company-level encrypted proxy and VPN detection configuration.';
comment on column
  public.company_proxy_configurations.encrypted_api_key is
  'AES-GCM encrypted provider API key. Plaintext must never be returned by administrative APIs.';
comment on column
  public.company_proxy_configurations.bypass_owner_membership_ids is
  'Tracking-link owner memberships whose clicks bypass provider lookup. Membership ownership is validated by the application service.';
comment on table
  public.proxy_detection_cache is
  'Privacy-safe proxy detection cache keyed by company and HMAC IP hash. Raw IP addresses are never stored.';
comment on column
  public.tracking_clicks.proxy_decision_snapshot is
  'Sanitized proxy decision metadata. It must not contain raw IP addresses or provider API credentials.';
commit;