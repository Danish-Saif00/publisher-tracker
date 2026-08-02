begin;

create or replace function private.enforce_network_account_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_company_id uuid;
  has_dependencies boolean;
begin
  target_company_id := case
    when tg_op = 'INSERT' then new.company_id
    else old.company_id
  end;

  if not private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  ) then
    raise exception
      using
        errcode = '42501',
        message = 'Only the owning Company Admin can modify network accounts.';
  end if;

  if private.current_company_id() is distinct from target_company_id then
    raise exception
      using
        errcode = '42501',
        message = 'The network-account company must match the active request company.';
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'archived' then
      raise exception
        using
          errcode = '23514',
          message = 'A network account must be archived before permanent deletion.';
    end if;

    select
      exists (
        select 1
        from public.offers as offer
        where offer.company_id = old.company_id
          and offer.network_account_id = old.id
      )
      or exists (
        select 1
        from public.network_postback_endpoints as endpoint
        where endpoint.company_id = old.company_id
          and endpoint.network_account_id = old.id
      )
      or exists (
        select 1
        from public.tracking_clicks as click
        where click.company_id = old.company_id
          and click.network_account_id = old.id
      )
      or exists (
        select 1
        from public.conversions as conversion
        where conversion.company_id = old.company_id
          and conversion.network_account_id = old.id
      )
      or exists (
        select 1
        from public.duplicate_protection_rules as duplicate_rule
        where duplicate_rule.company_id = old.company_id
          and duplicate_rule.network_account_id = old.id
      )
    into has_dependencies;

    if has_dependencies then
      raise exception
        using
          errcode = '23514',
          message = 'A network account with dependent operational or historical records cannot be deleted.';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Network account identity, company, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.provider_id is distinct from old.provider_id
        or new.name is distinct from old.name
        or new.external_account_id is distinct from old.external_account_id
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived network account is immutable.';
    end if;

    if new.provider_id is distinct from old.provider_id then
      select
        exists (
          select 1
          from public.offers as offer
          where offer.company_id = old.company_id
            and offer.network_account_id = old.id
        )
        or exists (
          select 1
          from public.network_postback_endpoints as endpoint
          where endpoint.company_id = old.company_id
            and endpoint.network_account_id = old.id
        )
        or exists (
          select 1
          from public.tracking_clicks as click
          where click.company_id = old.company_id
            and click.network_account_id = old.id
        )
        or exists (
          select 1
          from public.conversions as conversion
          where conversion.company_id = old.company_id
            and conversion.network_account_id = old.id
        )
        or exists (
          select 1
          from public.duplicate_protection_rules as duplicate_rule
          where duplicate_rule.company_id = old.company_id
            and duplicate_rule.network_account_id = old.id
        )
      into has_dependencies;

      if has_dependencies then
        raise exception
          using
            errcode = '23514',
            message = 'The provider cannot change after the network account has dependent records.';
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from public.network_providers as provider
    where provider.id = new.provider_id
      and provider.company_id = target_company_id
      and provider.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'The network account requires an active provider owned by the same company.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

drop trigger if exists network_accounts_enforce_write_rules
on public.network_accounts;

create trigger network_accounts_enforce_write_rules
before insert or update or delete
on public.network_accounts
for each row
execute function private.enforce_network_account_write_rules();

drop policy if exists network_accounts_delete_company_admin
on public.network_accounts;

create policy network_accounts_delete_company_admin
on public.network_accounts
for delete
to authenticated
using (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

grant delete
on public.network_accounts
to authenticated;

revoke all
on function private.enforce_network_account_write_rules()
from public;

grant execute
on function private.enforce_network_account_write_rules()
to authenticated, service_role;

commit;
