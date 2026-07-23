& {
  $ErrorActionPreference = 'Stop'

  function Assert-NativeCommand {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Step
    )

    if ($LASTEXITCODE -ne 0) {
      throw "$Step failed with exit code $LASTEXITCODE."
    }
  }

  function Write-Utf8NoBom {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path,

      [Parameter(Mandatory = $true)]
      [string]$Content
    )

    $fullPath = [System.IO.Path]::GetFullPath(
      (Join-Path (Get-Location) $Path)
    )

    $directory = [System.IO.Path]::GetDirectoryName($fullPath)

    if (-not [string]::IsNullOrWhiteSpace($directory)) {
      [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }

    [System.IO.File]::WriteAllText(
      $fullPath,
      $Content,
      (New-Object System.Text.UTF8Encoding($false))
    )
  }

  if (-not (Test-Path '.\package.json')) {
    throw 'Run this command from the affiliate-tracker repository root.'
  }

  Write-Host 'Writing Batch 08 Tracking Domains and Network Accounts files.'

  $migration = @'
begin;

create type public.tracking_domain_status as enum (
  'pending_verification',
  'active',
  'suspended',
  'archived'
);

create type public.network_provider_status as enum (
  'active',
  'archived'
);

create type public.network_account_status as enum (
  'active',
  'suspended',
  'archived'
);

create table public.tracking_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  hostname text not null,
  status public.tracking_domain_status not null default 'pending_verification',
  verification_token text not null,
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tracking_domains_hostname_unique
    unique (hostname),

  constraint tracking_domains_verification_token_unique
    unique (verification_token),

  constraint tracking_domains_hostname_check
    check (
      hostname = lower(hostname)
      and char_length(hostname) between 4 and 253
      and hostname ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    ),

  constraint tracking_domains_verification_token_check
    check (
      char_length(verification_token) between 32 and 128
      and verification_token ~ '^[A-Za-z0-9_-]+$'
    ),

  constraint tracking_domains_active_verified_check
    check (
      status <> 'active'
      or verified_at is not null
    ),

  constraint tracking_domains_primary_check
    check (
      not is_primary
      or (
        status = 'active'
        and verified_at is not null
      )
    )
);

create unique index tracking_domains_company_primary_unique
  on public.tracking_domains (company_id)
  where is_primary;

create index tracking_domains_company_status_created_at_idx
  on public.tracking_domains (
    company_id,
    status,
    created_at desc,
    id desc
  );

create table public.network_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  status public.network_provider_status not null default 'active',
  website_url text,
  documentation_url text,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint network_providers_code_unique
    unique (code),

  constraint network_providers_code_check
    check (
      code = lower(code)
      and code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      and char_length(code) between 2 and 80
    ),

  constraint network_providers_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint network_providers_website_url_check
    check (
      website_url is null
      or char_length(btrim(website_url)) between 8 and 2048
    ),

  constraint network_providers_documentation_url_check
    check (
      documentation_url is null
      or char_length(btrim(documentation_url)) between 8 and 2048
    )
);

create index network_providers_status_created_at_idx
  on public.network_providers (
    status,
    created_at desc,
    id desc
  );

create table public.network_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  provider_id uuid not null
    references public.network_providers (id)
    on delete restrict,
  name text not null,
  external_account_id text,
  status public.network_account_status not null default 'active',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint network_accounts_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint network_accounts_external_account_id_check
    check (
      external_account_id is null
      or char_length(btrim(external_account_id)) between 1 and 255
    )
);

create unique index network_accounts_company_provider_name_unique
  on public.network_accounts (
    company_id,
    provider_id,
    lower(name)
  );

create unique index network_accounts_company_provider_external_unique
  on public.network_accounts (
    company_id,
    provider_id,
    external_account_id
  )
  where external_account_id is not null;

create index network_accounts_company_status_created_at_idx
  on public.network_accounts (
    company_id,
    status,
    created_at desc,
    id desc
  );

create index network_accounts_provider_status_idx
  on public.network_accounts (
    provider_id,
    status,
    updated_at desc,
    id desc
  );

create trigger tracking_domains_set_updated_at
before update on public.tracking_domains
for each row
execute function private.set_updated_at();

create trigger network_providers_set_updated_at
before update on public.network_providers
for each row
execute function private.set_updated_at();

create trigger network_accounts_set_updated_at
before update on public.network_accounts
for each row
execute function private.set_updated_at();

create or replace function private.has_any_active_company_role(
  allowed_roles public.company_role[]
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
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.user_id = private.current_actor_user_id()
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
        and company.status = 'active'
    );
$function$;

create or replace function private.enforce_tracking_domain_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  target_company_id uuid;
begin
  actor_is_platform_admin := private.is_platform_super_admin();

  if tg_op = 'INSERT' then
    target_company_id := new.company_id;

    if not actor_is_platform_admin
      and not private.has_company_role(
        target_company_id,
        array['company_admin']::public.company_role[]
      )
    then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin or Company Admin can create tracking domains.';
    end if;

    if new.status <> 'pending_verification'
      or new.verified_at is not null
      or new.is_primary
    then
      raise exception
        using
          errcode = '23514',
          message = 'A new tracking domain must begin pending verification.';
    end if;
  else
    target_company_id := old.company_id;

    if not actor_is_platform_admin
      and not private.has_company_role(
        target_company_id,
        array['company_admin']::public.company_role[]
      )
    then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin or Company Admin can update tracking domains.';
    end if;

    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Tracking domain identity and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.hostname is distinct from old.hostname
        or new.status is distinct from old.status
        or new.verification_token is distinct from old.verification_token
        or new.verified_at is distinct from old.verified_at
        or new.is_primary is distinct from old.is_primary
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived tracking domain is immutable.';
    end if;

    if not actor_is_platform_admin then
      if new.status = 'active'
        and old.status <> 'active'
      then
        raise exception
          using
            errcode = '42501',
            message = 'Only a Platform Super Admin can verify and activate a tracking domain.';
      end if;

      if new.verified_at is distinct from old.verified_at
        and new.verified_at is not null
      then
        raise exception
          using
            errcode = '42501',
            message = 'Only a Platform Super Admin can set tracking-domain verification time.';
      end if;

      if new.verification_token is distinct from old.verification_token
        and new.hostname is not distinct from old.hostname
      then
        raise exception
          using
            errcode = '42501',
            message = 'A tracking-domain verification token can only change with its hostname.';
      end if;

      if new.hostname is distinct from old.hostname
        and (
          new.status <> 'pending_verification'
          or new.verified_at is not null
          or new.is_primary
        )
      then
        raise exception
          using
            errcode = '23514',
            message = 'Changing a hostname must reset tracking-domain verification.';
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from public.companies as company
    where company.id = target_company_id
      and (
        actor_is_platform_admin
        or company.status = 'active'
      )
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking domain requires an accessible company.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create trigger tracking_domains_enforce_write_rules
before insert or update
on public.tracking_domains
for each row
execute function private.enforce_tracking_domain_write_rules();

