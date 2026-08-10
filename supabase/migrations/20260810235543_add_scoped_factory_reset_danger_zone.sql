begin;

create table if not exists private.factory_reset_auth_cleanup_queue (
  reset_id uuid not null,
  user_id uuid not null,
  scope text not null
    check (scope in ('tracker', 'company')),
  company_id uuid,
  created_at timestamptz not null default now(),
  primary key (reset_id, user_id),
  unique (user_id)
);

revoke all
on table private.factory_reset_auth_cleanup_queue
from public;

create table if not exists private.factory_reset_external_cleanup_queue (
  reset_id uuid not null,
  provider text not null
    check (provider in ('render')),
  resource_type text not null
    check (resource_type in ('tracking_domain')),
  resource_id text not null,
  hostname text not null,
  scope text not null
    check (scope in ('tracker', 'company')),
  company_id uuid,
  created_at timestamptz not null default now(),
  primary key (reset_id, provider, resource_type, resource_id),
  unique (provider, resource_type, resource_id)
);

revoke all
on table private.factory_reset_external_cleanup_queue
from public;

create table if not exists private.factory_reset_storage_cleanup_queue (
  reset_id uuid not null,
  bucket_id text not null,
  object_name text not null,
  owner_id text,
  scope text not null
    check (scope in ('tracker', 'company')),
  company_id uuid,
  created_at timestamptz not null default now(),
  primary key (reset_id, bucket_id, object_name),
  unique (bucket_id, object_name)
);

revoke all
on table private.factory_reset_storage_cleanup_queue
from public;

