begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.company_status as enum (
  'active',
  'suspended',
  'archived'
);

create type public.platform_role as enum (
  'platform_super_admin'
);

create type public.user_status as enum (
  'active',
  'suspended'
);

create type public.company_role as enum (
  'company_admin',
  'manager',
  'publisher'
);

create type public.company_membership_status as enum (
  'invited',
  'active',
  'suspended',
  'revoked'
);

create or replace function private.current_actor_user_id()
returns uuid
language plpgsql
stable
set search_path = pg_catalog
as $function$
declare
  configured_actor_user_id text;
begin
  configured_actor_user_id :=
    nullif(current_setting('app.current_actor_user_id', true), '');

  if configured_actor_user_id is not null then
    return configured_actor_user_id::uuid;
  end if;

  return auth.uid();
end;
$function$;

create or replace function private.current_company_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $function$
  select nullif(
    current_setting('app.current_company_id', true),
    ''
  )::uuid;
$function$;

create or replace function private.current_request_id()
returns text
language sql
stable
set search_path = pg_catalog
as $function$
  select nullif(
    current_setting('app.current_request_id', true),
    ''
  );
$function$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = now();

  return new;
end;
$function$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status public.company_status not null default 'active',
  timezone text not null default 'UTC',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_slug_unique
    unique (slug),

  constraint companies_slug_format_check
    check (
      slug = lower(slug)
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 2 and 80
    ),

  constraint companies_name_check
    check (
      char_length(btrim(name)) between 2 and 160
    ),

  constraint companies_timezone_check
    check (
      char_length(btrim(timezone)) between 1 and 100
    )
);

create table public.user_profiles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,
  display_name text,
  avatar_path text,
  platform_role public.platform_role,
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_display_name_check
    check (
      display_name is null
      or char_length(btrim(display_name)) between 1 and 120
    ),

  constraint user_profiles_avatar_path_check
    check (
      avatar_path is null
      or char_length(btrim(avatar_path)) between 1 and 1024
    )
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  user_id uuid not null
    references auth.users (id)
    on delete cascade,
  role public.company_role not null,
  status public.company_membership_status not null default 'invited',
  invited_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_memberships_company_user_unique
    unique (company_id, user_id),

  constraint company_memberships_active_joined_at_check
    check (
      status <> 'active'
      or joined_at is not null
    )
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies (id)
    on delete set null,
  actor_user_id uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  request_id text default private.current_request_id(),
  event_name text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint audit_events_event_name_check
    check (
      char_length(btrim(event_name)) between 1 and 160
    ),

  constraint audit_events_entity_type_check
    check (
      char_length(btrim(entity_type)) between 1 and 120
    ),

  constraint audit_events_entity_id_check
    check (
      entity_id is null
      or char_length(btrim(entity_id)) between 1 and 255
    ),

  constraint audit_events_request_id_check
    check (
      request_id is null
      or char_length(btrim(request_id)) between 1 and 255
    ),

  constraint audit_events_metadata_object_check
    check (
      jsonb_typeof(metadata) = 'object'
    )
);

create index companies_status_created_at_idx
  on public.companies (status, created_at desc);

create index user_profiles_platform_role_idx
  on public.user_profiles (platform_role)
  where platform_role is not null;

create index company_memberships_user_status_idx
  on public.company_memberships (user_id, status, company_id);

create index company_memberships_company_role_status_idx
  on public.company_memberships (company_id, role, status);

create index audit_events_company_created_at_idx
  on public.audit_events (company_id, created_at desc);

create index audit_events_actor_created_at_idx
  on public.audit_events (actor_user_id, created_at desc);

create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);

create trigger companies_set_updated_at
before update on public.companies
for each row
execute function private.set_updated_at();

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function private.set_updated_at();

create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row
execute function private.set_updated_at();

create or replace function private.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.user_profiles as profile
    where profile.user_id = private.current_actor_user_id()
      and profile.platform_role = 'platform_super_admin'
      and profile.status = 'active'
  );
$function$;