create or replace function private.enforce_network_provider_write_rules()
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
        message = 'Only a Platform Super Admin can modify network providers.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.code is distinct from old.code
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Network provider identity and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.name is distinct from old.name
        or new.status is distinct from old.status
        or new.website_url is distinct from old.website_url
        or new.documentation_url is distinct from old.documentation_url
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived network provider is immutable.';
    end if;

    if old.status = 'active'
      and new.status = 'archived'
      and exists (
        select 1
        from public.network_accounts as account
        where account.provider_id = old.id
          and account.status <> 'archived'
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'A network provider with open accounts cannot be archived.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger network_providers_enforce_write_rules
before insert or update
on public.network_providers
for each row
execute function private.enforce_network_provider_write_rules();

create or replace function private.enforce_network_account_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  target_company_id uuid;
begin
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  if not actor_is_platform_admin
    and not private.has_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin or Company Admin can modify network accounts.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.provider_id is distinct from old.provider_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Network account identity, company, provider, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.name is distinct from old.name
        or new.external_account_id is distinct from old.external_account_id
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived network account is immutable.';
    end if;
  end if;

  if not exists (
    select 1
    from public.companies as company
    where company.id = target_company_id
      and (
        actor_is_platform_admin
        or company.status = 'active'
      )
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'The network account requires an accessible company.';
  end if;

  if not exists (
    select 1
    from public.network_providers as provider
    where provider.id = new.provider_id
      and provider.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'The network account requires an active provider.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create trigger network_accounts_enforce_write_rules
before insert or update
on public.network_accounts
for each row
execute function private.enforce_network_account_write_rules();

alter table public.tracking_domains
  enable row level security;

alter table public.network_providers
  enable row level security;

alter table public.network_accounts
  enable row level security;

create policy tracking_domains_select_authorized
on public.tracking_domains
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

create policy tracking_domains_insert_company_admin
on public.tracking_domains
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy tracking_domains_update_company_admin
on public.tracking_domains
for update
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy network_providers_select_authorized
on public.network_providers
for select
to authenticated
using (
  private.is_platform_super_admin()
  or (
    status = 'active'
    and private.has_any_active_company_role(
      array[
        'company_admin',
        'manager'
      ]::public.company_role[]
    )
  )
);

create policy network_providers_insert_platform_admin
on public.network_providers
for insert
to authenticated
with check (
  private.is_platform_super_admin()
);

create policy network_providers_update_platform_admin
on public.network_providers
for update
to authenticated
using (
  private.is_platform_super_admin()
)
with check (
  private.is_platform_super_admin()
);

create policy network_accounts_select_authorized
on public.network_accounts
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

create policy network_accounts_insert_company_admin
on public.network_accounts
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy network_accounts_update_company_admin
on public.network_accounts
for update
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

revoke all
on public.tracking_domains,
   public.network_providers,
   public.network_accounts
from anon, authenticated;

grant select, insert, update
on public.tracking_domains
to authenticated;

grant select, insert, update
on public.network_providers
to authenticated;

grant select, insert, update
on public.network_accounts
to authenticated;

grant all
on public.tracking_domains,
   public.network_providers,
   public.network_accounts
to service_role;

revoke all
on function private.has_any_active_company_role(
  public.company_role[]
)
from public;

grant execute
on function private.has_any_active_company_role(
  public.company_role[]
)
to authenticated, service_role;

commit;
'@

  Write-Utf8NoBom `
    -Path '.\supabase\migrations\20260723003000_create_tracking_and_network_foundation.sql' `
    -Content $migration

  $types = @'
import type { CompanyStatus } from './company-management.types.js';

export type TrackingDomainStatus =
  | 'pending_verification'
  | 'active'
  | 'suspended'
  | 'archived';

export type NetworkProviderStatus = 'active' | 'archived';

export type NetworkAccountStatus = 'active' | 'suspended' | 'archived';

export interface TrackingDomainRecord {
  readonly id: string;
  readonly companyId: string;
  readonly hostname: string;
  readonly status: TrackingDomainStatus;
  readonly verificationToken: string;
  readonly verifiedAt: string | null;
  readonly isPrimary: boolean;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NetworkProviderRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: NetworkProviderStatus;
  readonly websiteUrl: string | null;
  readonly documentationUrl: string | null;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NetworkAccountRecord {
  readonly id: string;
  readonly companyId: string;
  readonly providerId: string;
  readonly providerCode: string;
  readonly providerName: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: NetworkAccountStatus;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrackingNetworkCompanyRecord {
  readonly id: string;
  readonly status: CompanyStatus;
}

export interface CreateTrackingDomainInput {
  readonly hostname: string;
}

export interface UpdateTrackingDomainInput {
  readonly hostname?: string;
  readonly status?: 'suspended' | 'archived';
  readonly isPrimary?: boolean;
}

export interface UpdatePlatformTrackingDomainStatusInput {
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface CreateNetworkProviderInput {
  readonly code: string;
  readonly name: string;
  readonly websiteUrl?: string | null;
  readonly documentationUrl?: string | null;
}

export interface UpdateNetworkProviderInput {
  readonly name?: string;
  readonly status?: NetworkProviderStatus;
  readonly websiteUrl?: string | null;
  readonly documentationUrl?: string | null;
}

export interface CreateNetworkAccountInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId?: string | null;
}

export interface UpdateNetworkAccountInput {
  readonly name?: string;
  readonly externalAccountId?: string | null;
  readonly status?: NetworkAccountStatus;
}

export interface UpdatePlatformNetworkAccountStatusInput {
  readonly status: NetworkAccountStatus;
}

export interface ListPlatformTrackingDomainsInput {
  readonly companyId?: string;
  readonly status?: TrackingDomainStatus;
}

export interface ListPlatformNetworkAccountsInput {
  readonly companyId?: string;
  readonly providerId?: string;
  readonly status?: NetworkAccountStatus;
}

export interface TrackingNetworkRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface TrackingDomainWriteInput {
  readonly hostname: string;
  readonly status: TrackingDomainStatus;
  readonly verificationToken: string;
  readonly verifiedAt: string | null;
  readonly isPrimary: boolean;
}

export interface NetworkProviderWriteInput {
  readonly code: string;
  readonly name: string;
  readonly status: NetworkProviderStatus;
  readonly websiteUrl: string | null;
  readonly documentationUrl: string | null;
}

export interface NetworkAccountWriteInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: NetworkAccountStatus;
}
'@

  Write-Utf8NoBom `
    -Path '.\apps\api\src\tracking-networks.types.ts' `
    -Content $types

  $repository = @'
import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  NetworkAccountRecord,
  NetworkAccountStatus,
  NetworkAccountWriteInput,
  NetworkProviderRecord,
  NetworkProviderStatus,
  NetworkProviderWriteInput,
  TrackingDomainRecord,
  TrackingDomainStatus,
  TrackingDomainWriteInput,
  TrackingNetworkCompanyRecord,
  TrackingNetworkRepositoryContext,
} from './tracking-networks.types.js';

type CompanyRow = Readonly<{
  id: string;
  status: string;
}> &
  Record<string, unknown>;

type TrackingDomainRow = Readonly<{
  id: string;
  company_id: string;
  hostname: string;
  status: string;
  verification_token: string;
  verified_at: Date | string | null;
  is_primary: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkProviderRow = Readonly<{
  id: string;
  code: string;
  name: string;
  status: string;
  website_url: string | null;
  documentation_url: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkAccountRow = Readonly<{
  id: string;
  company_id: string;
  provider_id: string;
  provider_code: string;
  provider_name: string;
  name: string;
  external_account_id: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type CountRow = Readonly<{
  count: string | number;
}> &
  Record<string, unknown>;

export interface TrackingNetworksRepository {
  getCompany(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
  ): Promise<TrackingNetworkCompanyRecord | undefined>;

  createTrackingDomain(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    input: TrackingDomainWriteInput,
  ): Promise<TrackingDomainRecord | undefined>;

  listCompanyTrackingDomains(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
  ): Promise<readonly TrackingDomainRecord[]>;

  listPlatformTrackingDomains(
    context: TrackingNetworkRepositoryContext,
    query: {
      readonly companyId?: string;
      readonly status?: TrackingDomainStatus;
    },
  ): Promise<readonly TrackingDomainRecord[]>;

  getTrackingDomain(
    context: TrackingNetworkRepositoryContext,
    domainId: string,
    companyId?: string,
  ): Promise<TrackingDomainRecord | undefined>;

  updateTrackingDomain(
    context: TrackingNetworkRepositoryContext,
    current: TrackingDomainRecord,
    input: TrackingDomainWriteInput,
    eventName: string,
  ): Promise<TrackingDomainRecord | undefined>;

  createNetworkProvider(
    context: TrackingNetworkRepositoryContext,
    input: NetworkProviderWriteInput,
  ): Promise<NetworkProviderRecord | undefined>;

  listNetworkProviders(
    context: TrackingNetworkRepositoryContext,
    status?: NetworkProviderStatus,
  ): Promise<readonly NetworkProviderRecord[]>;

  getNetworkProvider(
    context: TrackingNetworkRepositoryContext,
    providerId: string,
  ): Promise<NetworkProviderRecord | undefined>;

  updateNetworkProvider(
    context: TrackingNetworkRepositoryContext,
    current: NetworkProviderRecord,
    input: NetworkProviderWriteInput,
  ): Promise<NetworkProviderRecord | undefined>;

  countOpenNetworkAccountsForProvider(
    context: TrackingNetworkRepositoryContext,
    providerId: string,
  ): Promise<number>;

  createNetworkAccount(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    input: NetworkAccountWriteInput,
  ): Promise<NetworkAccountRecord | undefined>;

  listCompanyNetworkAccounts(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
  ): Promise<readonly NetworkAccountRecord[]>;

  listPlatformNetworkAccounts(
    context: TrackingNetworkRepositoryContext,
    query: {
      readonly companyId?: string;
      readonly providerId?: string;
      readonly status?: NetworkAccountStatus;
    },
  ): Promise<readonly NetworkAccountRecord[]>;

  getNetworkAccount(
    context: TrackingNetworkRepositoryContext,
    accountId: string,
    companyId?: string,
  ): Promise<NetworkAccountRecord | undefined>;

  updateNetworkAccount(
    context: TrackingNetworkRepositoryContext,
    current: NetworkAccountRecord,
    input: NetworkAccountWriteInput,
    eventName: string,
  ): Promise<NetworkAccountRecord | undefined>;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid timestamp.');
  }

  return date.toISOString();
}

function normalizeOptionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}

function parseCompanyStatus(value: string): TrackingNetworkCompanyRecord['status'] {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function parseTrackingDomainStatus(value: string): TrackingDomainStatus {
  switch (value) {
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported tracking-domain status.');
  }
}

function parseNetworkProviderStatus(value: string): NetworkProviderStatus {
  switch (value) {
    case 'active':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported network-provider status.');
  }
}

function parseNetworkAccountStatus(value: string): NetworkAccountStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported network-account status.');
  }
}

function mapCompanyRow(row: CompanyRow): TrackingNetworkCompanyRecord {
  return Object.freeze({
    id: row.id,
    status: parseCompanyStatus(row.status),
  });
}

function mapTrackingDomainRow(row: TrackingDomainRow): TrackingDomainRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    hostname: row.hostname,
    status: parseTrackingDomainStatus(row.status),
    verificationToken: row.verification_token,
    verifiedAt: normalizeOptionalTimestamp(row.verified_at),
    isPrimary: row.is_primary,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapNetworkProviderRow(row: NetworkProviderRow): NetworkProviderRecord {
  return Object.freeze({
    id: row.id,
    code: row.code,
    name: row.name,
    status: parseNetworkProviderStatus(row.status),
    websiteUrl: row.website_url,
    documentationUrl: row.documentation_url,
    createdBy: row.created_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapNetworkAccountRow(row: NetworkAccountRow): NetworkAccountRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    providerId: row.provider_id,
    providerCode: row.provider_code,
    providerName: row.provider_name,
    name: row.name,
    externalAccountId: row.external_account_id,
    status: parseNetworkAccountStatus(row.status),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function createDatabaseSessionContext(
  context: TrackingNetworkRepositoryContext,
): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    ...(context.companyId !== undefined
      ? {
          companyId: context.companyId,
        }
      : {}),
  };
}

function appendQueryValue(values: unknown[], value: unknown): string {
  values.push(value);

  return `$${String(values.length)}`;
}

async function writeAuditEvent(
  transaction: DatabaseTransaction,
  input: {
    readonly companyId: string | null;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly eventName: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await transaction.query({
    name: 'tracking-networks-write-audit-event',
    text: `
      insert into public.audit_events (
        company_id,
        actor_user_id,
        request_id,
        event_name,
        entity_type,
        entity_id,
        metadata
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
    `,
    values: [
      input.companyId,
      input.actorUserId,
      input.requestId,
      input.eventName,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata),
    ],
  });
}

const networkAccountSelection = `
  select
    account.id,
    account.company_id,
    account.provider_id,
    provider.code as provider_code,
    provider.name as provider_name,
    account.name,
    account.external_account_id,
    account.status,
    account.created_by,
    account.updated_by,
    account.created_at,
    account.updated_at
  from public.network_accounts as account
  inner join public.network_providers as provider
    on provider.id = account.provider_id
`;

export function createTrackingNetworksRepository(
  database: DatabaseRuntime,
): TrackingNetworksRepository {
  return Object.freeze<TrackingNetworksRepository>({
    async getCompany(context, companyId): Promise<TrackingNetworkCompanyRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'tracking-networks-get-company',
            text: `
              select
                id,
                status
              from public.companies
              where id = $1
              limit 1
            `,
            values: [companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapCompanyRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createTrackingDomain(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-create-domain',
            text: `
              insert into public.tracking_domains (
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3::public.tracking_domain_status,
                $4,
                $5,
                $6,
                $7,
                $7
              )
              on conflict do nothing
              returning
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              companyId,
              input.hostname,
              input.status,
              input.verificationToken,
              input.verifiedAt,
              input.isPrimary,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const domain = mapTrackingDomainRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'tracking_domain.created',
            entityType: 'tracking_domain',
            entityId: domain.id,
            metadata: {
              hostname: domain.hostname,
              status: domain.status,
            },
          });

          return domain;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanyTrackingDomains(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-list-company-domains',
            text: `
              select
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.tracking_domains
              where company_id = $1
              order by
                is_primary desc,
                created_at desc,
                id desc
            `,
            values: [companyId],
          });

          return Object.freeze(result.rows.map(mapTrackingDomainRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listPlatformTrackingDomains(context, query) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [];
          const conditions: string[] = [];

          if (query.companyId !== undefined) {
            conditions.push(`company_id = ${appendQueryValue(values, query.companyId)}::uuid`);
          }

          if (query.status !== undefined) {
            conditions.push(
              `status = ${appendQueryValue(values, query.status)}::public.tracking_domain_status`,
            );
          }

          const whereClause =
            conditions.length === 0 ? '' : `where ${conditions.join('\n                and ')}`;

          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-list-platform-domains',
            text: `
              select
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.tracking_domains
              ${whereClause}
              order by
                created_at desc,
                id desc
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapTrackingDomainRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getTrackingDomain(context, domainId, companyId) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [domainId];
          const companyCondition =
            companyId === undefined
              ? ''
              : `and company_id = ${appendQueryValue(values, companyId)}::uuid`;

          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-get-domain',
            text: `
              select
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.tracking_domains
              where id = $1
                ${companyCondition}
              limit 1
            `,
            values,
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapTrackingDomainRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateTrackingDomain(context, current, input, eventName) {
      return database.transaction(
        async (transaction) => {
          if (input.isPrimary) {
            await transaction.query({
              name: 'tracking-networks-clear-primary-domain',
              text: `
                update public.tracking_domains
                set is_primary = false
                where company_id = $1
                  and id <> $2
                  and is_primary
              `,
              values: [current.companyId, current.id],
            });
          }

          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-update-domain',
            text: `
              update public.tracking_domains
              set
                hostname = $4,
                status = $5::public.tracking_domain_status,
                verification_token = $6,
                verified_at = $7,
                is_primary = $8,
                updated_by = $9
              where id = $1
                and company_id = $2
                and updated_at = $3::timestamptz
                and not exists (
                  select 1
                  from public.tracking_domains as conflicting_domain
                  where conflicting_domain.hostname = $4
                    and conflicting_domain.id <> $1
                )
              returning
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              current.id,
              current.companyId,
              current.updatedAt,
              input.hostname,
              input.status,
              input.verificationToken,
              input.verifiedAt,
              input.isPrimary,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const domain = mapTrackingDomainRow(row);

          await writeAuditEvent(transaction, {
            companyId: domain.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName,
            entityType: 'tracking_domain',
            entityId: domain.id,
            metadata: {
              previousHostname: current.hostname,
              hostname: domain.hostname,
              previousStatus: current.status,
              status: domain.status,
              previousPrimary: current.isPrimary,
              isPrimary: domain.isPrimary,
              verifiedAt: domain.verifiedAt,
            },
          });

          return domain;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createNetworkProvider(context, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-create-provider',
            text: `
              insert into public.network_providers (
                code,
                name,
                status,
                website_url,
                documentation_url,
                created_by
              )
              values (
                $1,
                $2,
                $3::public.network_provider_status,
                $4,
                $5,
                $6
              )
              on conflict do nothing
              returning
                id,
                code,
                name,
                status,
                website_url,
                documentation_url,
                created_by,
                created_at,
                updated_at
            `,
            values: [
              input.code,
              input.name,
              input.status,
              input.websiteUrl,
              input.documentationUrl,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const provider = mapNetworkProviderRow(row);

          await writeAuditEvent(transaction, {
            companyId: null,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'network_provider.created',
            entityType: 'network_provider',
            entityId: provider.id,
            metadata: {
              code: provider.code,
              name: provider.name,
              status: provider.status,
            },
          });

          return provider;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listNetworkProviders(context, status) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-list-providers',
            text: `
              select
                id,
                code,
                name,
                status,
                website_url,
                documentation_url,
                created_by,
                created_at,
                updated_at
              from public.network_providers
              where (
                $1::public.network_provider_status is null
                or status = $1::public.network_provider_status
              )
              order by
                name asc,
                id asc
            `,
            values: [status ?? null],
          });

          return Object.freeze(result.rows.map(mapNetworkProviderRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getNetworkProvider(context, providerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-get-provider',
            text: `
              select
                id,
                code,
                name,
                status,
                website_url,
                documentation_url,
                created_by,
                created_at,
                updated_at
              from public.network_providers
              where id = $1
              limit 1
            `,
            values: [providerId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapNetworkProviderRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateNetworkProvider(context, current, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-update-provider',
            text: `
              update public.network_providers
              set
                name = $3,
                status = $4::public.network_provider_status,
                website_url = $5,
                documentation_url = $6
              where id = $1
                and updated_at = $2::timestamptz
              returning
                id,
                code,
                name,
                status,
                website_url,
                documentation_url,
                created_by,
                created_at,
                updated_at
            `,
            values: [
              current.id,
              current.updatedAt,
              input.name,
              input.status,
              input.websiteUrl,
              input.documentationUrl,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const provider = mapNetworkProviderRow(row);

          await writeAuditEvent(transaction, {
            companyId: null,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'network_provider.updated',
            entityType: 'network_provider',
            entityId: provider.id,
            metadata: {
              code: provider.code,
              previousStatus: current.status,
              status: provider.status,
              previousName: current.name,
              name: provider.name,
            },
          });

          return provider;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async countOpenNetworkAccountsForProvider(context, providerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CountRow>({
            name: 'tracking-networks-count-provider-accounts',
            text: `
              select count(*) as count
              from public.network_accounts
              where provider_id = $1
                and status <> 'archived'
            `,
            values: [providerId],
          });

          const value = result.rows[0]?.count ?? 0;
          const count = typeof value === 'number' ? value : Number.parseInt(value, 10);

          if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error('The database returned an invalid network-account count.');
          }

          return count;
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createNetworkAccount(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-create-account',
            text: `
              insert into public.network_accounts (
                company_id,
                provider_id,
                name,
                external_account_id,
                status,
                created_by,
                updated_by
              )
              select
                $1,
                provider.id,
                $3,
                $4,
                $5::public.network_account_status,
                $6,
                $6
              from public.network_providers as provider
              where provider.id = $2
                and provider.status = 'active'
              on conflict do nothing
              returning
                id,
                company_id,
                provider_id,
                (
                  select code
                  from public.network_providers
                  where id = provider_id
                ) as provider_code,
                (
                  select name
                  from public.network_providers
                  where id = provider_id
                ) as provider_name,
                name,
                external_account_id,
                status,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              companyId,
              input.providerId,
              input.name,
              input.externalAccountId,
              input.status,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const account = mapNetworkAccountRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'network_account.created',
            entityType: 'network_account',
            entityId: account.id,
            metadata: {
              providerId: account.providerId,
              providerCode: account.providerCode,
              name: account.name,
              status: account.status,
            },
          });

          return account;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanyNetworkAccounts(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-list-company-accounts',
            text: `
              ${networkAccountSelection}
              where account.company_id = $1
              order by
                provider.name asc,
                account.name asc,
                account.id asc
            `,
            values: [companyId],
          });

          return Object.freeze(result.rows.map(mapNetworkAccountRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listPlatformNetworkAccounts(context, query) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [];
          const conditions: string[] = [];

          if (query.companyId !== undefined) {
            conditions.push(
              `account.company_id = ${appendQueryValue(values, query.companyId)}::uuid`,
            );
          }

          if (query.providerId !== undefined) {
            conditions.push(
              `account.provider_id = ${appendQueryValue(values, query.providerId)}::uuid`,
            );
          }

          if (query.status !== undefined) {
            conditions.push(
              `account.status = ${appendQueryValue(values, query.status)}::public.network_account_status`,
            );
          }

          const whereClause =
            conditions.length === 0 ? '' : `where ${conditions.join('\n                and ')}`;

          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-list-platform-accounts',
            text: `
              ${networkAccountSelection}
              ${whereClause}
              order by
                account.created_at desc,
                account.id desc
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapNetworkAccountRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getNetworkAccount(context, accountId, companyId) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [accountId];
          const companyCondition =
            companyId === undefined
              ? ''
              : `and account.company_id = ${appendQueryValue(values, companyId)}::uuid`;

          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-get-account',
            text: `
              ${networkAccountSelection}
              where account.id = $1
                ${companyCondition}
              limit 1
            `,
            values,
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapNetworkAccountRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateNetworkAccount(context, current, input, eventName) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-update-account',
            text: `
              update public.network_accounts
              set
                name = $4,
                external_account_id = $5,
                status = $6::public.network_account_status,
                updated_by = $7
              where id = $1
                and company_id = $2
                and updated_at = $3::timestamptz
                and not exists (
                  select 1
                  from public.network_accounts as conflicting_account
                  where conflicting_account.company_id = $2
                    and conflicting_account.provider_id = $8
                    and conflicting_account.id <> $1
                    and (
                      lower(conflicting_account.name) = lower($4)
                      or (
                        $5 is not null
                        and conflicting_account.external_account_id = $5
                      )
                    )
                )
              returning
                id,
                company_id,
                provider_id,
                (
                  select code
                  from public.network_providers
                  where id = provider_id
                ) as provider_code,
                (
                  select name
                  from public.network_providers
                  where id = provider_id
                ) as provider_name,
                name,
                external_account_id,
                status,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              current.id,
              current.companyId,
              current.updatedAt,
              input.name,
              input.externalAccountId,
              input.status,
              context.actorUserId,
              current.providerId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const account = mapNetworkAccountRow(row);

          await writeAuditEvent(transaction, {
            companyId: account.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName,
            entityType: 'network_account',
            entityId: account.id,
            metadata: {
              providerId: account.providerId,
              providerCode: account.providerCode,
              previousName: current.name,
              name: account.name,
              previousStatus: current.status,
              status: account.status,
              previousExternalAccountId: current.externalAccountId,
              externalAccountId: account.externalAccountId,
            },
          });

          return account;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
'@

  Write-Utf8NoBom `
    -Path '.\apps\api\src\tracking-networks.repository.ts' `
    -Content $repository

  $service = @'
import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';

import { assertCompanyRole, assertPlatformSuperAdmin } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { TrackingNetworksRepository } from './tracking-networks.repository.js';
import type {
  CreateNetworkAccountInput,
  CreateNetworkProviderInput,
  CreateTrackingDomainInput,
  ListPlatformNetworkAccountsInput,
  ListPlatformTrackingDomainsInput,
  NetworkAccountRecord,
  NetworkAccountStatus,
  NetworkAccountWriteInput,
  NetworkProviderRecord,
  NetworkProviderStatus,
  NetworkProviderWriteInput,
  TrackingDomainRecord,
  TrackingDomainStatus,
  TrackingDomainWriteInput,
  TrackingNetworkCompanyRecord,
  TrackingNetworkRepositoryContext,
  UpdateNetworkAccountInput,
  UpdateNetworkProviderInput,
  UpdatePlatformNetworkAccountStatusInput,
  UpdatePlatformTrackingDomainStatusInput,
  UpdateTrackingDomainInput,
} from './tracking-networks.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PROVIDER_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export interface TrackingNetworksServiceOptions {
  readonly now?: () => Date;
  readonly createVerificationToken?: () => string;
}

export interface TrackingNetworksService {
  createTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateTrackingDomainInput,
  ): Promise<TrackingDomainRecord>;

  listCompanyTrackingDomains(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly TrackingDomainRecord[]>;

  getCompanyTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    domainId: string,
  ): Promise<TrackingDomainRecord>;

  updateCompanyTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    domainId: string,
    input: UpdateTrackingDomainInput,
  ): Promise<TrackingDomainRecord>;

  listPlatformTrackingDomains(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: ListPlatformTrackingDomainsInput,
  ): Promise<readonly TrackingDomainRecord[]>;

  updatePlatformTrackingDomainStatus(
    identity: ResolvedApiIdentity,
    requestId: string,
    domainId: string,
    input: UpdatePlatformTrackingDomainStatusInput,
  ): Promise<TrackingDomainRecord>;

  createNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: CreateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  listPlatformNetworkProviders(
    identity: ResolvedApiIdentity,
    requestId: string,
    status?: NetworkProviderStatus,
  ): Promise<readonly NetworkProviderRecord[]>;

  getPlatformNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    providerId: string,
  ): Promise<NetworkProviderRecord>;

  updateNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    providerId: string,
    input: UpdateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  listTenantNetworkProviders(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly NetworkProviderRecord[]>;

  createNetworkAccount(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateNetworkAccountInput,
  ): Promise<NetworkAccountRecord>;

  listCompanyNetworkAccounts(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly NetworkAccountRecord[]>;

  getCompanyNetworkAccount(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    accountId: string,
  ): Promise<NetworkAccountRecord>;

  updateCompanyNetworkAccount(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    accountId: string,
    input: UpdateNetworkAccountInput,
  ): Promise<NetworkAccountRecord>;

  listPlatformNetworkAccounts(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: ListPlatformNetworkAccountsInput,
  ): Promise<readonly NetworkAccountRecord[]>;

  updatePlatformNetworkAccountStatus(
    identity: ResolvedApiIdentity,
    requestId: string,
    accountId: string,
    input: UpdatePlatformNetworkAccountStatusInput,
  ): Promise<NetworkAccountRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeHostname(value: string): string {
  const normalizedValue = value.trim().toLowerCase().replace(/\.$/, '');

  if (
    normalizedValue.length < 4 ||
    normalizedValue.length > 253 ||
    !HOSTNAME_PATTERN.test(normalizedValue) ||
    isIP(normalizedValue) !== 0
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'hostname must be a valid lowercase fully qualified domain name.',
    );
  }

  return normalizedValue;
}

function normalizeProviderCode(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 2 ||
    normalizedValue.length > 80 ||
    !PROVIDER_CODE_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Provider code must contain 2 to 80 lowercase letters, numbers, or single underscores.',
    );
  }

  return normalizedValue;
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length < minimumLength ||
    normalizedValue.length > maximumLength
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain ${String(minimumLength)} to ${String(maximumLength)} characters.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalNullableText(
  value: string | null | undefined,
  fieldName: string,
  maximumLength: number,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain 1 to ${String(maximumLength)} characters or be null.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalUrl(
  value: string | null | undefined,
  fieldName: string,
): string | null | undefined {
  const normalizedValue = normalizeOptionalNullableText(value, fieldName, 2048);

  if (normalizedValue === undefined || normalizedValue === null) {
    return normalizedValue;
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch (error: unknown) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a valid URL.`, {
      cause: error,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must use the http or https protocol.`,
    );
  }

  return url.toString();
}

function normalizeTrackingDomainStatus(value: TrackingDomainStatus): TrackingDomainStatus {
  switch (value) {
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'Tracking-domain status is invalid.');
  }
}

function normalizeTenantTrackingDomainStatus(
  value: 'suspended' | 'archived',
): 'suspended' | 'archived' {
  switch (value) {
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'Tenant tracking-domain status must be suspended or archived.',
      );
  }
}

function normalizeNetworkProviderStatus(
  value: NetworkProviderStatus,
  code: 'INVALID_QUERY_PARAMETER' | 'INVALID_REQUEST_BODY',
): NetworkProviderStatus {
  switch (value) {
    case 'active':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(code, 400, 'Network-provider status is invalid.');
  }
}

function normalizeNetworkAccountStatus(
  value: NetworkAccountStatus,
  code: 'INVALID_QUERY_PARAMETER' | 'INVALID_REQUEST_BODY',
): NetworkAccountStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(code, 400, 'Network-account status is invalid.');
  }
}

function normalizeVerificationToken(value: string): string {
  if (
    value.length < 32 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error('The tracking-domain verification token generator returned an invalid value.');
  }

  return value;
}

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): TrackingNetworkRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    ...(companyId !== undefined
      ? {
          companyId,
        }
      : {}),
  };
}

function assertCompanyRequestContext(identity: ResolvedApiIdentity, companyId: string): void {
  if (identity.requestedCompanyId === undefined) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_REQUIRED',
      400,
      'The x-company-id header is required for this operation.',
    );
  }

  if (identity.requestedCompanyId !== companyId) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_MISMATCH',
      400,
      'The x-company-id header must match the company route parameter.',
    );
  }
}

