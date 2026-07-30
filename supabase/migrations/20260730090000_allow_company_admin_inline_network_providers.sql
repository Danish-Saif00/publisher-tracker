begin;

-- Company Admins may create a missing provider from their active company
-- context. Provider updates and archival remain Platform Super Admin only.
create or replace function private.enforce_network_provider_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  actor_company_id uuid;
begin
  actor_is_platform_admin := private.is_platform_super_admin();
  actor_company_id := private.current_company_id();

  if tg_op = 'INSERT' then
    if not actor_is_platform_admin then
      if actor_company_id is null
        or not private.has_company_role(
          actor_company_id,
          array['company_admin']::public.company_role[]
        )
        or not exists (
          select 1
          from public.companies as company
          where company.id = actor_company_id
            and company.status = 'active'
        )
      then
        raise exception
          using
            errcode = '42501',
            message = 'Only a Platform Super Admin or active Company Admin can create network providers.';
      end if;
    end if;

    return new;
  end if;

  if not actor_is_platform_admin then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin can update network providers.';
  end if;

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

  return new;
end;
$function$;

drop policy if exists network_providers_insert_platform_admin
on public.network_providers;

drop policy if exists network_providers_insert_authorized
on public.network_providers;

create policy network_providers_insert_authorized
on public.network_providers
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_any_active_company_role(
    array['company_admin']::public.company_role[]
  )
);

commit;
