begin;

-- The same trigger function is attached to both public.offers and
-- public.offer_operational_configurations. NEW is therefore a table-specific
-- record. A CASE expression that mentions both NEW.id and NEW.offer_id can
-- attempt to resolve a field that does not exist on the current trigger row.
-- Use procedural branches so only the field valid for the current table is
-- referenced during execution.

create or replace function private.sync_offer_assignment_tracking_links()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  assignment_record record;
  target_company_id uuid;
  target_offer_id uuid;
begin
  target_company_id := new.company_id;

  if tg_table_schema = 'public' and tg_table_name = 'offers' then
    target_offer_id := new.id;
  elsif tg_table_schema = 'public'
    and tg_table_name = 'offer_operational_configurations'
  then
    target_offer_id := new.offer_id;
  else
    raise exception
      using
        errcode = '55000',
        message =
          'sync_offer_assignment_tracking_links was invoked from an unsupported table.';
  end if;

  for assignment_record in
    select assignment.membership_id
    from public.offer_assignments as assignment
    inner join public.company_memberships as membership
      on membership.id = assignment.membership_id
     and membership.company_id = assignment.company_id
     and membership.role in ('manager', 'publisher')
    where assignment.company_id = target_company_id
      and assignment.offer_id = target_offer_id
  loop
    perform private.ensure_offer_assignment_tracking_link(
      target_company_id,
      target_offer_id,
      assignment_record.membership_id
    );
  end loop;

  return new;
end;
$function$;

revoke all
on function private.sync_offer_assignment_tracking_links()
from public;

grant execute
on function private.sync_offer_assignment_tracking_links()
to authenticated, service_role;

commit;