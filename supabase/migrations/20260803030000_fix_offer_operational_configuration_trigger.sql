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
commit;