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