begin;

-- Company Admin owns managed-domain provisioning in the application.
-- Preserve database protection against manual verification/activation:
-- only the existing trusted backend provisioning context may write those fields.
CREATE OR REPLACE FUNCTION private.enforce_tracking_domain_write_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
set search_path = pg_catalog
AS $function$
declare
  actor_is_platform_admin boolean;
  trusted_tracking_domain_system_write boolean;
  target_company_id uuid;
begin
  actor_is_platform_admin := private.is_platform_super_admin();
  trusted_tracking_domain_system_write :=
    coalesce(
      current_setting('app.tracking_domain_system_write', true),
      ''
    ) = 'on';

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
        and not trusted_tracking_domain_system_write
        and not (
          old.status = 'suspended'
          and old.verified_at is not null
          and new.verified_at is not distinct from old.verified_at
          and new.hostname is not distinct from old.hostname
        )
      then
        raise exception
          using
            errcode = '42501',
            message =
              'Tracking-domain activation requires the trusted provisioning workflow.';
      end if;

      if new.verified_at is distinct from old.verified_at
        and not trusted_tracking_domain_system_write
      then
        raise exception
          using
            errcode = '42501',
            message =
              'Tracking-domain verification time requires the trusted provisioning workflow.';
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

comment on function private.enforce_tracking_domain_write_rules() is
  'Enforces tracking-domain lifecycle authorization. Company Admin domain activation and verification timestamps are allowed only through the trusted app.tracking_domain_system_write provisioning context; manual tenant writes remain blocked.';

commit;
