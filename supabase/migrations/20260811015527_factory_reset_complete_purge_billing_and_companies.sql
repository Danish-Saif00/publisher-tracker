begin;

-- Complete factory-reset semantics:
-- 1. Platform reset preserves only Platform Super Admin public/Auth identity.
--    Companies, subscriptions, invoices, billing plans/entitlements, tenant
--    identities, operational data, and tenant-owned resources are reset.
-- 2. Company reset preserves the Company shell and current Company Admin
--    identity/membership required to log back in, but removes company Billing
--    data together with the rest of company operational data.

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
  preserved_global_tables constant text[] := '{}'::text[];
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

  -- Final deterministic zero-state sweep. The generic dependency loop above
  -- remains the primary purge mechanism; these explicit deletes guarantee that
  -- legacy/suspended Company shells and every Billing record cannot survive a
  -- successful Platform factory reset.
  delete from public.billing_invoices;
  get diagnostics affected_rows = row_count;
  if affected_rows > 0 then
    total_deleted_records := total_deleted_records + affected_rows;
    total_deleted_tables := total_deleted_tables + 1;
  end if;

  delete from public.company_subscriptions;
  get diagnostics affected_rows = row_count;
  if affected_rows > 0 then
    total_deleted_records := total_deleted_records + affected_rows;
    total_deleted_tables := total_deleted_tables + 1;
  end if;

  delete from public.billing_plan_entitlements;
  get diagnostics affected_rows = row_count;
  if affected_rows > 0 then
    total_deleted_records := total_deleted_records + affected_rows;
    total_deleted_tables := total_deleted_tables + 1;
  end if;

  delete from public.billing_plans;
  get diagnostics affected_rows = row_count;
  if affected_rows > 0 then
    total_deleted_records := total_deleted_records + affected_rows;
    total_deleted_tables := total_deleted_tables + 1;
  end if;

  delete from public.companies;
  get diagnostics affected_rows = row_count;
  if affected_rows > 0 then
    total_deleted_records := total_deleted_records + affected_rows;
    total_deleted_tables := total_deleted_tables + 1;
  end if;

  if exists (select 1 from public.companies) then
    raise exception
      using
        errcode = '23514',
        message = 'Platform factory reset postcondition failed: Company rows remain.';
  end if;

  if exists (select 1 from public.billing_invoices)
    or exists (select 1 from public.company_subscriptions)
    or exists (select 1 from public.billing_plan_entitlements)
    or exists (select 1 from public.billing_plans)
  then
    raise exception
      using
        errcode = '23514',
        message = 'Platform factory reset postcondition failed: Billing rows remain.';
  end if;

  if exists (
    select 1
    from public.user_profiles as profile
    where profile.platform_role is distinct from 'platform_super_admin'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Platform factory reset postcondition failed: tenant profiles remain.';
  end if;

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
  select membership_to_preserve.*
  from public.company_memberships as membership_to_preserve
  where membership_to_preserve.company_id = target_company_id
    and membership_to_preserve.user_id = preserved_admin_user_id
    and membership_to_preserve.role = 'company_admin'
    and membership_to_preserve.status = 'active';

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

  select coalesce(
    array_agg(scoped_tables.table_name order by scoped_tables.table_name),
    '{}'::text[]
  )
  into target_tables
  from (
    select candidate as table_name
    from unnest(project_tables) as candidate
    where candidate not in (
      'companies',
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

  if exists (
    select 1
    from public.company_subscriptions as subscription
    where subscription.company_id = target_company_id
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Company factory reset postcondition failed: subscription data remains.';
  end if;

  if exists (
    select 1
    from public.billing_invoices as invoice
    where invoice.company_id = target_company_id
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Company factory reset postcondition failed: invoice data remains.';
  end if;

  if not exists (
    select 1
    from public.companies as company_to_preserve
    where company_to_preserve.id = target_company_id
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Company factory reset postcondition failed: Company shell was removed.';
  end if;

  if not exists (
    select 1
    from public.company_memberships as membership_to_preserve
    where membership_to_preserve.company_id = target_company_id
      and membership_to_preserve.user_id = preserved_admin_user_id
      and membership_to_preserve.role = 'company_admin'
      and membership_to_preserve.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Company factory reset postcondition failed: Company Admin login membership was removed.';
  end if;

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

commit;
