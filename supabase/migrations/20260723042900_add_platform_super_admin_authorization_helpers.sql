begin;

create or replace function private.enforce_user_profile_update_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  bootstrap_role_assignment boolean;
begin
  bootstrap_role_assignment :=
    old.platform_role is null
    and new.platform_role = 'platform_super_admin'
    and current_setting(
      'app.bootstrap_platform_super_admin',
      true
    ) = 'true'
    and not exists (
      select 1
      from public.user_profiles as existing_profile
      where existing_profile.platform_role = 'platform_super_admin'
        and existing_profile.user_id <> new.user_id
    );

  if new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
  then
    raise exception
      using
        errcode = '42501',
        message = 'User identity and creation fields are immutable.';
  end if;

  if new.platform_role is distinct from old.platform_role
    and not bootstrap_role_assignment
  then
    raise exception
      using
        errcode = '42501',
        message = 'A platform role cannot be changed outside the one-time bootstrap flow.';
  end if;

  if new.status is distinct from old.status
    and not bootstrap_role_assignment
  then
    if not private.is_platform_super_admin() then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin can change user status.';
    end if;

    if new.user_id = private.current_actor_user_id()
      and new.status = 'suspended'
    then
      raise exception
        using
          errcode = '23514',
          message = 'A Platform Super Admin cannot suspend their own account.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.bootstrap_platform_super_admin(
  target_email text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_email text;
  target_user_id uuid;
begin
  normalized_email := lower(
    btrim(
      coalesce(
        target_email,
        ''
      )
    )
  );

  if normalized_email = ''
    or char_length(normalized_email) > 320
  then
    raise exception
      using
        errcode = '22023',
        message = 'A valid target email is required.';
  end if;

  if exists (
    select 1
    from public.user_profiles as existing_profile
    where existing_profile.platform_role = 'platform_super_admin'
  ) then
    raise exception
      using
        errcode = '23505',
        message = 'A Platform Super Admin has already been bootstrapped.';
  end if;

  select auth_user.id
  into target_user_id
  from auth.users as auth_user
  where lower(
    btrim(
      coalesce(
        auth_user.email,
        ''
      )
    )
  ) = normalized_email
  order by auth_user.created_at asc
  limit 1;

  if target_user_id is null then
    raise exception
      using
        errcode = 'P0002',
        message = 'No Supabase Auth user exists for the supplied email.';
  end if;

  insert into public.user_profiles (
    user_id,
    display_name
  )
  select
    auth_user.id,
    left(
      nullif(
        btrim(
          coalesce(
            auth_user.raw_user_meta_data ->> 'display_name',
            ''
          )
        ),
        ''
      ),
      120
    )
  from auth.users as auth_user
  where auth_user.id = target_user_id
  on conflict (user_id) do nothing;

  perform set_config(
    'app.bootstrap_platform_super_admin',
    'true',
    true
  );

  update public.user_profiles
  set
    platform_role = 'platform_super_admin',
    status = 'active'
  where user_id = target_user_id;

  if not found then
    raise exception
      using
        errcode = 'P0002',
        message = 'The target user profile could not be bootstrapped.';
  end if;

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
    null,
    target_user_id,
    null,
    'platform_admin.bootstrapped',
    'user_profile',
    target_user_id::text,
    jsonb_build_object(
      'email',
      normalized_email
    )
  );

  return target_user_id;
end;
$function$;

revoke all
on function private.bootstrap_platform_super_admin(text)
from public, anon, authenticated;

grant execute
on function private.bootstrap_platform_super_admin(text)
to service_role;

commit;
