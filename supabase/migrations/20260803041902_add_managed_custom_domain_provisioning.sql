begin;

create type public.tracking_domain_provider as enum (
  'manual',
  'render'
);

create type public.tracking_domain_provider_verification_status as enum (
  'not_applicable',
  'unregistered',
  'unverified',
  'verified'
);

create type public.tracking_domain_provisioning_status as enum (
  'manual',
  'ownership_pending',
  'ownership_verified',
  'provider_pending',
  'dns_pending',
  'tls_pending',
  'active',
  'failed',
  'disconnected'
);

alter table public.tracking_domains
  add column provider public.tracking_domain_provider not null default 'manual',
  add column provider_custom_domain_id text,
  add column provider_verification_status
    public.tracking_domain_provider_verification_status
    not null default 'not_applicable',
  add column provisioning_status public.tracking_domain_provisioning_status
    not null default 'manual',
  add column dns_target text,
  add column ownership_verified_at timestamptz,
  add column dns_verified_at timestamptz,
  add column tls_verified_at timestamptz,
  add column last_checked_at timestamptz,
  add column last_error_code text,
  add column last_error_message text,
  add column disconnected_at timestamptz;

alter table public.tracking_domains
  add constraint tracking_domains_provider_custom_domain_id_unique
    unique (provider_custom_domain_id),

  add constraint tracking_domains_provider_configuration_check
    check (
      (
        provider = 'manual'
        and provider_custom_domain_id is null
        and provider_verification_status = 'not_applicable'
        and provisioning_status = 'manual'
        and dns_target is null
        and ownership_verified_at is null
        and dns_verified_at is null
        and tls_verified_at is null
      )
      or
      (
        provider = 'render'
        and provider_verification_status <> 'not_applicable'
        and provisioning_status <> 'manual'
        and dns_target is not null
        and char_length(btrim(dns_target)) between 4 and 253
      )
    ),

  add constraint tracking_domains_provider_id_check
    check (
      provider_custom_domain_id is null
      or char_length(btrim(provider_custom_domain_id)) between 2 and 255
    ),

  add constraint tracking_domains_dns_target_check
    check (
      dns_target is null
      or (
        dns_target = lower(dns_target)
        and dns_target ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
      )
    ),

  add constraint tracking_domains_error_code_check
    check (
      last_error_code is null
      or (
        char_length(last_error_code) between 2 and 120
        and last_error_code ~ '^[A-Z0-9_]+$'
      )
    ),

  add constraint tracking_domains_error_message_check
    check (
      last_error_message is null
      or char_length(btrim(last_error_message)) between 1 and 1000
    ),

  add constraint tracking_domains_render_active_readiness_check
    check (
      provider <> 'render'
      or status <> 'active'
      or (
        ownership_verified_at is not null
        and provider_custom_domain_id is not null
        and provider_verification_status = 'verified'
        and provisioning_status = 'active'
        and dns_verified_at is not null
        and tls_verified_at is not null
        and disconnected_at is null
      )
    );

create index tracking_domains_provisioning_status_checked_at_idx
  on public.tracking_domains (
    provisioning_status,
    last_checked_at nulls first,
    created_at,
    id
  )
  where provider = 'render'
    and status <> 'archived';

create or replace function private.tracking_domain_system_write_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    nullif(current_setting('app.tracking_domain_system_write', true), ''),
    'off'
  ) = 'on';
$function$;

create or replace function private.enforce_tracking_domain_provisioning_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  system_write_enabled boolean;
begin
  system_write_enabled := private.tracking_domain_system_write_enabled();

  if tg_op = 'INSERT' then
    if new.provider = 'render' then
      if new.status <> 'pending_verification'::public.tracking_domain_status
        or new.provider_custom_domain_id is not null
        or new.provider_verification_status <>
          'unregistered'::public.tracking_domain_provider_verification_status
        or new.provisioning_status <>
          'ownership_pending'::public.tracking_domain_provisioning_status
        or new.ownership_verified_at is not null
        or new.dns_verified_at is not null
        or new.tls_verified_at is not null
        or new.last_checked_at is not null
        or new.last_error_code is not null
        or new.last_error_message is not null
        or new.disconnected_at is not null
      then
        raise exception
          using
            errcode = '23514',
            message = 'A managed tracking domain must begin ownership pending and unregistered.';
      end if;
    end if;

    return new;
  end if;

  if not system_write_enabled
    and (
      new.provider is distinct from old.provider
      or new.provider_custom_domain_id is distinct from old.provider_custom_domain_id
      or new.provider_verification_status is distinct from old.provider_verification_status
      or new.provisioning_status is distinct from old.provisioning_status
      or new.dns_target is distinct from old.dns_target
      or new.ownership_verified_at is distinct from old.ownership_verified_at
      or new.dns_verified_at is distinct from old.dns_verified_at
      or new.tls_verified_at is distinct from old.tls_verified_at
      or new.last_checked_at is distinct from old.last_checked_at
      or new.last_error_code is distinct from old.last_error_code
      or new.last_error_message is distinct from old.last_error_message
      or new.disconnected_at is distinct from old.disconnected_at
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Tracking-domain provisioning fields are system-managed.';
  end if;

  if old.provider = 'manual'
    and new.provider is distinct from old.provider
    and not system_write_enabled
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only the managed-domain adoption workflow can convert a legacy domain.';
  end if;

  if old.provider_custom_domain_id is not null
    and new.provider_custom_domain_id is distinct from old.provider_custom_domain_id
    and new.provider_custom_domain_id is not null
  then
    raise exception
      using
        errcode = '23514',
        message = 'A provider custom-domain identifier is immutable once assigned.';
  end if;

  if new.provisioning_status = 'disconnected'::public.tracking_domain_provisioning_status
    and new.disconnected_at is null
  then
    raise exception
      using
        errcode = '23514',
        message = 'A disconnected tracking domain requires a disconnection time.';
  end if;

  if new.provisioning_status <> 'disconnected'::public.tracking_domain_provisioning_status
    and new.disconnected_at is not null
  then
    raise exception
      using
        errcode = '23514',
        message = 'Only a disconnected tracking domain can retain a disconnection time.';
  end if;

  return new;
end;
$function$;

create trigger tracking_domains_enforce_provisioning_write_rules
before insert or update
on public.tracking_domains
for each row
execute function private.enforce_tracking_domain_provisioning_write_rules();

revoke all
on function private.tracking_domain_system_write_enabled(),
   private.enforce_tracking_domain_provisioning_write_rules()
from public, anon, authenticated;

grant execute
on function private.tracking_domain_system_write_enabled()
to service_role;

comment on column public.tracking_domains.provider is
  'Infrastructure provider used to route and terminate TLS for the hostname. Existing domains remain manual; new dashboard-managed domains use Render.';

comment on column public.tracking_domains.provisioning_status is
  'Current dashboard-driven ownership, provider, DNS, and TLS provisioning stage.';

comment on column public.tracking_domains.dns_target is
  'Exact CNAME target shown to the domain owner for a managed non-root hostname.';

comment on column public.tracking_domains.last_error_message is
  'Sanitized operational error from the latest provisioning reconciliation attempt. Provider credentials are never stored here.';

commit;
