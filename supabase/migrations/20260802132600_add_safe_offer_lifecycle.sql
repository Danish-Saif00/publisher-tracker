begin;

create or replace function private.enforce_offer_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_company_id uuid;
  account_company_id uuid;
  account_status public.network_account_status;
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
        message = 'Only the owning Company Admin can modify offers.';
  end if;

  if private.current_company_id() is distinct from target_company_id then
    raise exception
      using
        errcode = '42501',
        message = 'The offer company must match the active request company.';
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'archived' then
      raise exception
        using
          errcode = '23514',
          message = 'An offer must be archived before permanent deletion.';
    end if;

    select
      exists (
        select 1
        from public.offer_assignments as assignment
        inner join public.company_memberships as membership
          on membership.id = assignment.membership_id
         and membership.company_id = assignment.company_id
        where assignment.company_id = old.company_id
          and assignment.offer_id = old.id
          and membership.role = 'publisher'
      )
      or exists (
        select 1
        from public.tracking_links as link
        where link.company_id = old.company_id
          and link.offer_id = old.id
      )
      or exists (
        select 1
        from public.tracking_clicks as click
        where click.company_id = old.company_id
          and click.offer_id = old.id
      )
      or exists (
        select 1
        from public.conversions as conversion
        where conversion.company_id = old.company_id
          and conversion.offer_id = old.id
      )
      or exists (
        select 1
        from public.duplicate_protection_rules as duplicate_rule
        where duplicate_rule.company_id = old.company_id
          and duplicate_rule.offer_id = old.id
      )
    into has_dependencies;

    if has_dependencies then
      raise exception
        using
          errcode = '23514',
          message = 'An offer with Publisher, tracking, fraud, or historical dependencies cannot be deleted.';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.code is distinct from old.code
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Offer identity, company, code, and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.network_account_id is distinct from old.network_account_id
        or new.external_offer_id is distinct from old.external_offer_id
        or new.name is distinct from old.name
        or new.description is distinct from old.description
        or new.destination_url is distinct from old.destination_url
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived offer is immutable.';
    end if;

    if new.status is distinct from old.status
      and not (
        (old.status = 'draft' and new.status in ('active', 'archived'))
        or (old.status = 'active' and new.status in ('paused', 'archived'))
        or (old.status = 'paused' and new.status in ('active', 'archived'))
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'The requested offer status transition is invalid.';
    end if;

    if new.network_account_id is distinct from old.network_account_id then
      select
        exists (
          select 1
          from public.offer_assignments as assignment
          inner join public.company_memberships as membership
            on membership.id = assignment.membership_id
           and membership.company_id = assignment.company_id
          where assignment.company_id = old.company_id
            and assignment.offer_id = old.id
            and membership.role = 'publisher'
        )
        or exists (
          select 1
          from public.tracking_links as link
          where link.company_id = old.company_id
            and link.offer_id = old.id
        )
        or exists (
          select 1
          from public.tracking_clicks as click
          where click.company_id = old.company_id
            and click.offer_id = old.id
        )
        or exists (
          select 1
          from public.conversions as conversion
          where conversion.company_id = old.company_id
            and conversion.offer_id = old.id
        )
        or exists (
          select 1
          from public.duplicate_protection_rules as duplicate_rule
          where duplicate_rule.company_id = old.company_id
            and duplicate_rule.offer_id = old.id
        )
      into has_dependencies;

      if has_dependencies then
        raise exception
          using
            errcode = '23514',
            message = 'The offer network cannot change after Publisher, tracking, fraud, or historical dependencies exist.';
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from public.companies as company
    where company.id = target_company_id
      and company.status = 'active'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'Offers require an active company.';
  end if;

  select account.company_id, account.status
  into account_company_id, account_status
  from public.network_accounts as account
  where account.id = new.network_account_id;

  if account_company_id is null
    or account_company_id <> target_company_id
  then
    raise exception
      using
        errcode = '23514',
        message = 'The offer network account must belong to the same company.';
  end if;

  if (
    tg_op = 'INSERT'
    or new.status = 'active'
    or (
      tg_op = 'UPDATE'
      and new.network_account_id is distinct from old.network_account_id
    )
  )
    and account_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message = 'A new, active, or reassigned offer requires an active network account.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

drop trigger if exists offers_enforce_write_rules
on public.offers;

create trigger offers_enforce_write_rules
before insert or update or delete
on public.offers
for each row
execute function private.enforce_offer_write_rules();

create or replace function private.enforce_offer_operational_configuration_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_company_id uuid;
  target_offer_id uuid;
  target_offer_status public.offer_status;
begin
  target_company_id := case
    when tg_op = 'INSERT' then new.company_id
    else old.company_id
  end;
  target_offer_id := case
    when tg_op = 'INSERT' then new.offer_id
    else old.offer_id
  end;

  if not private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  ) then
    raise exception
      using
        errcode = '42501',
        message = 'Only the owning Company Admin can modify Offer configuration.';
  end if;

  if private.current_company_id() is distinct from target_company_id then
    raise exception
      using
        errcode = '42501',
        message = 'The Offer configuration company must match the active request company.';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.id is distinct from old.id
      or new.offer_id is distinct from old.offer_id
      or new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception
      using
        errcode = '42501',
        message = 'Offer configuration identity, company, Offer, and creation fields are immutable.';
  end if;

  select offer.status
  into target_offer_status
  from public.offers as offer
  where offer.id = target_offer_id
    and offer.company_id = target_company_id;

  if target_offer_status is null then
    raise exception
      using
        errcode = '23514',
        message = 'Offer configuration requires an Offer owned by the same company.';
  end if;

  if target_offer_status = 'archived' then
    raise exception
      using
        errcode = '23514',
        message = 'An archived Offer configuration is immutable.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

drop trigger if exists offer_operational_configurations_enforce_write_rules
on public.offer_operational_configurations;

create trigger offer_operational_configurations_enforce_write_rules
before insert or update
on public.offer_operational_configurations
for each row
execute function private.enforce_offer_operational_configuration_write_rules();

drop policy if exists offers_delete_company_admin
on public.offers;

create policy offers_delete_company_admin
on public.offers
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
on public.offers
to authenticated;

revoke all
on function private.enforce_offer_write_rules()
from public;

grant execute
on function private.enforce_offer_write_rules()
to authenticated, service_role;

revoke all
on function private.enforce_offer_operational_configuration_write_rules()
from public;

grant execute
on function private.enforce_offer_operational_configuration_write_rules()
to authenticated, service_role;

commit;
