begin;
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
  if tg_op = 'UPDATE' then
    if new.offer_id is distinct from old.offer_id
      or new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Offer configuration company, Offer, and creation fields are immutable.';
    end if;
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
revoke all
on function private.enforce_offer_operational_configuration_write_rules()
from public;
grant execute
on function private.enforce_offer_operational_configuration_write_rules()
to authenticated, service_role;

-- Universal terminal logical-deletion policy.
-- Internal status names remain archived/revoked for compatibility; the UI labels them Deleted.

create or replace function private.prevent_terminal_company_restore()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.status = 'archived'
    and new.status is distinct from old.status
  then
    raise exception
      using
        errcode = '23514',
        message = 'A deleted company is terminal and cannot be restored.';
  end if;

  return new;
end;
$function$;

drop trigger if exists aa_companies_prevent_terminal_restore
on public.companies;

create trigger aa_companies_prevent_terminal_restore
before update of status on public.companies
for each row
execute function private.prevent_terminal_company_restore();

create or replace function private.prevent_terminal_membership_restore()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.status = 'revoked'
    and new.status is distinct from old.status
  then
    raise exception
      using
        errcode = '23514',
        message = 'A deleted membership is terminal and cannot be restored.';
  end if;

  return new;
end;
$function$;

drop trigger if exists aa_company_memberships_prevent_terminal_restore
on public.company_memberships;

create trigger aa_company_memberships_prevent_terminal_restore
before update of status on public.company_memberships
for each row
execute function private.prevent_terminal_membership_restore();

-- Historical entities must never be physically removed.
drop trigger if exists offers_prevent_hard_delete
on public.offers;
create trigger offers_prevent_hard_delete
before delete on public.offers
for each row
execute function private.prevent_hard_delete();

drop trigger if exists network_accounts_prevent_hard_delete
on public.network_accounts;
create trigger network_accounts_prevent_hard_delete
before delete on public.network_accounts
for each row
execute function private.prevent_hard_delete();

drop trigger if exists tracking_domains_prevent_hard_delete
on public.tracking_domains;
create trigger tracking_domains_prevent_hard_delete
before delete on public.tracking_domains
for each row
execute function private.prevent_hard_delete();

drop trigger if exists network_providers_prevent_hard_delete
on public.network_providers;
create trigger network_providers_prevent_hard_delete
before delete on public.network_providers
for each row
execute function private.prevent_hard_delete();



-- Deleting a Manager is terminal and cascades operational deletion to every
-- Publisher membership created by that Manager, their active Offer assignments,
-- and assignment-specific tracking links. Historical rows/clicks/conversions remain.
create or replace function private.cascade_deleted_manager_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  child_membership_ids uuid[];
begin
  if old.role = 'manager'
    and new.role = 'manager'
    and old.status is distinct from 'revoked'
    and new.status = 'revoked'
  then
    select coalesce(array_agg(membership.id), array[]::uuid[])
    into child_membership_ids
    from public.company_memberships as membership
    where membership.company_id = new.company_id
      and membership.role = 'publisher'
      and membership.invited_by = new.user_id
      and membership.status <> 'revoked';

    update public.company_memberships as membership
    set status = 'revoked'
    where membership.id = any(child_membership_ids);

    update public.offer_assignments as assignment
    set status = 'revoked'
    where assignment.company_id = new.company_id
      and assignment.status <> 'revoked'
      and (
        assignment.membership_id = new.id
        or assignment.manager_membership_id = new.id
        or assignment.membership_id = any(child_membership_ids)
      );

    update public.tracking_links as link
    set status = 'archived'
    where link.company_id = new.company_id
      and link.status <> 'archived'
      and (
        link.owner_membership_id = new.id
        or link.owner_membership_id = any(child_membership_ids)
      );
  end if;

  return new;
end;
$function$;

drop trigger if exists zz_company_memberships_cascade_manager_delete
on public.company_memberships;

create trigger zz_company_memberships_cascade_manager_delete
after update of status on public.company_memberships
for each row
execute function private.cascade_deleted_manager_access();

revoke all
on function private.cascade_deleted_manager_access()
from public;

grant execute
on function private.cascade_deleted_manager_access()
to authenticated, service_role;


revoke all
on function private.prevent_terminal_company_restore()
from public;

revoke all
on function private.prevent_terminal_membership_restore()
from public;

grant execute
on function private.prevent_terminal_company_restore()
to authenticated, service_role;

grant execute
on function private.prevent_terminal_membership_restore()
to authenticated, service_role;

commit;