create or replace function private.has_company_access(
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
    or exists (
      select 1
      from public.company_memberships as membership
      where membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.status = 'active'
    );
$function$;

create or replace function private.has_company_role(
  target_company_id uuid,
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
      where membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
    );
$function$;

create or replace function private.can_view_user_profile(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    target_user_id = private.current_actor_user_id()
    or private.is_platform_super_admin()
    or exists (
      select 1
      from public.company_memberships as actor_membership
      inner join public.company_memberships as target_membership
        on target_membership.company_id = actor_membership.company_id
      where actor_membership.user_id = private.current_actor_user_id()
        and actor_membership.status = 'active'
        and actor_membership.role in ('company_admin', 'manager')
        and target_membership.user_id = target_user_id
        and target_membership.status in (
          'invited',
          'active',
          'suspended'
        )
    );
$function$;

create or replace function private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  insert into public.user_profiles (
    user_id,
    display_name
  )
  values (
    new.id,
    left(
      nullif(
        btrim(
          coalesce(
            new.raw_user_meta_data ->> 'display_name',
            ''
          )
        ),
        ''
      ),
      120
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

insert into public.user_profiles (
  user_id,
  display_name
)
select
  existing_user.id,
  left(
    nullif(
      btrim(
        coalesce(
          existing_user.raw_user_meta_data ->> 'display_name',
          ''
        )
      ),
      ''
    ),
    120
  )
from auth.users as existing_user
on conflict (user_id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_auth_user_created();

alter table public.companies
  enable row level security;

alter table public.user_profiles
  enable row level security;

alter table public.company_memberships
  enable row level security;

alter table public.audit_events
  enable row level security;

create policy companies_select_authorized
on public.companies
for select
to authenticated
using (
  private.has_company_access(id)
);

create policy companies_insert_platform_admin
on public.companies
for insert
to authenticated
with check (
  private.is_platform_super_admin()
);

create policy companies_update_company_admin
on public.companies
for update
to authenticated
using (
  private.has_company_role(
    id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.has_company_role(
    id,
    array['company_admin']::public.company_role[]
  )
);

create policy companies_delete_platform_admin
on public.companies
for delete
to authenticated
using (
  private.is_platform_super_admin()
);

create policy user_profiles_select_authorized
on public.user_profiles
for select
to authenticated
using (
  private.can_view_user_profile(user_id)
);

create policy user_profiles_update_self
on public.user_profiles
for update
to authenticated
using (
  user_id = private.current_actor_user_id()
)
with check (
  user_id = private.current_actor_user_id()
);

create policy company_memberships_select_authorized
on public.company_memberships
for select
to authenticated
using (
  user_id = private.current_actor_user_id()
  or private.has_company_role(
    company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  )
);

create policy company_memberships_insert_company_admin
on public.company_memberships
for insert
to authenticated
with check (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy company_memberships_update_company_admin
on public.company_memberships
for update
to authenticated
using (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy company_memberships_delete_company_admin
on public.company_memberships
for delete
to authenticated
using (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy audit_events_select_management
on public.audit_events
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

revoke create on schema public from public;

revoke all
on public.companies
from anon, authenticated;

revoke all
on public.user_profiles
from anon, authenticated;

revoke all
on public.company_memberships
from anon, authenticated;

revoke all
on public.audit_events
from anon, authenticated;

grant select, insert, update, delete
on public.companies
to authenticated;

grant select
on public.user_profiles
to authenticated;

grant update (
  display_name,
  avatar_path
)
on public.user_profiles
to authenticated;

grant select, insert, delete
on public.company_memberships
to authenticated;

grant update (
  role,
  status,
  joined_at
)
on public.company_memberships
to authenticated;

grant select
on public.audit_events
to authenticated;

grant all
on public.companies,
   public.user_profiles,
   public.company_memberships,
   public.audit_events
to service_role;

revoke all
on all functions in schema private
from public;

grant execute
on function private.current_actor_user_id()
to authenticated, service_role;

grant execute
on function private.current_company_id()
to authenticated, service_role;

grant execute
on function private.current_request_id()
to authenticated, service_role;

grant execute
on function private.is_platform_super_admin()
to authenticated, service_role;

grant execute
on function private.has_company_access(uuid)
to authenticated, service_role;

grant execute
on function private.has_company_role(
  uuid,
  public.company_role[]
)
to authenticated, service_role;

grant execute
on function private.can_view_user_profile(uuid)
to authenticated, service_role;

commit;