async function requireCompany(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
): Promise<TrackingNetworkCompanyRecord> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  return company;
}

async function requireActiveCompany(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
): Promise<TrackingNetworkCompanyRecord> {
  const company = await requireCompany(repository, context, companyId);

  if (company.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_NETWORK_COMPANY_INACTIVE',
      409,
      'Tracking and network configuration requires an active company.',
    );
  }

  return company;
}

async function requireTrackingDomain(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  domainId: string,
  companyId?: string,
): Promise<TrackingDomainRecord> {
  const domain = await repository.getTrackingDomain(context, domainId, companyId);

  if (domain === undefined) {
    throw new ApiHttpError(
      'TRACKING_DOMAIN_NOT_FOUND',
      404,
      'The requested tracking domain was not found.',
    );
  }

  return domain;
}

async function requireNetworkProvider(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  providerId: string,
): Promise<NetworkProviderRecord> {
  const provider = await repository.getNetworkProvider(context, providerId);

  if (provider === undefined) {
    throw new ApiHttpError(
      'NETWORK_PROVIDER_NOT_FOUND',
      404,
      'The requested network provider was not found.',
    );
  }

  return provider;
}

async function requireActiveNetworkProvider(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  providerId: string,
): Promise<NetworkProviderRecord> {
  const provider = await requireNetworkProvider(repository, context, providerId);

  if (provider.status !== 'active') {
    throw new ApiHttpError(
      'NETWORK_PROVIDER_ARCHIVED',
      409,
      'An archived network provider cannot receive new accounts.',
    );
  }

  return provider;
}

async function requireNetworkAccount(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  accountId: string,
  companyId?: string,
): Promise<NetworkAccountRecord> {
  const account = await repository.getNetworkAccount(context, accountId, companyId);

  if (account === undefined) {
    throw new ApiHttpError(
      'NETWORK_ACCOUNT_NOT_FOUND',
      404,
      'The requested network account was not found.',
    );
  }

  return account;
}

function trackingDomainsAreEquivalent(
  current: TrackingDomainRecord,
  next: TrackingDomainWriteInput,
): boolean {
  return (
    current.hostname === next.hostname &&
    current.status === next.status &&
    current.verificationToken === next.verificationToken &&
    current.verifiedAt === next.verifiedAt &&
    current.isPrimary === next.isPrimary
  );
}

function providersAreEquivalent(
  current: NetworkProviderRecord,
  next: NetworkProviderWriteInput,
): boolean {
  return (
    current.name === next.name &&
    current.status === next.status &&
    current.websiteUrl === next.websiteUrl &&
    current.documentationUrl === next.documentationUrl
  );
}

function accountsAreEquivalent(
  current: NetworkAccountRecord,
  next: NetworkAccountWriteInput,
): boolean {
  return (
    current.name === next.name &&
    current.externalAccountId === next.externalAccountId &&
    current.status === next.status
  );
}

function assertNetworkAccountTransition(
  currentStatus: NetworkAccountStatus,
  nextStatus: NetworkAccountStatus,
): void {
  if (currentStatus === 'archived') {
    throw new ApiHttpError(
      'NETWORK_ACCOUNT_ARCHIVED',
      409,
      'An archived network account is immutable.',
    );
  }

  const valid =
    currentStatus === nextStatus ||
    (currentStatus === 'active' &&
      (nextStatus === 'suspended' || nextStatus === 'archived')) ||
    (currentStatus === 'suspended' &&
      (nextStatus === 'active' || nextStatus === 'archived'));

  if (!valid) {
    throw new ApiHttpError(
      'NETWORK_ACCOUNT_STATUS_TRANSITION_INVALID',
      409,
      `A network account cannot transition from ${currentStatus} to ${nextStatus}.`,
    );
  }
}

