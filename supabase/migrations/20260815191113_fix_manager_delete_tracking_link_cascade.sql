-- Allow the existing Manager-deletion lifecycle cascade to archive
-- Manager/Publisher tracking links through the tracking-link trigger's
-- existing narrowly scoped system-write mechanism.
--
-- Normal direct tracking-link writes remain governed by
-- private.enforce_tracking_link_write_rules().
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
    select coalesce(
      array_agg(membership.id),
      array[]::uuid[]
    )
    into child_membership_ids
    from public.company_memberships as membership
    where membership.company_id = new.company_id
      and membership.role = 'publisher'
      and membership.invited_by = new.user_id
      and membership.status <> 'revoked';
    update public.company_memberships as membership
    set
      status = 'revoked',
      deleted_reason =
        'Deleted automatically because the owning Manager was deleted.'
    where membership.id = any(child_membership_ids);
    update public.offer_assignments as assignment
    set status = 'revoked'
    where assignment.company_id = new.company_id
      and assignment.status <> 'revoked'
      and (
        assignment.membership_id = new.id
        or assignment.manager_membership_id = new.id
        or assignment.membership_id =
            any(child_membership_ids)
      );
    /*
     * enforce_tracking_link_write_rules() already supports
     * app.tracking_link_system_write for trusted lifecycle writes.
     *
     * set_config(..., true) keeps this value transaction-local.
     */
    perform set_config(
      'app.tracking_link_system_write',
      'true',
      true
    );
    update public.tracking_links as link
    set status = 'archived'
    where link.company_id = new.company_id
      and link.status <> 'archived'
      and (
        link.owner_membership_id = new.id
        or link.owner_membership_id =
            any(child_membership_ids)
      );
    /*
     * Do not leave system-write permission enabled for later
     * statements in the same transaction.
     */
    perform set_config(
      'app.tracking_link_system_write',
      'false',
      true
    );
  end if;
  return new;
end;
$function$;
revoke all
on function private.cascade_deleted_manager_access()
from public;