create or replace function private.factory_reset_tracker()
returns table (
  reset_id uuid,
  scope text,
  company_id uuid,
  deleted_tables integer,
  deleted_records bigint,
  auth_users_targeted integer,
  external_resources_targeted integer,
  storage_objects_targeted integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  project_tables constant text[] := array['audit_events', 'billing_invoices', 'billing_plan_entitlements', 'billing_plans', 'companies', 'company_customizations', 'company_invitations', 'company_memberships', 'company_proxy_configurations', 'company_smtp_configurations', 'company_smtp_test_events', 'company_subscriptions', 'conversion_postback_events', 'conversions', 'duplicate_protection_rules', 'email_delivery_attempts', 'email_notifications', 'member_payout_profiles', 'network_account_operational_configurations', 'network_accounts', 'network_postback_endpoints', 'network_provider_integration_configurations', 'network_providers', 'offer_assignments', 'offer_operational_configurations', 'offers', 'proxy_detection_cache', 'publisher_operational_configurations', 'tracking_clicks', 'tracking_domains', 'tracking_links', 'user_profiles']::text[];
  preserved_global_tables constant text[] :=
    array['billing_plans', 'billing_plan_entitlements']::text[];
  target_tables text[];
  remaining_tables text[];
  retry_tables text[];
  table_name text;
  affected_rows bigint;
  total_deleted_records bigint := 0;
  total_deleted_tables integer := 0;
  progress_made boolean;
  tenant_auth_user_ids uuid[];
  external_resource_count integer := 0;
  storage_object_count integer := 0;
  generated_reset_id uuid := gen_random_uuid();
begin
  if not private.is_platform_super_admin() then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin can factory-reset the tracker.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('publisher-tracker:factory-reset:global', 0)
  );

  select coalesce(array_agg(auth_user.id order by auth_user.id), '{}'::uuid[])
  into tenant_auth_user_ids
  from auth.users as auth_user
  where not exists (
    select 1
    from public.user_profiles as profile
    where profile.user_id = auth_user.id
      and profile.platform_role = 'platform_super_admin'
  );

  delete from private.factory_reset_auth_cleanup_queue as cleanup
  where exists (
    select 1
    from public.user_profiles as profile
    where profile.user_id = cleanup.user_id
      and profile.platform_role = 'platform_super_admin'
  );

  insert into private.factory_reset_external_cleanup_queue (
    reset_id,
    provider,
    resource_type,
    resource_id,
    hostname,
    scope,
    company_id
  )
  select
    generated_reset_id,
    'render',
    'tracking_domain',
    domain.provider_custom_domain_id,
    domain.hostname,
    'tracker',
    domain.company_id
  from public.tracking_domains as domain
  where domain.provider = 'render'
    and domain.provider_custom_domain_id is not null
    and btrim(domain.provider_custom_domain_id) <> ''
  on conflict (provider, resource_type, resource_id) do nothing;

  get diagnostics external_resource_count = row_count;

  insert into private.factory_reset_storage_cleanup_queue (
    reset_id,
    bucket_id,
    object_name,
    owner_id,
    scope,
    company_id
  )
  select
    generated_reset_id,
    storage_object.bucket_id,
    storage_object.name,
    storage_object.owner_id,
    'tracker',
    null
  from storage.objects as storage_object
  where storage_object.owner_id = any(tenant_auth_user_ids::text[])
  on conflict (bucket_id, object_name) do nothing;

  get diagnostics storage_object_count = row_count;

  target_tables := array(
    select candidate
    from unnest(project_tables) as candidate
    where not (candidate = any(preserved_global_tables))
    order by candidate
  );

  begin
    foreach table_name in array project_tables loop
      execute format(
        'alter table public.%I disable trigger user',
        table_name
      );
    end loop;

    remaining_tables := target_tables;

    while coalesce(array_length(remaining_tables, 1), 0) > 0 loop
      retry_tables := '{}'::text[];
      progress_made := false;

      foreach table_name in array remaining_tables loop
        begin
          if table_name = 'user_profiles' then
            execute
              'delete from public.user_profiles
               where platform_role is distinct from ''platform_super_admin''';
          else
            execute format('delete from public.%I', table_name);
          end if;

          get diagnostics affected_rows = row_count;

          if affected_rows > 0 then
            total_deleted_records := total_deleted_records + affected_rows;
            total_deleted_tables := total_deleted_tables + 1;
          end if;

          progress_made := true;
        exception
          when foreign_key_violation then
            retry_tables := array_append(retry_tables, table_name);
        end;
      end loop;

      if coalesce(array_length(retry_tables, 1), 0) = 0 then
        exit;
      end if;

      if not progress_made then
        raise exception
          using
            errcode = '23503',
            message =
              'Factory reset could not resolve public-table foreign-key dependencies.',
            detail = array_to_string(retry_tables, ', ');
      end if;

      remaining_tables := retry_tables;
    end loop;

    foreach table_name in array project_tables loop
      execute format(
        'alter table public.%I enable trigger user',
        table_name
      );
    end loop;
  exception
    when others then
      foreach table_name in array project_tables loop
        begin
          execute format(
            'alter table public.%I enable trigger user',
            table_name
          );
        exception
          when others then
            null;
        end;
      end loop;

      raise;
  end;

  if coalesce(array_length(tenant_auth_user_ids, 1), 0) > 0 then
    insert into private.factory_reset_auth_cleanup_queue (
      reset_id,
      user_id,
      scope,
      company_id
    )
    select
      generated_reset_id,
      user_id,
      'tracker',
      null
    from unnest(tenant_auth_user_ids) as user_id
    on conflict (user_id) do nothing;
  end if;

  -- With every tenant row removed, restart application-owned sequences except
  -- the preserved global billing-plan reference tables.
  for table_name in
    select distinct sequence_relation.relname
    from pg_class as sequence_relation
    inner join pg_namespace as sequence_namespace
      on sequence_namespace.oid = sequence_relation.relnamespace
    inner join pg_depend as dependency
      on dependency.objid = sequence_relation.oid
     and dependency.deptype in ('a', 'i')
    inner join pg_class as owner_relation
      on owner_relation.oid = dependency.refobjid
    inner join pg_namespace as owner_namespace
      on owner_namespace.oid = owner_relation.relnamespace
    where sequence_relation.relkind = 'S'
      and sequence_namespace.nspname = 'public'
      and owner_namespace.nspname = 'public'
      and owner_relation.relname = any(project_tables)
      and not (owner_relation.relname = any(preserved_global_tables))
  loop
    execute format('alter sequence public.%I restart with 1', table_name);
  end loop;

  return query
  select
    generated_reset_id,
    'tracker'::text,
    null::uuid,
    total_deleted_tables,
    total_deleted_records,
    coalesce(array_length(tenant_auth_user_ids, 1), 0),
    external_resource_count,
    storage_object_count;
end;
$function$;

revoke all
on function private.factory_reset_tracker()
from public;

grant execute
on function private.factory_reset_tracker()
to authenticated, service_role;

create or replace function private.factory_reset_company(
  target_company_id uuid,
  preserved_admin_user_id uuid
)
returns table (
  reset_id uuid,
  scope text,
  company_id uuid,
  deleted_tables integer,
  deleted_records bigint,
  auth_users_targeted integer,
  external_resources_targeted integer,
  storage_objects_targeted integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  project_tables constant text[] := array['audit_events', 'billing_invoices', 'billing_plan_entitlements', 'billing_plans', 'companies', 'company_customizations', 'company_invitations', 'company_memberships', 'company_proxy_configurations', 'company_smtp_configurations', 'company_smtp_test_events', 'company_subscriptions', 'conversion_postback_events', 'conversions', 'duplicate_protection_rules', 'email_delivery_attempts', 'email_notifications', 'member_payout_profiles', 'network_account_operational_configurations', 'network_accounts', 'network_postback_endpoints', 'network_provider_integration_configurations', 'network_providers', 'offer_assignments', 'offer_operational_configurations', 'offers', 'proxy_detection_cache', 'publisher_operational_configurations', 'tracking_clicks', 'tracking_domains', 'tracking_links', 'user_profiles']::text[];
  target_tables text[];
  remaining_tables text[];
  retry_tables text[];
  table_name text;
  affected_rows bigint;
  total_deleted_records bigint := 0;
  total_deleted_tables integer := 0;
  progress_made boolean;
  candidate_user_ids uuid[];
  purge_user_ids uuid[];
  storage_owner_user_ids uuid[];
  external_resource_count integer := 0;
  storage_object_count integer := 0;
  generated_reset_id uuid := gen_random_uuid();
begin
  if private.current_actor_user_id() is distinct from preserved_admin_user_id then
    raise exception
      using
        errcode = '42501',
        message = 'The preserved Company Admin must be the current actor.';
  end if;

  if not exists (
    select 1
    from public.companies as company
    inner join public.company_memberships as membership
      on membership.company_id = company.id
    where company.id = target_company_id
      and company.status = 'active'
      and membership.user_id = preserved_admin_user_id
      and membership.role = 'company_admin'
      and membership.status = 'active'
  ) then
    raise exception
      using
        errcode = '42501',
        message =
          'An active Company Admin membership is required for this company reset.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'publisher-tracker:factory-reset:company:' || target_company_id::text,
      0
    )
  );

  create temporary table factory_reset_preserved_membership
  on commit drop
  as
  select *
  from public.company_memberships
  where company_id = target_company_id
    and user_id = preserved_admin_user_id
    and role = 'company_admin'
    and status = 'active';

  if (select count(*) from factory_reset_preserved_membership) <> 1 then
    raise exception
      using
        errcode = '23514',
        message = 'Exactly one Company Admin membership must be preserved.';
  end if;

  select coalesce(array_agg(distinct membership.user_id), '{}'::uuid[])
  into candidate_user_ids
  from public.company_memberships as membership
  where membership.company_id = target_company_id
    and membership.user_id <> preserved_admin_user_id
    and not exists (
      select 1
      from public.user_profiles as profile
      where profile.user_id = membership.user_id
        and profile.platform_role = 'platform_super_admin'
    );

  insert into private.factory_reset_external_cleanup_queue (
    reset_id,
    provider,
    resource_type,
    resource_id,
    hostname,
    scope,
    company_id
  )
  select
    generated_reset_id,
    'render',
    'tracking_domain',
    domain.provider_custom_domain_id,
    domain.hostname,
    'company',
    target_company_id
  from public.tracking_domains as domain
  where domain.company_id = target_company_id
    and domain.provider = 'render'
    and domain.provider_custom_domain_id is not null
    and btrim(domain.provider_custom_domain_id) <> ''
  on conflict (provider, resource_type, resource_id) do nothing;

  get diagnostics external_resource_count = row_count;

  select coalesce(array_agg(table_name order by table_name), '{}'::text[])
  into target_tables
  from (
    select candidate as table_name
    from unnest(project_tables) as candidate
    where candidate not in (
      'companies',
      'company_subscriptions',
      'user_profiles',
      'billing_plans',
      'billing_plan_entitlements'
    )
      and exists (
        select 1
        from pg_attribute as attribute
        inner join pg_class as relation
          on relation.oid = attribute.attrelid
        inner join pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = candidate
          and attribute.attname = 'company_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
      )
  ) as scoped_tables;

  begin
    foreach table_name in array project_tables loop
      execute format(
        'alter table public.%I disable trigger user',
        table_name
      );
    end loop;

    remaining_tables := target_tables;

    while coalesce(array_length(remaining_tables, 1), 0) > 0 loop
      retry_tables := '{}'::text[];
      progress_made := false;

      foreach table_name in array remaining_tables loop
        begin
          execute format(
            'delete from public.%I where company_id = $1',
            table_name
          )
          using target_company_id;

          get diagnostics affected_rows = row_count;

          if affected_rows > 0 then
            total_deleted_records := total_deleted_records + affected_rows;
            total_deleted_tables := total_deleted_tables + 1;
          end if;

          progress_made := true;
        exception
          when foreign_key_violation then
            retry_tables := array_append(retry_tables, table_name);
        end;
      end loop;

      if coalesce(array_length(retry_tables, 1), 0) = 0 then
        exit;
      end if;

      if not progress_made then
        raise exception
          using
            errcode = '23503',
            message =
              'Company reset could not resolve company-scoped foreign-key dependencies.',
            detail = array_to_string(retry_tables, ', ');
      end if;

      remaining_tables := retry_tables;
    end loop;

    insert into public.company_memberships
    select *
    from factory_reset_preserved_membership;

    update public.company_subscriptions
    set
      created_by = case
        when created_by = any(candidate_user_ids) then preserved_admin_user_id
        else created_by
      end,
      updated_by = case
        when updated_by = any(candidate_user_ids) then preserved_admin_user_id
        else updated_by
      end
    where company_id = target_company_id;

    select coalesce(array_agg(candidate_user_id), '{}'::uuid[])
    into purge_user_ids
    from unnest(candidate_user_ids) as candidate_user_id
    where not exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = candidate_user_id
    )
      and not exists (
        select 1
        from public.user_profiles as profile
        where profile.user_id = candidate_user_id
          and profile.platform_role = 'platform_super_admin'
      );

    if coalesce(array_length(purge_user_ids, 1), 0) > 0 then
      delete from public.user_profiles
      where user_id = any(purge_user_ids);

      get diagnostics affected_rows = row_count;

      if affected_rows > 0 then
        total_deleted_records := total_deleted_records + affected_rows;
        total_deleted_tables := total_deleted_tables + 1;
      end if;
    end if;

    foreach table_name in array project_tables loop
      execute format(
        'alter table public.%I enable trigger user',
        table_name
      );
    end loop;
  exception
    when others then
      foreach table_name in array project_tables loop
        begin
          execute format(
            'alter table public.%I enable trigger user',
            table_name
          );
        exception
          when others then
            null;
        end;
      end loop;

      raise;
  end;

  storage_owner_user_ids := purge_user_ids;

  if not exists (
    select 1
    from public.company_memberships as membership
    where membership.user_id = preserved_admin_user_id
      and membership.company_id <> target_company_id
  ) then
    storage_owner_user_ids :=
      array_append(storage_owner_user_ids, preserved_admin_user_id);
  end if;

  if coalesce(array_length(storage_owner_user_ids, 1), 0) > 0 then
    insert into private.factory_reset_storage_cleanup_queue (
      reset_id,
      bucket_id,
      object_name,
      owner_id,
      scope,
      company_id
    )
    select
      generated_reset_id,
      storage_object.bucket_id,
      storage_object.name,
      storage_object.owner_id,
      'company',
      target_company_id
    from storage.objects as storage_object
    where storage_object.owner_id = any(storage_owner_user_ids::text[])
    on conflict (bucket_id, object_name) do nothing;

    get diagnostics storage_object_count = row_count;
  end if;

  -- Drop stale pending Auth cleanup entries that are no longer safe because
  -- the user gained another company membership or became a Platform Admin.
  delete from private.factory_reset_auth_cleanup_queue as cleanup
  where cleanup.scope = 'company'
    and cleanup.company_id = target_company_id
    and (
      exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = cleanup.user_id
      )
      or exists (
        select 1
        from public.user_profiles as profile
        where profile.user_id = cleanup.user_id
          and profile.platform_role = 'platform_super_admin'
      )
    );

  if coalesce(array_length(purge_user_ids, 1), 0) > 0 then
    insert into private.factory_reset_auth_cleanup_queue (
      reset_id,
      user_id,
      scope,
      company_id
    )
    select
      generated_reset_id,
      user_id,
      'company',
      target_company_id
    from unnest(purge_user_ids) as user_id
    on conflict (user_id) do nothing;
  end if;

  return query
  select
    generated_reset_id,
    'company'::text,
    target_company_id,
    total_deleted_tables,
    total_deleted_records,
    coalesce(array_length(purge_user_ids, 1), 0),
    external_resource_count,
    storage_object_count;
end;
$function$;

revoke all
on function private.factory_reset_company(uuid, uuid)
from public;

grant execute
on function private.factory_reset_company(uuid, uuid)
to authenticated, service_role;

create or replace function private.list_factory_reset_auth_cleanup(
  requested_scope text,
  requested_company_id uuid
)
returns table (
  reset_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if requested_scope = 'tracker' then
    if not private.is_platform_super_admin() then
      raise exception
        using
          errcode = '42501',
          message =
            'Only a Platform Super Admin can read global factory-reset Auth cleanup.';
    end if;
  elsif requested_scope = 'company' then
    if requested_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        inner join public.companies as company
          on company.id = membership.company_id
        where membership.company_id = requested_company_id
          and membership.user_id = private.current_actor_user_id()
          and membership.role = 'company_admin'
          and membership.status = 'active'
          and company.status = 'active'
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only an active Company Admin can read company factory-reset Auth cleanup.';
    end if;
  else
    raise exception
      using
        errcode = '22023',
        message = 'Unsupported factory-reset Auth cleanup scope.';
  end if;

  return query
  select
    cleanup.reset_id,
    cleanup.user_id
  from private.factory_reset_auth_cleanup_queue as cleanup
  where (
      requested_scope = 'tracker'
      or (
        cleanup.scope = 'company'
        and cleanup.company_id = requested_company_id
      )
    )
    and not exists (
      select 1
      from public.user_profiles as profile
      where profile.user_id = cleanup.user_id
        and profile.platform_role = 'platform_super_admin'
    )
    and (
      requested_scope = 'tracker'
      or not exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = cleanup.user_id
      )
    )
  order by cleanup.created_at asc, cleanup.reset_id asc, cleanup.user_id asc;
end;
$function$;

revoke all
on function private.list_factory_reset_auth_cleanup(text, uuid)
from public;

grant execute
on function private.list_factory_reset_auth_cleanup(text, uuid)
to authenticated, service_role;

create or replace function private.complete_factory_reset_auth_cleanup(
  completed_reset_id uuid,
  completed_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  cleanup_scope text;
  cleanup_company_id uuid;
begin
  select
    cleanup.scope,
    cleanup.company_id
  into
    cleanup_scope,
    cleanup_company_id
  from private.factory_reset_auth_cleanup_queue as cleanup
  where cleanup.reset_id = completed_reset_id
    and cleanup.user_id = completed_user_id
  limit 1;

  if not found then
    return;
  end if;

  if private.is_platform_super_admin() then
    null;
  elsif cleanup_scope = 'company' then
    if cleanup_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        inner join public.companies as company
          on company.id = membership.company_id
        where membership.company_id = cleanup_company_id
          and membership.user_id = private.current_actor_user_id()
          and membership.role = 'company_admin'
          and membership.status = 'active'
          and company.status = 'active'
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only an active Company Admin can complete company factory-reset Auth cleanup.';
    end if;
  elsif cleanup_scope = 'tracker' then
    raise exception
      using
        errcode = '42501',
        message =
          'Only a Platform Super Admin can complete global factory-reset Auth cleanup.';
  else
    raise exception
      using
        errcode = '22023',
        message = 'Unsupported factory-reset Auth cleanup scope.';
  end if;

  delete from private.factory_reset_auth_cleanup_queue
  where reset_id = completed_reset_id
    and user_id = completed_user_id;
end;
$function$;

revoke all
on function private.complete_factory_reset_auth_cleanup(uuid, uuid)
from public;

grant execute
on function private.complete_factory_reset_auth_cleanup(uuid, uuid)
to authenticated, service_role;

create or replace function private.list_factory_reset_external_cleanup(
  requested_scope text,
  requested_company_id uuid
)
returns table (
  reset_id uuid,
  provider text,
  resource_type text,
  resource_id text,
  hostname text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if requested_scope = 'tracker' then
    if not private.is_platform_super_admin() then
      raise exception
        using
          errcode = '42501',
          message =
            'Only a Platform Super Admin can read global factory-reset external cleanup.';
    end if;
  elsif requested_scope = 'company' then
    if requested_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        inner join public.companies as company
          on company.id = membership.company_id
        where membership.company_id = requested_company_id
          and membership.user_id = private.current_actor_user_id()
          and membership.role = 'company_admin'
          and membership.status = 'active'
          and company.status = 'active'
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only an active Company Admin can read company factory-reset external cleanup.';
    end if;
  else
    raise exception
      using
        errcode = '22023',
        message = 'Unsupported factory-reset external cleanup scope.';
  end if;

  return query
  select
    cleanup.reset_id,
    cleanup.provider,
    cleanup.resource_type,
    cleanup.resource_id,
    cleanup.hostname
  from private.factory_reset_external_cleanup_queue as cleanup
  where (
      requested_scope = 'tracker'
      or (
        cleanup.scope = 'company'
        and cleanup.company_id = requested_company_id
      )
    )
  order by
    cleanup.created_at asc,
    cleanup.reset_id asc,
    cleanup.resource_id asc;
end;
$function$;

revoke all
on function private.list_factory_reset_external_cleanup(text, uuid)
from public;

grant execute
on function private.list_factory_reset_external_cleanup(text, uuid)
to authenticated, service_role;

create or replace function private.complete_factory_reset_external_cleanup(
  completed_reset_id uuid,
  completed_provider text,
  completed_resource_type text,
  completed_resource_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  cleanup_scope text;
  cleanup_company_id uuid;
begin
  select
    cleanup.scope,
    cleanup.company_id
  into
    cleanup_scope,
    cleanup_company_id
  from private.factory_reset_external_cleanup_queue as cleanup
  where cleanup.reset_id = completed_reset_id
    and cleanup.provider = completed_provider
    and cleanup.resource_type = completed_resource_type
    and cleanup.resource_id = completed_resource_id
  limit 1;

  if not found then
    return;
  end if;

  if private.is_platform_super_admin() then
    null;
  elsif cleanup_scope = 'company' then
    if cleanup_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        inner join public.companies as company
          on company.id = membership.company_id
        where membership.company_id = cleanup_company_id
          and membership.user_id = private.current_actor_user_id()
          and membership.role = 'company_admin'
          and membership.status = 'active'
          and company.status = 'active'
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only an active Company Admin can complete company factory-reset external cleanup.';
    end if;
  elsif cleanup_scope = 'tracker' then
    raise exception
      using
        errcode = '42501',
        message =
          'Only a Platform Super Admin can complete global factory-reset external cleanup.';
  else
    raise exception
      using
        errcode = '22023',
        message = 'Unsupported factory-reset external cleanup scope.';
  end if;

  delete from private.factory_reset_external_cleanup_queue
  where reset_id = completed_reset_id
    and provider = completed_provider
    and resource_type = completed_resource_type
    and resource_id = completed_resource_id;
end;
$function$;

revoke all
on function private.complete_factory_reset_external_cleanup(uuid, text, text, text)
from public;

grant execute
on function private.complete_factory_reset_external_cleanup(uuid, text, text, text)
to authenticated, service_role;

create or replace function private.list_factory_reset_storage_cleanup(
  requested_scope text,
  requested_company_id uuid
)
returns table (
  reset_id uuid,
  bucket_id text,
  object_name text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if requested_scope = 'tracker' then
    if not private.is_platform_super_admin() then
      raise exception
        using
          errcode = '42501',
          message =
            'Only a Platform Super Admin can read global factory-reset Storage cleanup.';
    end if;
  elsif requested_scope = 'company' then
    if requested_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        inner join public.companies as company
          on company.id = membership.company_id
        where membership.company_id = requested_company_id
          and membership.user_id = private.current_actor_user_id()
          and membership.role = 'company_admin'
          and membership.status = 'active'
          and company.status = 'active'
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only an active Company Admin can read company factory-reset Storage cleanup.';
    end if;
  else
    raise exception
      using
        errcode = '22023',
        message = 'Unsupported factory-reset Storage cleanup scope.';
  end if;

  return query
  select
    cleanup.reset_id,
    cleanup.bucket_id,
    cleanup.object_name
  from private.factory_reset_storage_cleanup_queue as cleanup
  where (
      requested_scope = 'tracker'
      or (
        cleanup.scope = 'company'
        and cleanup.company_id = requested_company_id
      )
    )
  order by
    cleanup.created_at asc,
    cleanup.reset_id asc,
    cleanup.bucket_id asc,
    cleanup.object_name asc;
end;
$function$;

revoke all
on function private.list_factory_reset_storage_cleanup(text, uuid)
from public;

grant execute
on function private.list_factory_reset_storage_cleanup(text, uuid)
to authenticated, service_role;

create or replace function private.complete_factory_reset_storage_cleanup(
  completed_reset_id uuid,
  completed_bucket_id text,
  completed_object_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  cleanup_scope text;
  cleanup_company_id uuid;
begin
  select
    cleanup.scope,
    cleanup.company_id
  into
    cleanup_scope,
    cleanup_company_id
  from private.factory_reset_storage_cleanup_queue as cleanup
  where cleanup.reset_id = completed_reset_id
    and cleanup.bucket_id = completed_bucket_id
    and cleanup.object_name = completed_object_name
  limit 1;

  if not found then
    return;
  end if;

  if private.is_platform_super_admin() then
    null;
  elsif cleanup_scope = 'company' then
    if cleanup_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        inner join public.companies as company
          on company.id = membership.company_id
        where membership.company_id = cleanup_company_id
          and membership.user_id = private.current_actor_user_id()
          and membership.role = 'company_admin'
          and membership.status = 'active'
          and company.status = 'active'
      )
    then
      raise exception
        using
          errcode = '42501',
          message =
            'Only an active Company Admin can complete company factory-reset Storage cleanup.';
    end if;
  elsif cleanup_scope = 'tracker' then
    raise exception
      using
        errcode = '42501',
        message =
          'Only a Platform Super Admin can complete global factory-reset Storage cleanup.';
  else
    raise exception
      using
        errcode = '22023',
        message = 'Unsupported factory-reset Storage cleanup scope.';
  end if;

  delete from private.factory_reset_storage_cleanup_queue
  where reset_id = completed_reset_id
    and bucket_id = completed_bucket_id
    and object_name = completed_object_name;
end;
$function$;

revoke all
on function private.complete_factory_reset_storage_cleanup(uuid, text, text)
from public;

grant execute
on function private.complete_factory_reset_storage_cleanup(uuid, text, text)
to authenticated, service_role;

commit;