export function createTrackingNetworksService(
  repository: TrackingNetworksRepository,
  options: TrackingNetworksServiceOptions = {},
): TrackingNetworksService {
  const getNow = options.now ?? (() => new Date());
  const createVerificationToken =
    options.createVerificationToken ?? (() => randomBytes(32).toString('base64url'));

  return Object.freeze<TrackingNetworksService>({
    async createTrackingDomain(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const domain = await repository.createTrackingDomain(context, companyId, {
        hostname: normalizeHostname(input.hostname),
        status: 'pending_verification',
        verificationToken: normalizeVerificationToken(createVerificationToken()),
        verifiedAt: null,
        isPrimary: false,
      });

      if (domain === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_HOSTNAME_CONFLICT',
          409,
          'This tracking hostname or verification token is already registered.',
        );
      }

      return domain;
    },

    async listCompanyTrackingDomains(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listCompanyTrackingDomains(context, companyId);
    },

    async getCompanyTrackingDomain(
      identity,
      requestId,
      companyIdValue,
      domainIdValue,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireTrackingDomain(repository, context, domainId, companyId);
    },

    async updateCompanyTrackingDomain(
      identity,
      requestId,
      companyIdValue,
      domainIdValue,
      input,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireTrackingDomain(repository, context, domainId, companyId);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_ARCHIVED',
          409,
          'An archived tracking domain is immutable.',
        );
      }

      if (
        input.hostname === undefined &&
        input.status === undefined &&
        input.isPrimary === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one tracking-domain field must be provided.',
        );
      }

      let hostname = current.hostname;
      let verificationToken = current.verificationToken;
      let verifiedAt = current.verifiedAt;
      let status: TrackingDomainStatus = current.status;
      let isPrimary = current.isPrimary;

      if (input.hostname !== undefined) {
        hostname = normalizeHostname(input.hostname);

        if (hostname !== current.hostname) {
          if (current.status !== 'pending_verification') {
            throw new ApiHttpError(
              'TRACKING_DOMAIN_HOSTNAME_LOCKED',
              409,
              'A verified or suspended tracking-domain hostname cannot be changed.',
            );
          }

          verificationToken = createVerificationToken();
          verifiedAt = null;
          status = 'pending_verification';
          isPrimary = false;
        }
      }

      if (input.status !== undefined) {
        status = normalizeTenantTrackingDomainStatus(input.status);
        isPrimary = false;
      }

      if (input.isPrimary !== undefined) {
        isPrimary = input.isPrimary;
      }

      if (isPrimary && (status !== 'active' || verifiedAt === null)) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNVERIFIED',
          409,
          'Only an active verified tracking domain can be primary.',
        );
      }

      const next = Object.freeze<TrackingDomainWriteInput>({
        hostname,
        status,
        verificationToken,
        verifiedAt,
        isPrimary,
      });

      if (trackingDomainsAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNCHANGED',
          409,
          'The tracking domain already contains the requested values.',
        );
      }

      const updated = await repository.updateTrackingDomain(
        context,
        current,
        next,
        'tracking_domain.updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UPDATE_CONFLICT',
          409,
          'The tracking domain changed or its hostname conflicted before this request completed.',
        );
      }

      return updated;
    },

    async listPlatformTrackingDomains(identity, requestId, input) {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listPlatformTrackingDomains(
        createRepositoryContext(identity, requestId),
        {
          ...(input.companyId !== undefined
            ? {
                companyId: normalizeUuid(input.companyId, 'Company ID'),
              }
            : {}),
          ...(input.status !== undefined
            ? {
                status: normalizeTrackingDomainStatus(input.status),
              }
            : {}),
        },
      );
    },

    async updatePlatformTrackingDomainStatus(
      identity,
      requestId,
      domainIdValue,
      input,
    ) {
      assertPlatformSuperAdmin(identity.subject);

      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');
      const readContext = createRepositoryContext(identity, requestId);
      const current = await requireTrackingDomain(repository, readContext, domainId);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_ARCHIVED',
          409,
          'An archived tracking domain is immutable.',
        );
      }

      if (current.status === input.status) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNCHANGED',
          409,
          'The tracking domain already has the requested status.',
        );
      }

      const now = getNow().toISOString();
      const next = Object.freeze<TrackingDomainWriteInput>({
        hostname: current.hostname,
        status: input.status,
        verificationToken: current.verificationToken,
        verifiedAt: input.status === 'active' ? current.verifiedAt ?? now : current.verifiedAt,
        isPrimary: input.status === 'active' ? current.isPrimary : false,
      });

      const updated = await repository.updateTrackingDomain(
        createRepositoryContext(identity, requestId, current.companyId),
        current,
        next,
        input.status === 'active'
          ? 'tracking_domain.verified'
          : 'tracking_domain.status_updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UPDATE_CONFLICT',
          409,
          'The tracking domain changed before this request completed.',
        );
      }

      return updated;
    },

    async createNetworkProvider(identity, requestId, input) {
      assertPlatformSuperAdmin(identity.subject);

      const provider = await repository.createNetworkProvider(
        createRepositoryContext(identity, requestId),
        Object.freeze<NetworkProviderWriteInput>({
          code: normalizeProviderCode(input.code),
          name: normalizeRequiredText(input.name, 'name', 2, 160),
          status: 'active',
          websiteUrl: normalizeOptionalUrl(input.websiteUrl, 'websiteUrl') ?? null,
          documentationUrl:
            normalizeOptionalUrl(input.documentationUrl, 'documentationUrl') ?? null,
        }),
      );

      if (provider === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_CODE_CONFLICT',
          409,
          'A network provider with this code already exists.',
        );
      }

      return provider;
    },

    async listPlatformNetworkProviders(identity, requestId, status) {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listNetworkProviders(
        createRepositoryContext(identity, requestId),
        status === undefined
          ? undefined
          : normalizeNetworkProviderStatus(status, 'INVALID_QUERY_PARAMETER'),
      );
    },

    async getPlatformNetworkProvider(identity, requestId, providerIdValue) {
      assertPlatformSuperAdmin(identity.subject);

      return requireNetworkProvider(
        repository,
        createRepositoryContext(identity, requestId),
        normalizeUuid(providerIdValue, 'Network provider ID'),
      );
    },

    async updateNetworkProvider(identity, requestId, providerIdValue, input) {
      assertPlatformSuperAdmin(identity.subject);

      const providerId = normalizeUuid(providerIdValue, 'Network provider ID');
      const context = createRepositoryContext(identity, requestId);
      const current = await requireNetworkProvider(repository, context, providerId);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_ARCHIVED',
          409,
          'An archived network provider is immutable.',
        );
      }

      if (
        input.name === undefined &&
        input.status === undefined &&
        input.websiteUrl === undefined &&
        input.documentationUrl === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one network-provider field must be provided.',
        );
      }

      const next = Object.freeze<NetworkProviderWriteInput>({
        code: current.code,
        name:
          input.name === undefined
            ? current.name
            : normalizeRequiredText(input.name, 'name', 2, 160),
        status:
          input.status === undefined
            ? current.status
            : normalizeNetworkProviderStatus(input.status, 'INVALID_REQUEST_BODY'),
        websiteUrl:
          input.websiteUrl === undefined
            ? current.websiteUrl
            : normalizeOptionalUrl(input.websiteUrl, 'websiteUrl') ?? null,
        documentationUrl:
          input.documentationUrl === undefined
            ? current.documentationUrl
            : normalizeOptionalUrl(input.documentationUrl, 'documentationUrl') ?? null,
      });

      if (providersAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_UNCHANGED',
          409,
          'The network provider already contains the requested values.',
        );
      }

      if (next.status === 'archived') {
        const openAccounts = await repository.countOpenNetworkAccountsForProvider(
          context,
          providerId,
        );

        if (openAccounts > 0) {
          throw new ApiHttpError(
            'NETWORK_PROVIDER_IN_USE',
            409,
            'A network provider with open company accounts cannot be archived.',
          );
        }
      }

      const updated = await repository.updateNetworkProvider(context, current, next);

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_UPDATE_CONFLICT',
          409,
          'The network provider changed before this request completed.',
        );
      }

      return updated;
    },

    async listTenantNetworkProviders(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listNetworkProviders(context, 'active');
    },

    async createNetworkAccount(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const providerId = normalizeUuid(input.providerId, 'Network provider ID');

      await requireActiveNetworkProvider(repository, context, providerId);

      const account = await repository.createNetworkAccount(context, companyId, {
        providerId,
        name: normalizeRequiredText(input.name, 'name', 2, 160),
        externalAccountId:
          normalizeOptionalNullableText(
            input.externalAccountId,
            'externalAccountId',
            255,
          ) ?? null,
        status: 'active',
      });

      if (account === undefined) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_CONFLICT',
          409,
          'A network account with this provider name or external account ID already exists.',
        );
      }

      return account;
    },

    async listCompanyNetworkAccounts(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listCompanyNetworkAccounts(context, companyId);
    },

    async getCompanyNetworkAccount(
      identity,
      requestId,
      companyIdValue,
      accountIdValue,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const accountId = normalizeUuid(accountIdValue, 'Network account ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireNetworkAccount(repository, context, accountId, companyId);
    },

    async updateCompanyNetworkAccount(
      identity,
      requestId,
      companyIdValue,
      accountIdValue,
      input,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const accountId = normalizeUuid(accountIdValue, 'Network account ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireNetworkAccount(repository, context, accountId, companyId);

      if (
        input.name === undefined &&
        input.externalAccountId === undefined &&
        input.status === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one network-account field must be provided.',
        );
      }

      const nextStatus =
        input.status === undefined
          ? current.status
          : normalizeNetworkAccountStatus(input.status, 'INVALID_REQUEST_BODY');

      assertNetworkAccountTransition(current.status, nextStatus);

      const next = Object.freeze<NetworkAccountWriteInput>({
        providerId: current.providerId,
        name:
          input.name === undefined
            ? current.name
            : normalizeRequiredText(input.name, 'name', 2, 160),
        externalAccountId:
          input.externalAccountId === undefined
            ? current.externalAccountId
            : normalizeOptionalNullableText(
                  input.externalAccountId,
                  'externalAccountId',
                  255,
                ) ?? null,
        status: nextStatus,
      });

      if (accountsAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UNCHANGED',
          409,
          'The network account already contains the requested values.',
        );
      }

      const updated = await repository.updateNetworkAccount(
        context,
        current,
        next,
        'network_account.updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UPDATE_CONFLICT',
          409,
          'The network account changed or conflicted before this request completed.',
        );
      }

      return updated;
    },

    async listPlatformNetworkAccounts(identity, requestId, input) {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listPlatformNetworkAccounts(
        createRepositoryContext(identity, requestId),
        {
          ...(input.companyId !== undefined
            ? {
                companyId: normalizeUuid(input.companyId, 'Company ID'),
              }
            : {}),
          ...(input.providerId !== undefined
            ? {
                providerId: normalizeUuid(input.providerId, 'Network provider ID'),
              }
            : {}),
          ...(input.status !== undefined
            ? {
                status: normalizeNetworkAccountStatus(
                  input.status,
                  'INVALID_QUERY_PARAMETER',
                ),
              }
            : {}),
        },
      );
    },

    async updatePlatformNetworkAccountStatus(
      identity,
      requestId,
      accountIdValue,
      input,
    ) {
      assertPlatformSuperAdmin(identity.subject);

      const accountId = normalizeUuid(accountIdValue, 'Network account ID');
      const readContext = createRepositoryContext(identity, requestId);
      const current = await requireNetworkAccount(repository, readContext, accountId);
      const nextStatus = normalizeNetworkAccountStatus(input.status, 'INVALID_REQUEST_BODY');

      assertNetworkAccountTransition(current.status, nextStatus);

      if (current.status === nextStatus) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UNCHANGED',
          409,
          'The network account already has the requested status.',
        );
      }

      const updated = await repository.updateNetworkAccount(
        createRepositoryContext(identity, requestId, current.companyId),
        current,
        {
          providerId: current.providerId,
          name: current.name,
          externalAccountId: current.externalAccountId,
          status: nextStatus,
        },
        'network_account.status_updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UPDATE_CONFLICT',
          409,
          'The network account changed before this request completed.',
        );
      }

      return updated;
    },
  });
}

export type {
  CreateNetworkAccountInput,
  CreateNetworkProviderInput,
  CreateTrackingDomainInput,
  ListPlatformNetworkAccountsInput,
  ListPlatformTrackingDomainsInput,
  NetworkAccountRecord,
  NetworkProviderRecord,
  TrackingDomainRecord,
  UpdateNetworkAccountInput,
  UpdateNetworkProviderInput,
  UpdatePlatformNetworkAccountStatusInput,
  UpdatePlatformTrackingDomainStatusInput,
  UpdateTrackingDomainInput,
} from './tracking-networks.types.js';
'@

  Write-Utf8NoBom `
    -Path '.\apps\api\src\tracking-networks.service.ts' `
    -Content $service

  $routes = @'
import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';
import type { TrackingNetworksService } from './tracking-networks.service.js';
import type {
  NetworkAccountStatus,
  NetworkProviderStatus,
  TrackingDomainStatus,
} from './tracking-networks.types.js';

export interface CreateTrackingNetworksRouterOptions {
  readonly service: TrackingNetworksService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(request: Request): Record<string, unknown> {
  const body = request.body as unknown;

  if (!isRecord(body)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'The request body must be a JSON object.');
  }

  return body;
}

function readRequiredString(body: Record<string, unknown>, propertyName: string): string {
  const value = body[propertyName];

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a string.`,
    );
  }

  return value;
}

function readOptionalString(
  body: Record<string, unknown>,
  propertyName: string,
): string | undefined {
  const value = body[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a string.`,
    );
  }

  return value;
}

function readOptionalNullableString(
  body: Record<string, unknown>,
  propertyName: string,
): string | null | undefined {
  const value = body[propertyName];

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a string or null.`,
    );
  }

  return value;
}

function readOptionalBoolean(
  body: Record<string, unknown>,
  propertyName: string,
): boolean | undefined {
  const value = body[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a boolean.`,
    );
  }

  return value;
}

function readRouteParameter(request: Request, propertyName: string): string {
  const value = request.params[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${propertyName} is required.`);
  }

  return value;
}

function readOptionalQueryString(request: Request, propertyName: string): string | undefined {
  const value = request.query[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `${propertyName} must be a single string value.`,
    );
  }

  return value;
}

function readTrackingDomainStatusBody(
  body: Record<string, unknown>,
): 'suspended' | 'archived' | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be suspended or archived for a tenant tracking-domain update.',
      );
  }
}

function readPlatformTrackingDomainStatus(
  body: Record<string, unknown>,
): 'active' | 'suspended' | 'archived' {
  const value = body['status'];

  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be active, suspended, or archived.',
      );
  }
}

function readOptionalTrackingDomainStatusQuery(
  request: Request,
): TrackingDomainStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be pending_verification, active, suspended, or archived.',
      );
  }
}

function readOptionalNetworkProviderStatusBody(
  body: Record<string, unknown>,
): NetworkProviderStatus | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be active or archived.',
      );
  }
}

function readOptionalNetworkProviderStatusQuery(
  request: Request,
): NetworkProviderStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be active or archived.',
      );
  }
}

function readOptionalNetworkAccountStatusBody(
  body: Record<string, unknown>,
): NetworkAccountStatus | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be active, suspended, or archived.',
      );
  }
}

function readRequiredNetworkAccountStatus(
  body: Record<string, unknown>,
): NetworkAccountStatus {
  const value = readOptionalNetworkAccountStatusBody(body);

  if (value === undefined) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is required.');
  }

  return value;
}

function readOptionalNetworkAccountStatusQuery(
  request: Request,
): NetworkAccountStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be active, suspended, or archived.',
      );
  }
}

function resolveRequestInformation(request: Request) {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createTrackingNetworksRouter(
  options: CreateTrackingNetworksRouterOptions,
): Router {
  const router = Router();

  const createTrackingDomainHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const domain = await options.service.createTrackingDomain(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        hostname: readRequiredString(body, 'hostname'),
      },
    );

    response.status(201).json({
      data: domain,
    });
  };

  const listCompanyTrackingDomainsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const domains = await options.service.listCompanyTrackingDomains(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: domains,
    });
  };

  const getCompanyTrackingDomainHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const domain = await options.service.getCompanyTrackingDomain(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'domainId'),
    );

    response.status(200).json({
      data: domain,
    });
  };

  const updateCompanyTrackingDomainHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const hostname = readOptionalString(body, 'hostname');
    const status = readTrackingDomainStatusBody(body);
    const isPrimary = readOptionalBoolean(body, 'isPrimary');

    const domain = await options.service.updateCompanyTrackingDomain(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'domainId'),
      {
        ...(hostname !== undefined ? { hostname } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(isPrimary !== undefined ? { isPrimary } : {}),
      },
    );

    response.status(200).json({
      data: domain,
    });
  };

  const listPlatformTrackingDomainsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const companyId = readOptionalQueryString(request, 'companyId');
    const status = readOptionalTrackingDomainStatusQuery(request);

    const domains = await options.service.listPlatformTrackingDomains(
      requestInformation.identity,
      requestInformation.requestId,
      {
        ...(companyId !== undefined ? { companyId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: domains,
    });
  };

  const updatePlatformTrackingDomainStatusHandler: RequestHandler = async (
    request,
    response,
  ) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const domain = await options.service.updatePlatformTrackingDomainStatus(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'domainId'),
      {
        status: readPlatformTrackingDomainStatus(body),
      },
    );

    response.status(200).json({
      data: domain,
    });
  };

  const createNetworkProviderHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const websiteUrl = readOptionalNullableString(body, 'websiteUrl');
    const documentationUrl = readOptionalNullableString(body, 'documentationUrl');

    const provider = await options.service.createNetworkProvider(
      requestInformation.identity,
      requestInformation.requestId,
      {
        code: readRequiredString(body, 'code'),
        name: readRequiredString(body, 'name'),
        ...(websiteUrl !== undefined ? { websiteUrl } : {}),
        ...(documentationUrl !== undefined ? { documentationUrl } : {}),
      },
    );

    response.status(201).json({
      data: provider,
    });
  };

  const listPlatformNetworkProvidersHandler: RequestHandler = async (
    request,
    response,
  ) => {
    const requestInformation = resolveRequestInformation(request);

    const providers = await options.service.listPlatformNetworkProviders(
      requestInformation.identity,
      requestInformation.requestId,
      readOptionalNetworkProviderStatusQuery(request),
    );

    response.status(200).json({
      data: providers,
    });
  };

  const getPlatformNetworkProviderHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const provider = await options.service.getPlatformNetworkProvider(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'providerId'),
    );

    response.status(200).json({
      data: provider,
    });
  };

  const updateNetworkProviderHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const name = readOptionalString(body, 'name');
    const status = readOptionalNetworkProviderStatusBody(body);
    const websiteUrl = readOptionalNullableString(body, 'websiteUrl');
    const documentationUrl = readOptionalNullableString(body, 'documentationUrl');

    const provider = await options.service.updateNetworkProvider(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'providerId'),
      {
        ...(name !== undefined ? { name } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(websiteUrl !== undefined ? { websiteUrl } : {}),
        ...(documentationUrl !== undefined ? { documentationUrl } : {}),
      },
    );

    response.status(200).json({
      data: provider,
    });
  };

  const listTenantNetworkProvidersHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const providers = await options.service.listTenantNetworkProviders(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: providers,
    });
  };

  const createNetworkAccountHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const externalAccountId = readOptionalNullableString(body, 'externalAccountId');

    const account = await options.service.createNetworkAccount(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        providerId: readRequiredString(body, 'providerId'),
        name: readRequiredString(body, 'name'),
        ...(externalAccountId !== undefined ? { externalAccountId } : {}),
      },
    );

    response.status(201).json({
      data: account,
    });
  };

  const listCompanyNetworkAccountsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const accounts = await options.service.listCompanyNetworkAccounts(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: accounts,
    });
  };

  const getCompanyNetworkAccountHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const account = await options.service.getCompanyNetworkAccount(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
    );

    response.status(200).json({
      data: account,
    });
  };

  const updateCompanyNetworkAccountHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const name = readOptionalString(body, 'name');
    const externalAccountId = readOptionalNullableString(body, 'externalAccountId');
    const status = readOptionalNetworkAccountStatusBody(body);

    const account = await options.service.updateCompanyNetworkAccount(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
      {
        ...(name !== undefined ? { name } : {}),
        ...(externalAccountId !== undefined ? { externalAccountId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: account,
    });
  };

  const listPlatformNetworkAccountsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const companyId = readOptionalQueryString(request, 'companyId');
    const providerId = readOptionalQueryString(request, 'providerId');
    const status = readOptionalNetworkAccountStatusQuery(request);

    const accounts = await options.service.listPlatformNetworkAccounts(
      requestInformation.identity,
      requestInformation.requestId,
      {
        ...(companyId !== undefined ? { companyId } : {}),
        ...(providerId !== undefined ? { providerId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: accounts,
    });
  };

  const updatePlatformNetworkAccountStatusHandler: RequestHandler = async (
    request,
    response,
  ) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const account = await options.service.updatePlatformNetworkAccountStatus(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'accountId'),
      {
        status: readRequiredNetworkAccountStatus(body),
      },
    );

    response.status(200).json({
      data: account,
    });
  };

  router.post('/companies/:companyId/tracking-domains', createTrackingDomainHandler);
  router.get('/companies/:companyId/tracking-domains', listCompanyTrackingDomainsHandler);
  router.get(
    '/companies/:companyId/tracking-domains/:domainId',
    getCompanyTrackingDomainHandler,
  );
  router.patch(
    '/companies/:companyId/tracking-domains/:domainId',
    updateCompanyTrackingDomainHandler,
  );

  router.get('/platform/tracking-domains', listPlatformTrackingDomainsHandler);
  router.patch(
    '/platform/tracking-domains/:domainId/status',
    updatePlatformTrackingDomainStatusHandler,
  );

  router.post('/platform/network-providers', createNetworkProviderHandler);
  router.get('/platform/network-providers', listPlatformNetworkProvidersHandler);
  router.get(
    '/platform/network-providers/:providerId',
    getPlatformNetworkProviderHandler,
  );
  router.patch('/platform/network-providers/:providerId', updateNetworkProviderHandler);

  router.get(
    '/companies/:companyId/network-providers',
    listTenantNetworkProvidersHandler,
  );

  router.post('/companies/:companyId/network-accounts', createNetworkAccountHandler);
  router.get('/companies/:companyId/network-accounts', listCompanyNetworkAccountsHandler);
  router.get(
    '/companies/:companyId/network-accounts/:accountId',
    getCompanyNetworkAccountHandler,
  );
  router.patch(
    '/companies/:companyId/network-accounts/:accountId',
    updateCompanyNetworkAccountHandler,
  );

  router.get('/platform/network-accounts', listPlatformNetworkAccountsHandler);
  router.patch(
    '/platform/network-accounts/:accountId/status',
    updatePlatformNetworkAccountStatusHandler,
  );

  return router;
}
'@

  Write-Utf8NoBom `
    -Path '.\apps\api\src\tracking-networks.routes.ts' `
    -Content $routes

  $patchScript = @'
const fs = require('node:fs');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function replaceOnce(filePath, marker, search, replacement) {
  const content = read(filePath);

  if (content.includes(marker)) {
    return;
  }

  const firstIndex = content.indexOf(search);

  if (firstIndex < 0) {
    throw new Error(`${filePath}: patch anchor was not found.`);
  }

  if (content.indexOf(search, firstIndex + search.length) >= 0) {
    throw new Error(`${filePath}: patch anchor is not unique.`);
  }

  write(
    filePath,
    `${content.slice(0, firstIndex)}${replacement}${content.slice(
      firstIndex + search.length,
    )}`,
  );
}

replaceOnce(
  'apps/api/src/api.errors.ts',
  "'TRACKING_DOMAIN_NOT_FOUND'",
  "  | 'BILLING_SUBSCRIPTION_UPDATE_CONFLICT';",
  `  | 'BILLING_SUBSCRIPTION_UPDATE_CONFLICT'
  | 'TRACKING_NETWORK_COMPANY_INACTIVE'
  | 'TRACKING_DOMAIN_NOT_FOUND'
  | 'TRACKING_DOMAIN_HOSTNAME_CONFLICT'
  | 'TRACKING_DOMAIN_ARCHIVED'
  | 'TRACKING_DOMAIN_HOSTNAME_LOCKED'
  | 'TRACKING_DOMAIN_UNVERIFIED'
  | 'TRACKING_DOMAIN_UNCHANGED'
  | 'TRACKING_DOMAIN_UPDATE_CONFLICT'
  | 'NETWORK_PROVIDER_NOT_FOUND'
  | 'NETWORK_PROVIDER_CODE_CONFLICT'
  | 'NETWORK_PROVIDER_ARCHIVED'
  | 'NETWORK_PROVIDER_IN_USE'
  | 'NETWORK_PROVIDER_UNCHANGED'
  | 'NETWORK_PROVIDER_UPDATE_CONFLICT'
  | 'NETWORK_ACCOUNT_NOT_FOUND'
  | 'NETWORK_ACCOUNT_CONFLICT'
  | 'NETWORK_ACCOUNT_ARCHIVED'
  | 'NETWORK_ACCOUNT_UNCHANGED'
  | 'NETWORK_ACCOUNT_STATUS_TRANSITION_INVALID'
  | 'NETWORK_ACCOUNT_UPDATE_CONFLICT';`,
);

replaceOnce(
  'apps/api/src/app.ts',
  'createTrackingNetworksRouter',
  "import { createTenantAdministrationRouter } from './tenant-administration.routes.js';",
  `import { createTenantAdministrationRouter } from './tenant-administration.routes.js';
import { createTrackingNetworksRouter } from './tracking-networks.routes.js';
import type { TrackingNetworksService } from './tracking-networks.service.js';`,
);

replaceOnce(
  'apps/api/src/app.ts',
  'readonly trackingNetworksService:',
  '  readonly tenantAdministrationService: TenantAdministrationService;',
  `  readonly tenantAdministrationService: TenantAdministrationService;
  readonly trackingNetworksService: TrackingNetworksService;`,
);

replaceOnce(
  'apps/api/src/app.ts',
  'service: options.trackingNetworksService',
  `  authenticatedApiRouter.use(
    createBillingFoundationRouter({
      service: options.billingFoundationService,
    }),
  );

`,
  `  authenticatedApiRouter.use(
    createBillingFoundationRouter({
      service: options.billingFoundationService,
    }),
  );

  authenticatedApiRouter.use(
    createTrackingNetworksRouter({
      service: options.trackingNetworksService,
    }),
  );

`,
);

replaceOnce(
  'apps/api/src/main.ts',
  'createTrackingNetworksRepository',
  "import { createTenantAdministrationService } from './tenant-administration.service.js';",
  `import { createTenantAdministrationService } from './tenant-administration.service.js';
import { createTrackingNetworksRepository } from './tracking-networks.repository.js';
import { createTrackingNetworksService } from './tracking-networks.service.js';`,
);

replaceOnce(
  'apps/api/src/main.ts',
  'const trackingNetworksRepository',
  `    const tenantAdministrationService = createTenantAdministrationService(
      tenantAdministrationRepository,
    );

`,
  `    const tenantAdministrationService = createTenantAdministrationService(
      tenantAdministrationRepository,
    );

    const trackingNetworksRepository =
      createTrackingNetworksRepository(database);

    const trackingNetworksService = createTrackingNetworksService(
      trackingNetworksRepository,
    );

`,
);

replaceOnce(
  'apps/api/src/main.ts',
  '      trackingNetworksService,',
  '      tenantAdministrationService,',
  `      tenantAdministrationService,
      trackingNetworksService,`,
);

console.log('Tracking Domains and Network Accounts API wiring patches applied.');
'@

  $patchScript | node --input-type=commonjs
  Assert-NativeCommand 'Batch 08 API wiring'

  Write-Host ''
  Write-Host 'Formatting Batch 08 TypeScript files.'

  $formatFiles = @(
    '.\apps\api\src\api.errors.ts',
    '.\apps\api\src\app.ts',
    '.\apps\api\src\main.ts',
    '.\apps\api\src\tracking-networks.types.ts',
    '.\apps\api\src\tracking-networks.repository.ts',
    '.\apps\api\src\tracking-networks.service.ts',
    '.\apps\api\src\tracking-networks.routes.ts'
  )

  & pnpm exec prettier --write @formatFiles
  Assert-NativeCommand 'Batch 08 TypeScript formatting'

  Write-Host ''
  Write-Host 'Running Batch 08 static validation.'

  $staticValidation = @'
const fs = require('node:fs');

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file is missing: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function requireFragments(filePath, fragments) {
  const content = read(filePath);

  for (const fragment of fragments) {
    if (!content.includes(fragment)) {
      throw new Error(`${filePath}: missing required fragment: ${fragment}`);
    }
  }

  return content;
}

const migrationPath =
  'supabase/migrations/20260723003000_create_tracking_and_network_foundation.sql';

const migration = requireFragments(migrationPath, [
  'begin;',
  'create type public.tracking_domain_status as enum',
  'create type public.network_provider_status as enum',
  'create type public.network_account_status as enum',
  'create table public.tracking_domains',
  'tracking_domains_company_primary_unique',
  'create table public.network_providers',
  'create table public.network_accounts',
  'network_accounts_company_provider_name_unique',
  'network_accounts_company_provider_external_unique',
  'create or replace function private.has_any_active_company_role',
  'create or replace function private.enforce_tracking_domain_write_rules',
  'Only a Platform Super Admin can verify and activate a tracking domain.',
  'create or replace function private.enforce_network_provider_write_rules',
  'A network provider with open accounts cannot be archived.',
  'create or replace function private.enforce_network_account_write_rules',
  'create policy tracking_domains_select_authorized',
  'create policy network_providers_select_authorized',
  'create policy network_accounts_select_authorized',
  'commit;',
]);

const rlsEnableCount = (
  migration.match(/\benable row level security\s*;/gi) ?? []
).length;

if (rlsEnableCount !== 3) {
  throw new Error(
    `Expected exactly three Batch 08 RLS enable statements, received ${String(rlsEnableCount)}.`,
  );
}

if (
  /\b(drop\s+database|truncate\s+table|delete\s+from\s+auth\.users)\b/i.test(
    migration,
  )
) {
  throw new Error(
    'Batch 08 migration contains a prohibited destructive statement.',
  );
}

if (
  /\b(api_key|client_secret|access_token|refresh_token|account_password)\b/i.test(
    migration,
  )
) {
  throw new Error(
    'Batch 08 migration must not store raw affiliate-network credentials.',
  );
}

requireFragments('apps/api/src/tracking-networks.types.ts', [
  'TrackingDomainStatus',
  'NetworkProviderStatus',
  'NetworkAccountStatus',
  'TrackingDomainRecord',
  'NetworkProviderRecord',
  'NetworkAccountRecord',
]);

requireFragments('apps/api/src/tracking-networks.repository.ts', [
  'tracking-networks-create-domain',
  'tracking-networks-update-domain',
  'tracking-networks-create-provider',
  'tracking-networks-count-provider-accounts',
  'tracking-networks-create-account',
  'tracking-networks-update-account',
  'tracking-networks-write-audit-event',
]);

const servicePath = 'apps/api/src/tracking-networks.service.ts';

const service = requireFragments(servicePath, [
  'createTrackingNetworksService',
  'TRACKING_DOMAIN_HOSTNAME_LOCKED',
  'TRACKING_DOMAIN_UNVERIFIED',
  'NETWORK_PROVIDER_IN_USE',
  'NETWORK_ACCOUNT_STATUS_TRANSITION_INVALID',
  'normalizeVerificationToken',
]);

if (
  !/assertCompanyRole\s*\([\s\S]*?['"]company_admin['"][\s\S]*?['"]manager['"][\s\S]*?\)/.test(
    service,
  )
) {
  throw new Error(
    `${servicePath}: missing Company Admin and Manager read authorization.`,
  );
}

if (
  !/assertCompanyRole\s*\([\s\S]*?\[\s*['"]company_admin['"]\s*\][\s\S]*?\)/.test(
    service,
  )
) {
  throw new Error(
    `${servicePath}: missing Company Admin write authorization.`,
  );
}

requireFragments('apps/api/src/tracking-networks.routes.ts', [
  "'/companies/:companyId/tracking-domains'",
  "'/platform/tracking-domains/:domainId/status'",
  "'/platform/network-providers'",
  "'/companies/:companyId/network-accounts'",
  "'/platform/network-accounts/:accountId/status'",
]);

requireFragments('apps/api/src/api.errors.ts', [
  "'TRACKING_DOMAIN_NOT_FOUND'",
  "'NETWORK_PROVIDER_NOT_FOUND'",
  "'NETWORK_ACCOUNT_NOT_FOUND'",
]);

requireFragments('apps/api/src/app.ts', [
  'createTrackingNetworksRouter',
  'trackingNetworksService',
]);

requireFragments('apps/api/src/main.ts', [
  'createTrackingNetworksRepository',
  'createTrackingNetworksService',
  'trackingNetworksService',
]);

console.log(
  'Tracking Domains and Network Accounts static validation is valid.',
);
'@

  $staticValidation | node --input-type=commonjs
  Assert-NativeCommand 'Batch 08 static validation'

  Write-Host ''
  Write-Host 'Running targeted API typecheck.'

  pnpm --filter @affiliate-tracker/api typecheck
  Assert-NativeCommand 'Batch 08 API typecheck'

  Write-Host ''
  Write-Host 'Running targeted API lint.'

  pnpm --filter @affiliate-tracker/api lint
  Assert-NativeCommand 'Batch 08 API lint'

  Write-Host ''
  Write-Host 'Running full workspace quality gate.'

  pnpm check
  Assert-NativeCommand 'Full workspace quality gate'

  $requiredOutputs = @(
    '.\packages\auth\dist\index.js',
    '.\packages\observability\dist\index.js',
    '.\apps\api\dist\app.js',
    '.\apps\api\dist\tracking-networks.types.js',
    '.\apps\api\dist\tracking-networks.repository.js',
    '.\apps\api\dist\tracking-networks.service.js',
    '.\apps\api\dist\tracking-networks.routes.js',
    '.\apps\api\dist\main.js'
  )

  foreach ($requiredOutput in $requiredOutputs) {
    if (-not (Test-Path $requiredOutput)) {
      throw "Missing required build output: $requiredOutput"
    }
  }

  Write-Host 'All Batch 08 build outputs exist.'

  Write-Host ''
  Write-Host 'Running integrated Batch 08 runtime validation.'

  $runtimePath = '.\.batch-08-runtime-validation.mjs'

  $runtimeValidation = @'
import { createServer } from 'node:http';

import { AuthorizationError } from './packages/auth/dist/index.js';
import { createLogger } from './packages/observability/dist/index.js';
import { createApp } from './apps/api/dist/app.js';
import { createTrackingNetworksRepository } from './apps/api/dist/tracking-networks.repository.js';
import { createTrackingNetworksService } from './apps/api/dist/tracking-networks.service.js';

const companyId = '11111111-1111-4111-8111-111111111111';
const differentCompanyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const platformUserId = '22222222-2222-4222-8222-222222222222';
const adminUserId = '33333333-3333-4333-8333-333333333333';
const managerUserId = '44444444-4444-4444-8444-444444444444';
const publisherUserId = '55555555-5555-4555-8555-555555555555';
const adminMembershipId = '66666666-6666-4666-8666-666666666666';
const managerMembershipId = '77777777-7777-4777-8777-777777777777';
const publisherMembershipId = '88888888-8888-4888-8888-888888888888';
const domainId = '99999999-9999-4999-8999-999999999999';
const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const accountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const verificationToken = 'runtime_verification_token_12345678901234567890';

const earlier = new Date('2026-07-23T00:00:00.000Z');
const earlierIso = earlier.toISOString();
const later = new Date('2026-07-23T00:00:01.000Z');
const laterIso = later.toISOString();
const now = new Date('2026-07-23T01:00:00.000Z');
const nowIso = now.toISOString();

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectApiError(action, code, message) {
  let receivedCode;

  try {
    await action();
  } catch (error) {
    receivedCode = error?.code;
  }

  assertCondition(
    receivedCode === code,
    `${message} Expected ${code}, received ${String(receivedCode)}.`,
  );
}

function createActor(userId) {
  return Object.freeze({
    userId,
    sessionId,
    role: 'authenticated',
    assuranceLevel: 'aal1',
    isAnonymous: false,
    issuer: 'https://example.supabase.co/auth/v1',
    audience: Object.freeze(['authenticated']),
    issuedAt: 1,
    expiresAt: 2,
    appMetadata: Object.freeze({}),
    userMetadata: Object.freeze({}),
  });
}

function createTenantIdentity(userId, membershipId, role) {
  return Object.freeze({
    actor: Object.freeze({ userId }),
    subject: Object.freeze({ userId }),
    requestedCompanyId: companyId,
    companyMembership: Object.freeze({
      membershipId,
      companyId,
      userId,
      role,
      status: 'active',
    }),
  });
}

const platformIdentity = Object.freeze({
  actor: Object.freeze({ userId: platformUserId }),
  subject: Object.freeze({
    userId: platformUserId,
    platformRole: 'platform_super_admin',
  }),
});

const adminIdentity = createTenantIdentity(
  adminUserId,
  adminMembershipId,
  'company_admin',
);

const managerIdentity = createTenantIdentity(
  managerUserId,
  managerMembershipId,
  'manager',
);

const publisherIdentity = createTenantIdentity(
  publisherUserId,
  publisherMembershipId,
  'publisher',
);

function createDomainRow(overrides = {}) {
  return {
    id: domainId,
    company_id: companyId,
    hostname: 'track.example.com',
    status: 'pending_verification',
    verification_token: verificationToken,
    verified_at: null,
    is_primary: false,
    created_by: adminUserId,
    updated_by: adminUserId,
    created_at: earlier,
    updated_at: earlier,
    ...overrides,
  };
}

function createProviderRow(overrides = {}) {
  return {
    id: providerId,
    code: 'impact',
    name: 'Impact',
    status: 'active',
    website_url: 'https://impact.com/',
    documentation_url: 'https://developer.impact.com/',
    created_by: platformUserId,
    created_at: earlier,
    updated_at: earlier,
    ...overrides,
  };
}

function createAccountRow(overrides = {}) {
  return {
    id: accountId,
    company_id: companyId,
    provider_id: providerId,
    provider_code: 'impact',
    provider_name: 'Impact',
    name: 'Primary Impact Account',
    external_account_id: 'impact-001',
    status: 'active',
    created_by: adminUserId,
    updated_by: adminUserId,
    created_at: earlier,
    updated_at: earlier,
    ...overrides,
  };
}

/*
 * Repository runtime validation.
 */
let repositoryDomainRow;
let repositoryProviderRow;
let repositoryAccountRow;
const repositoryQueries = [];
const repositoryTransactions = [];

const repositoryDatabase = Object.freeze({
  async transaction(callback, options) {
    repositoryTransactions.push(options);

    return callback({
      async query(query) {
        repositoryQueries.push(query);

        switch (query.name) {
          case 'tracking-networks-get-company':
            return {
              rows: [
                {
                  id: companyId,
                  status: 'active',
                },
              ],
            };

          case 'tracking-networks-create-domain': {
            const values = query.values ?? [];

            repositoryDomainRow = createDomainRow({
              hostname: values[1],
              status: values[2],
              verification_token: values[3],
              verified_at: values[4],
              is_primary: values[5],
            });

            return { rows: [repositoryDomainRow] };
          }

          case 'tracking-networks-list-company-domains':
          case 'tracking-networks-list-platform-domains':
          case 'tracking-networks-get-domain':
            return {
              rows:
                repositoryDomainRow === undefined
                  ? []
                  : [repositoryDomainRow],
            };

          case 'tracking-networks-clear-primary-domain':
            return { rows: [] };

          case 'tracking-networks-update-domain': {
            const values = query.values ?? [];

            repositoryDomainRow = {
              ...repositoryDomainRow,
              hostname: values[3],
              status: values[4],
              verification_token: values[5],
              verified_at: values[6],
              is_primary: values[7],
              updated_by: values[8],
              updated_at: later,
            };

            return { rows: [repositoryDomainRow] };
          }

          case 'tracking-networks-create-provider': {
            const values = query.values ?? [];

            repositoryProviderRow = createProviderRow({
              code: values[0],
              name: values[1],
              status: values[2],
              website_url: values[3],
              documentation_url: values[4],
            });

            return { rows: [repositoryProviderRow] };
          }

          case 'tracking-networks-list-providers':
          case 'tracking-networks-get-provider':
            return {
              rows:
                repositoryProviderRow === undefined
                  ? []
                  : [repositoryProviderRow],
            };

          case 'tracking-networks-update-provider': {
            const values = query.values ?? [];

            repositoryProviderRow = {
              ...repositoryProviderRow,
              name: values[2],
              status: values[3],
              website_url: values[4],
              documentation_url: values[5],
              updated_at: later,
            };

            return { rows: [repositoryProviderRow] };
          }

          case 'tracking-networks-count-provider-accounts':
            return { rows: [{ count: '1' }] };

          case 'tracking-networks-create-account': {
            const values = query.values ?? [];

            repositoryAccountRow = createAccountRow({
              provider_id: values[1],
              name: values[2],
              external_account_id: values[3],
              status: values[4],
            });

            return { rows: [repositoryAccountRow] };
          }

          case 'tracking-networks-list-company-accounts':
          case 'tracking-networks-list-platform-accounts':
          case 'tracking-networks-get-account':
            return {
              rows:
                repositoryAccountRow === undefined
                  ? []
                  : [repositoryAccountRow],
            };

          case 'tracking-networks-update-account': {
            const values = query.values ?? [];

            repositoryAccountRow = {
              ...repositoryAccountRow,
              name: values[3],
              external_account_id: values[4],
              status: values[5],
              updated_by: values[6],
              updated_at: later,
            };

            return { rows: [repositoryAccountRow] };
          }

          case 'tracking-networks-write-audit-event':
            return { rows: [] };

          default:
            throw new Error(
              `Unexpected tracking/network repository query: ${String(query.name)}`,
            );
        }
      },
    });
  },
});

const realRepository = createTrackingNetworksRepository(repositoryDatabase);

const repositoryDomain = await realRepository.createTrackingDomain(
  {
    actorUserId: adminUserId,
    requestId: 'repository-create-domain',
    companyId,
  },
  companyId,
  {
    hostname: 'track.example.com',
    status: 'pending_verification',
    verificationToken,
    verifiedAt: null,
    isPrimary: false,
  },
);

assertCondition(
  repositoryDomain?.id === domainId &&
    repositoryDomain.hostname === 'track.example.com' &&
    repositoryDomain.status === 'pending_verification',
  'Repository tracking-domain creation or mapping failed.',
);

const repositoryVerifiedDomain = await realRepository.updateTrackingDomain(
  {
    actorUserId: platformUserId,
    requestId: 'repository-verify-domain',
    companyId,
  },
  repositoryDomain,
  {
    hostname: repositoryDomain.hostname,
    status: 'active',
    verificationToken: repositoryDomain.verificationToken,
    verifiedAt: nowIso,
    isPrimary: true,
  },
  'tracking_domain.verified',
);

assertCondition(
  repositoryVerifiedDomain?.status === 'active' &&
    repositoryVerifiedDomain.verifiedAt === nowIso &&
    repositoryVerifiedDomain.isPrimary,
  'Repository tracking-domain verification update failed.',
);

const repositoryProvider = await realRepository.createNetworkProvider(
  {
    actorUserId: platformUserId,
    requestId: 'repository-create-provider',
  },
  {
    code: 'impact',
    name: 'Impact',
    status: 'active',
    websiteUrl: 'https://impact.com/',
    documentationUrl: 'https://developer.impact.com/',
  },
);

assertCondition(
  repositoryProvider?.id === providerId &&
    repositoryProvider.code === 'impact',
  'Repository network-provider creation or mapping failed.',
);

const repositoryUpdatedProvider = await realRepository.updateNetworkProvider(
  {
    actorUserId: platformUserId,
    requestId: 'repository-update-provider',
  },
  repositoryProvider,
  {
    code: repositoryProvider.code,
    name: 'Impact.com',
    status: 'active',
    websiteUrl: repositoryProvider.websiteUrl,
    documentationUrl: repositoryProvider.documentationUrl,
  },
);

assertCondition(
  repositoryUpdatedProvider?.name === 'Impact.com',
  'Repository network-provider update failed.',
);

const repositoryOpenAccountCount =
  await realRepository.countOpenNetworkAccountsForProvider(
    {
      actorUserId: platformUserId,
      requestId: 'repository-count-provider-accounts',
    },
    providerId,
  );

assertCondition(
  repositoryOpenAccountCount === 1,
  'Repository provider-account count failed.',
);

const repositoryAccount = await realRepository.createNetworkAccount(
  {
    actorUserId: adminUserId,
    requestId: 'repository-create-account',
    companyId,
  },
  companyId,
  {
    providerId,
    name: 'Primary Impact Account',
    externalAccountId: 'impact-001',
    status: 'active',
  },
);

assertCondition(
  repositoryAccount?.id === accountId &&
    repositoryAccount.providerCode === 'impact',
  'Repository network-account creation or provider mapping failed.',
);

const repositoryUpdatedAccount = await realRepository.updateNetworkAccount(
  {
    actorUserId: adminUserId,
    requestId: 'repository-update-account',
    companyId,
  },
  repositoryAccount,
  {
    providerId,
    name: 'Impact Production',
    externalAccountId: 'impact-production',
    status: 'suspended',
  },
  'network_account.updated',
);

assertCondition(
  repositoryUpdatedAccount?.name === 'Impact Production' &&
    repositoryUpdatedAccount.status === 'suspended',
  'Repository network-account update failed.',
);

const repositoryAuditWrites = repositoryQueries.filter(
  (query) => query.name === 'tracking-networks-write-audit-event',
);

assertCondition(
  repositoryAuditWrites.length === 6,
  `Expected six atomic tracking/network audit writes, received ${String(repositoryAuditWrites.length)}.`,
);

assertCondition(
  repositoryAuditWrites[0]?.values?.[0] === companyId &&
    repositoryAuditWrites[2]?.values?.[0] === null &&
    repositoryAuditWrites[4]?.values?.[0] === companyId,
  'Repository audit-event scopes are invalid.',
);

assertCondition(
  repositoryTransactions.some(
    (options) =>
      options?.readOnly === true &&
      options?.sessionContext?.actorUserId === platformUserId,
  ),
  'Repository read-only session context was not propagated.',
);

assertCondition(
  repositoryTransactions.some(
    (options) =>
      options?.sessionContext?.companyId === companyId &&
      options?.sessionContext?.actorUserId === adminUserId,
  ),
  'Repository tenant session context was not propagated.',
);

console.log(
  'Tracking/network repository mapping, contexts, uniqueness paths, and atomic audits are valid.',
);

/*
 * Service runtime validation.
 */
function createServiceRepositoryState() {
  let company = Object.freeze({
    id: companyId,
    status: 'active',
  });
  const domains = new Map();
  const providers = new Map();
  const accounts = new Map();
  let timestampCounter = 0;

  function nextTimestamp() {
    timestampCounter += 1;
    return new Date(earlier.getTime() + timestampCounter * 1000).toISOString();
  }

  const repository = Object.freeze({
    async getCompany(_context, requestedCompanyId) {
      return requestedCompanyId === companyId ? company : undefined;
    },

    async createTrackingDomain(_context, requestedCompanyId, input) {
      if (
        requestedCompanyId !== companyId ||
        [...domains.values()].some(
          (domain) =>
            domain.hostname === input.hostname ||
            domain.verificationToken === input.verificationToken,
        )
      ) {
        return undefined;
      }

      const timestamp = nextTimestamp();
      const domain = Object.freeze({
        id: domainId,
        companyId,
        hostname: input.hostname,
        status: input.status,
        verificationToken: input.verificationToken,
        verifiedAt: input.verifiedAt,
        isPrimary: input.isPrimary,
        createdBy: adminUserId,
        updatedBy: adminUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      domains.set(domain.id, domain);
      return domain;
    },

    async listCompanyTrackingDomains(_context, requestedCompanyId) {
      return Object.freeze(
        [...domains.values()].filter(
          (domain) => domain.companyId === requestedCompanyId,
        ),
      );
    },

    async listPlatformTrackingDomains(_context, query) {
      return Object.freeze(
        [...domains.values()].filter(
          (domain) =>
            (query.companyId === undefined ||
              domain.companyId === query.companyId) &&
            (query.status === undefined || domain.status === query.status),
        ),
      );
    },

    async getTrackingDomain(_context, requestedDomainId, requestedCompanyId) {
      const domain = domains.get(requestedDomainId);

      return domain !== undefined &&
        (requestedCompanyId === undefined ||
          domain.companyId === requestedCompanyId)
        ? domain
        : undefined;
    },

    async updateTrackingDomain(_context, current, input) {
      const stored = domains.get(current.id);

      if (
        stored === undefined ||
        stored.updatedAt !== current.updatedAt ||
        [...domains.values()].some(
          (domain) =>
            domain.id !== current.id &&
            domain.hostname === input.hostname,
        )
      ) {
        return undefined;
      }

      if (input.isPrimary) {
        for (const [key, domain] of domains.entries()) {
          if (domain.companyId === current.companyId && domain.id !== current.id) {
            domains.set(
              key,
              Object.freeze({
                ...domain,
                isPrimary: false,
              }),
            );
          }
        }
      }

      const updated = Object.freeze({
        ...stored,
        hostname: input.hostname,
        status: input.status,
        verificationToken: input.verificationToken,
        verifiedAt: input.verifiedAt,
        isPrimary: input.isPrimary,
        updatedBy: platformUserId,
        updatedAt: nextTimestamp(),
      });

      domains.set(updated.id, updated);
      return updated;
    },

    async createNetworkProvider(_context, input) {
      if ([...providers.values()].some((provider) => provider.code === input.code)) {
        return undefined;
      }

      const timestamp = nextTimestamp();
      const provider = Object.freeze({
        id: providerId,
        code: input.code,
        name: input.name,
        status: input.status,
        websiteUrl: input.websiteUrl,
        documentationUrl: input.documentationUrl,
        createdBy: platformUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      providers.set(provider.id, provider);
      return provider;
    },

    async listNetworkProviders(_context, status) {
      return Object.freeze(
        [...providers.values()].filter(
          (provider) => status === undefined || provider.status === status,
        ),
      );
    },

    async getNetworkProvider(_context, requestedProviderId) {
      return providers.get(requestedProviderId);
    },

    async updateNetworkProvider(_context, current, input) {
      const stored = providers.get(current.id);

      if (stored === undefined || stored.updatedAt !== current.updatedAt) {
        return undefined;
      }

      const updated = Object.freeze({
        ...stored,
        name: input.name,
        status: input.status,
        websiteUrl: input.websiteUrl,
        documentationUrl: input.documentationUrl,
        updatedAt: nextTimestamp(),
      });

      providers.set(updated.id, updated);
      return updated;
    },

    async countOpenNetworkAccountsForProvider(_context, requestedProviderId) {
      return [...accounts.values()].filter(
        (account) =>
          account.providerId === requestedProviderId &&
          account.status !== 'archived',
      ).length;
    },

    async createNetworkAccount(_context, requestedCompanyId, input) {
      const provider = providers.get(input.providerId);

      if (
        requestedCompanyId !== companyId ||
        provider === undefined ||
        provider.status !== 'active' ||
        [...accounts.values()].some(
          (account) =>
            account.companyId === requestedCompanyId &&
            account.providerId === input.providerId &&
            (account.name.toLowerCase() === input.name.toLowerCase() ||
              (input.externalAccountId !== null &&
                account.externalAccountId === input.externalAccountId)),
        )
      ) {
        return undefined;
      }

      const timestamp = nextTimestamp();
      const account = Object.freeze({
        id: accountId,
        companyId,
        providerId: provider.id,
        providerCode: provider.code,
        providerName: provider.name,
        name: input.name,
        externalAccountId: input.externalAccountId,
        status: input.status,
        createdBy: adminUserId,
        updatedBy: adminUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      accounts.set(account.id, account);
      return account;
    },

    async listCompanyNetworkAccounts(_context, requestedCompanyId) {
      return Object.freeze(
        [...accounts.values()].filter(
          (account) => account.companyId === requestedCompanyId,
        ),
      );
    },

    async listPlatformNetworkAccounts(_context, query) {
      return Object.freeze(
        [...accounts.values()].filter(
          (account) =>
            (query.companyId === undefined ||
              account.companyId === query.companyId) &&
            (query.providerId === undefined ||
              account.providerId === query.providerId) &&
            (query.status === undefined || account.status === query.status),
        ),
      );
    },

    async getNetworkAccount(_context, requestedAccountId, requestedCompanyId) {
      const account = accounts.get(requestedAccountId);

      return account !== undefined &&
        (requestedCompanyId === undefined ||
          account.companyId === requestedCompanyId)
        ? account
        : undefined;
    },

    async updateNetworkAccount(_context, current, input) {
      const stored = accounts.get(current.id);

      if (
        stored === undefined ||
        stored.updatedAt !== current.updatedAt ||
        [...accounts.values()].some(
          (account) =>
            account.id !== current.id &&
            account.companyId === current.companyId &&
            account.providerId === current.providerId &&
            (account.name.toLowerCase() === input.name.toLowerCase() ||
              (input.externalAccountId !== null &&
                account.externalAccountId === input.externalAccountId)),
        )
      ) {
        return undefined;
      }

      const updated = Object.freeze({
        ...stored,
        name: input.name,
        externalAccountId: input.externalAccountId,
        status: input.status,
        updatedBy: platformUserId,
        updatedAt: nextTimestamp(),
      });

      accounts.set(updated.id, updated);
      return updated;
    },
  });

  return {
    repository,
    setCompanyStatus(status) {
      company = Object.freeze({
        ...company,
        status,
      });
    },
  };
}

const serviceState = createServiceRepositoryState();

const trackingNetworksService = createTrackingNetworksService(
  serviceState.repository,
  {
    now: () => new Date(now),
    createVerificationToken: () => verificationToken,
  },
);

const provider = await trackingNetworksService.createNetworkProvider(
  platformIdentity,
  'service-create-provider',
  {
    code: ' Impact ',
    name: ' Impact ',
    websiteUrl: 'https://impact.com',
    documentationUrl: 'https://developer.impact.com',
  },
);

assertCondition(
  provider.code === 'impact' &&
    provider.name === 'Impact' &&
    provider.websiteUrl === 'https://impact.com/',
  'Network-provider normalization failed.',
);

await expectApiError(
  () =>
    trackingNetworksService.createNetworkProvider(
      adminIdentity,
      'service-admin-create-provider',
      {
        code: 'unauthorized',
        name: 'Unauthorized',
      },
    ),
  'PLATFORM_ROLE_REQUIRED',
  'Company Admin was allowed to create a provider.',
);

const domain = await trackingNetworksService.createTrackingDomain(
  adminIdentity,
  'service-create-domain',
  companyId,
  {
    hostname: ' Track.Example.COM. ',
  },
);

assertCondition(
  domain.hostname === 'track.example.com' &&
    domain.status === 'pending_verification' &&
    domain.verificationToken === verificationToken,
  'Tracking-domain normalization or pending-verification creation failed.',
);

const managerDomains =
  await trackingNetworksService.listCompanyTrackingDomains(
    managerIdentity,
    'service-manager-domains',
    companyId,
  );

assertCondition(
  managerDomains.length === 1 &&
    managerDomains[0]?.id === domainId,
  'Manager tracking-domain visibility failed.',
);

await expectApiError(
  () =>
    trackingNetworksService.listCompanyTrackingDomains(
      publisherIdentity,
      'service-publisher-domains',
      companyId,
    ),
  'COMPANY_ROLE_REQUIRED',
  'Publisher was allowed to list tracking domains.',
);

await expectApiError(
  () =>
    trackingNetworksService.updateCompanyTrackingDomain(
      adminIdentity,
      'service-admin-activate-domain',
      companyId,
      domainId,
      {
        status: 'active',
      },
    ),
  'INVALID_REQUEST_BODY',
  'Company Admin bypassed platform domain verification.',
);

await expectApiError(
  () =>
    trackingNetworksService.updateCompanyTrackingDomain(
      adminIdentity,
      'service-unverified-primary',
      companyId,
      domainId,
      {
        isPrimary: true,
      },
    ),
  'TRACKING_DOMAIN_UNVERIFIED',
  'Unverified domain was made primary.',
);

const verifiedDomain =
  await trackingNetworksService.updatePlatformTrackingDomainStatus(
    platformIdentity,
    'service-verify-domain',
    domainId,
    {
      status: 'active',
    },
  );

assertCondition(
  verifiedDomain.status === 'active' &&
    verifiedDomain.verifiedAt === nowIso,
  'Platform tracking-domain verification failed.',
);

const primaryDomain =
  await trackingNetworksService.updateCompanyTrackingDomain(
    adminIdentity,
    'service-primary-domain',
    companyId,
    domainId,
    {
      isPrimary: true,
    },
  );

assertCondition(
  primaryDomain.isPrimary,
  'Company Admin could not select an active verified primary domain.',
);

await expectApiError(
  () =>
    trackingNetworksService.updateCompanyTrackingDomain(
      adminIdentity,
      'service-change-verified-hostname',
      companyId,
      domainId,
      {
        hostname: 'other.example.com',
      },
    ),
  'TRACKING_DOMAIN_HOSTNAME_LOCKED',
  'Verified tracking-domain hostname was changed.',
);

const account = await trackingNetworksService.createNetworkAccount(
  adminIdentity,
  'service-create-account',
  companyId,
  {
    providerId,
    name: ' Primary Impact Account ',
    externalAccountId: ' impact-001 ',
  },
);

assertCondition(
  account.providerCode === 'impact' &&
    account.name === 'Primary Impact Account' &&
    account.externalAccountId === 'impact-001',
  'Network-account creation or normalization failed.',
);

const managerAccounts =
  await trackingNetworksService.listCompanyNetworkAccounts(
    managerIdentity,
    'service-manager-accounts',
    companyId,
  );

assertCondition(
  managerAccounts.length === 1 &&
    managerAccounts[0]?.id === accountId,
  'Manager network-account visibility failed.',
);

await expectApiError(
  () =>
    trackingNetworksService.createNetworkAccount(
      managerIdentity,
      'service-manager-create-account',
      companyId,
      {
        providerId,
        name: 'Manager Account',
      },
    ),
  'COMPANY_ROLE_REQUIRED',
  'Manager was allowed to create a network account.',
);

await expectApiError(
  () =>
    trackingNetworksService.listCompanyNetworkAccounts(
      publisherIdentity,
      'service-publisher-accounts',
      companyId,
    ),
  'COMPANY_ROLE_REQUIRED',
  'Publisher was allowed to list network accounts.',
);

const suspendedAccount =
  await trackingNetworksService.updateCompanyNetworkAccount(
    adminIdentity,
    'service-suspend-account',
    companyId,
    accountId,
    {
      status: 'suspended',
      name: 'Impact Production',
    },
  );

assertCondition(
  suspendedAccount.status === 'suspended' &&
    suspendedAccount.name === 'Impact Production',
  'Company Admin network-account update failed.',
);

await expectApiError(
  () =>
    trackingNetworksService.updateNetworkProvider(
      platformIdentity,
      'service-archive-provider-in-use',
      providerId,
      {
        status: 'archived',
      },
    ),
  'NETWORK_PROVIDER_IN_USE',
  'Provider with an open account was archived.',
);

const archivedAccount =
  await trackingNetworksService.updatePlatformNetworkAccountStatus(
    platformIdentity,
    'service-archive-account',
    accountId,
    {
      status: 'archived',
    },
  );

assertCondition(
  archivedAccount.status === 'archived',
  'Platform network-account archive failed.',
);

await expectApiError(
  () =>
    trackingNetworksService.updateCompanyNetworkAccount(
      adminIdentity,
      'service-edit-archived-account',
      companyId,
      accountId,
      {
        name: 'Changed',
      },
    ),
  'NETWORK_ACCOUNT_ARCHIVED',
  'Archived network account was modified.',
);

const archivedProvider = await trackingNetworksService.updateNetworkProvider(
  platformIdentity,
  'service-archive-provider',
  providerId,
  {
    status: 'archived',
  },
);

assertCondition(
  archivedProvider.status === 'archived',
  'Unused provider was not archived.',
);

await expectApiError(
  () =>
    trackingNetworksService.updateNetworkProvider(
      platformIdentity,
      'service-edit-archived-provider',
      providerId,
      {
        name: 'Changed',
      },
    ),
  'NETWORK_PROVIDER_ARCHIVED',
  'Archived provider was modified.',
);

serviceState.setCompanyStatus('suspended');

await expectApiError(
  () =>
    trackingNetworksService.listCompanyTrackingDomains(
      managerIdentity,
      'service-inactive-company',
      companyId,
    ),
  'TRACKING_NETWORK_COMPANY_INACTIVE',
  'Inactive company tracking configuration remained accessible.',
);

console.log(
  'Tracking/network service normalization, authorization, verification, and lifecycle rules are valid.',
);

/*
 * HTTP runtime validation.
 */
const httpState = createServiceRepositoryState();
const httpTrackingNetworksService = createTrackingNetworksService(
  httpState.repository,
  {
    now: () => new Date(now),
    createVerificationToken: () => verificationToken,
  },
);

const config = Object.freeze({
  application: Object.freeze({
    environment: 'test',
    logLevel: 'silent',
    prettyLogs: false,
  }),
  server: Object.freeze({
    host: '127.0.0.1',
    port: 0,
    basePath: '/api/v1',
    trustProxy: false,
    requestBodyLimit: '1mb',
  }),
  cors: Object.freeze({
    allowedOrigins: Object.freeze(['http://localhost:3000']),
  }),
  rateLimit: Object.freeze({
    windowMs: 60000,
    maxRequests: 120,
  }),
  swagger: Object.freeze({
    enabled: false,
    documentationPath: '/docs',
    openApiJsonPath: '/openapi.json',
  }),
  database: Object.freeze({
    connectionString: 'postgresql://localhost/example',
    minConnections: 1,
    maxConnections: 10,
    queryTimeoutMs: 10000,
  }),
  authentication: Object.freeze({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_validation_key',
  }),
});

const logger = createLogger({
  service: 'tracking-networks-runtime-test',
  environment: 'test',
  level: 'silent',
  pretty: false,
});

const tokenActors = new Map([
  ['platform-token', createActor(platformUserId)],
  ['admin-token', createActor(adminUserId)],
  ['manager-token', createActor(managerUserId)],
  ['publisher-token', createActor(publisherUserId)],
]);

const tokenVerifier = Object.freeze({
  async verify(accessToken) {
    const actor = tokenActors.get(accessToken);

    if (actor === undefined) {
      throw new Error('Unexpected tracking/network runtime-test token.');
    }

    return actor;
  },
});

const httpIdentityResolver = Object.freeze({
  async resolve(input) {
    if (input.actor.userId === platformUserId) {
      return Object.freeze({
        actor: input.actor,
        subject: Object.freeze({
          userId: platformUserId,
          platformRole: 'platform_super_admin',
        }),
        ...(input.requestedCompanyId !== undefined
          ? { requestedCompanyId: input.requestedCompanyId }
          : {}),
      });
    }

    if (input.requestedCompanyId === undefined) {
      return Object.freeze({
        actor: input.actor,
        subject: Object.freeze({
          userId: input.actor.userId,
        }),
      });
    }

    if (input.requestedCompanyId !== companyId) {
      throw new AuthorizationError(
        'COMPANY_ACCESS_DENIED',
        'Access to the requested company is denied.',
      );
    }

    const membership =
      input.actor.userId === adminUserId
        ? Object.freeze({
            membershipId: adminMembershipId,
            companyId,
            userId: adminUserId,
            role: 'company_admin',
            status: 'active',
          })
        : input.actor.userId === managerUserId
          ? Object.freeze({
              membershipId: managerMembershipId,
              companyId,
              userId: managerUserId,
              role: 'manager',
              status: 'active',
            })
          : input.actor.userId === publisherUserId
            ? Object.freeze({
                membershipId: publisherMembershipId,
                companyId,
                userId: publisherUserId,
                role: 'publisher',
                status: 'active',
              })
            : undefined;

    return Object.freeze({
      actor: input.actor,
      subject: Object.freeze({
        userId: input.actor.userId,
      }),
      requestedCompanyId: input.requestedCompanyId,
      ...(membership !== undefined
        ? { companyMembership: membership }
        : {}),
    });
  },
});

function createUnusedService(label, methods) {
  return Object.freeze(
    Object.fromEntries(
      methods.map((method) => [
        method,
        async () => {
          throw new Error(`Unexpected ${label}.${method} route call.`);
        },
      ]),
    ),
  );
}

const unusedCompanyManagementService = createUnusedService(
  'companyManagementService',
  [
    'createCompany',
    'listCompanies',
    'getCompany',
    'listMemberships',
    'inviteMembership',
    'updateMembership',
  ],
);

const unusedTenantAdministrationService = createUnusedService(
  'tenantAdministrationService',
  [
    'updateCompanyStatus',
    'listCompanyUsers',
    'getCompanyUser',
    'updateUserStatus',
    'listAuditEvents',
  ],
);

const unusedBillingFoundationService = createUnusedService(
  'billingFoundationService',
  [
    'createPlan',
    'listPlans',
    'getPlan',
    'updatePlan',
    'createCompanySubscription',
    'getPlatformCompanyBilling',
    'updateCompanySubscription',
    'getTenantCompanyBilling',
  ],
);

const app = createApp({
  config,
  logger,
  tokenVerifier,
  identityResolver: httpIdentityResolver,
  billingFoundationService: unusedBillingFoundationService,
  companyManagementService: unusedCompanyManagementService,
  tenantAdministrationService: unusedTenantAdministrationService,
  trackingNetworksService: httpTrackingNetworksService,
});

const server = createServer(app);

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();

if (address === null || typeof address === 'string') {
  throw new Error('Tracking/network runtime-test server address is invalid.');
}

const rootUrl = `http://127.0.0.1:${address.port}`;

async function readJson(response) {
  return response.json();
}

try {
  const createProviderResponse = await fetch(
    `${rootUrl}/api/v1/platform/network-providers`,
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer platform-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        code: 'impact',
        name: 'Impact',
        websiteUrl: 'https://impact.com',
      }),
    },
  );

  const createProviderBody = await readJson(createProviderResponse);

  assertCondition(
    createProviderResponse.status === 201 &&
      createProviderBody.data?.code === 'impact',
    'Platform provider HTTP creation failed.',
  );

  const managerProviderResponse = await fetch(
    `${rootUrl}/api/v1/platform/network-providers`,
    {
      headers: {
        authorization: 'Bearer manager-token',
      },
    },
  );

  const managerProviderBody = await readJson(managerProviderResponse);

  assertCondition(
    managerProviderResponse.status === 403 &&
      managerProviderBody.error?.code === 'PLATFORM_ROLE_REQUIRED',
    'Manager platform-provider denial failed.',
  );

  const createDomainResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/tracking-domains`,
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-token',
        'x-company-id': companyId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        hostname: 'track.example.com',
      }),
    },
  );

  const createDomainBody = await readJson(createDomainResponse);

  assertCondition(
    createDomainResponse.status === 201 &&
      createDomainBody.data?.status === 'pending_verification',
    'Company Admin tracking-domain HTTP creation failed.',
  );

  const activateDomainResponse = await fetch(
    `${rootUrl}/api/v1/platform/tracking-domains/${domainId}/status`,
    {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer platform-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'active',
      }),
    },
  );

  const activateDomainBody = await readJson(activateDomainResponse);

  assertCondition(
    activateDomainResponse.status === 200 &&
      activateDomainBody.data?.status === 'active' &&
      activateDomainBody.data?.verifiedAt === nowIso,
    'Platform tracking-domain verification HTTP request failed.',
  );

  const primaryDomainResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/tracking-domains/${domainId}`,
    {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer admin-token',
        'x-company-id': companyId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        isPrimary: true,
      }),
    },
  );

  const primaryDomainBody = await readJson(primaryDomainResponse);

  assertCondition(
    primaryDomainResponse.status === 200 &&
      primaryDomainBody.data?.isPrimary === true,
    'Company Admin primary-domain HTTP update failed.',
  );

  const createAccountResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/network-accounts`,
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-token',
        'x-company-id': companyId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        providerId,
        name: 'Impact Production',
        externalAccountId: 'impact-http-001',
      }),
    },
  );

  const createAccountBody = await readJson(createAccountResponse);

  assertCondition(
    createAccountResponse.status === 201 &&
      createAccountBody.data?.providerCode === 'impact',
    'Company Admin network-account HTTP creation failed.',
  );

  const managerAccountsResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/network-accounts`,
    {
      headers: {
        authorization: 'Bearer manager-token',
        'x-company-id': companyId,
      },
    },
  );

  const managerAccountsBody = await readJson(managerAccountsResponse);

  assertCondition(
    managerAccountsResponse.status === 200 &&
      managerAccountsBody.data?.[0]?.id === accountId,
    'Manager network-account HTTP visibility failed.',
  );

  const publisherAccountsResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/network-accounts`,
    {
      headers: {
        authorization: 'Bearer publisher-token',
        'x-company-id': companyId,
      },
    },
  );

  const publisherAccountsBody = await readJson(publisherAccountsResponse);

  assertCondition(
    publisherAccountsResponse.status === 403 &&
      publisherAccountsBody.error?.code === 'COMPANY_ROLE_REQUIRED',
    'Publisher network-account HTTP denial failed.',
  );

  const managerCreateAccountResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/network-accounts`,
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer manager-token',
        'x-company-id': companyId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        providerId,
        name: 'Unauthorized Manager Account',
      }),
    },
  );

  const managerCreateAccountBody = await readJson(
    managerCreateAccountResponse,
  );

  assertCondition(
    managerCreateAccountResponse.status === 403 &&
      managerCreateAccountBody.error?.code === 'COMPANY_ROLE_REQUIRED',
    'Manager network-account HTTP write denial failed.',
  );

  const missingContextResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/tracking-domains`,
    {
      headers: {
        authorization: 'Bearer manager-token',
      },
    },
  );

  const missingContextBody = await readJson(missingContextResponse);

  assertCondition(
    missingContextResponse.status === 400 &&
      missingContextBody.error?.code === 'COMPANY_CONTEXT_REQUIRED',
    'Tracking-domain missing-company-context HTTP validation failed.',
  );

  const mismatchContextResponse = await fetch(
    `${rootUrl}/api/v1/companies/${companyId}/network-accounts`,
    {
      headers: {
        authorization: 'Bearer manager-token',
        'x-company-id': differentCompanyId,
      },
    },
  );

  const mismatchContextBody = await readJson(mismatchContextResponse);

  assertCondition(
    mismatchContextResponse.status === 403 &&
      mismatchContextBody.error?.code === 'COMPANY_ACCESS_DENIED',
    'Network-account mismatched-company HTTP denial failed.',
  );

  const archiveAccountResponse = await fetch(
    `${rootUrl}/api/v1/platform/network-accounts/${accountId}/status`,
    {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer platform-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'archived',
      }),
    },
  );

  const archiveAccountBody = await readJson(archiveAccountResponse);

  assertCondition(
    archiveAccountResponse.status === 200 &&
      archiveAccountBody.data?.status === 'archived',
    'Platform network-account status HTTP update failed.',
  );

  const platformAccountsResponse = await fetch(
    `${rootUrl}/api/v1/platform/network-accounts?companyId=${companyId}&status=archived`,
    {
      headers: {
        authorization: 'Bearer platform-token',
      },
    },
  );

  const platformAccountsBody = await readJson(platformAccountsResponse);

  assertCondition(
    platformAccountsResponse.status === 200 &&
      platformAccountsBody.data?.[0]?.status === 'archived',
    'Platform filtered network-account HTTP listing failed.',
  );

  console.log(
    'Tracking/network HTTP authorization, validation, verification, and lifecycle routes are valid.',
  );
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

console.log(
  'All Batch 08 Tracking Domains and Network Accounts runtime validations passed.',
);
'@

  try {
    Write-Utf8NoBom `
      -Path $runtimePath `
      -Content $runtimeValidation

    node $runtimePath
    Assert-NativeCommand 'Batch 08 runtime validation'
  }
  finally {
    Remove-Item `
      $runtimePath `
      -Force `
      -ErrorAction SilentlyContinue
  }

  Write-Host ''
  git status --short
  Assert-NativeCommand 'Git status'

  Write-Host ''
  Write-Host 'FAST BATCH PASSED: Tracking Domains and Network Accounts are valid.'
}
