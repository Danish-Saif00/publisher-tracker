create or replace function private.cascade_manager_offer_assignment_to_active_publishers()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  manager_user_id uuid;
  effective_actor_user_id uuid;
begin
  select membership.user_id into manager_user_id
  from public.company_memberships membership
  where membership.id = new.membership_id
    and membership.company_id = new.company_id
    and membership.role = 'manager'
  limit 1;

  if manager_user_id is null then return new; end if;

  effective_actor_user_id := coalesce(
    new.updated_by,
    new.assigned_by,
    nullif(pg_catalog.current_setting('app.current_actor_user_id', true), '')::uuid
  );

  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.offer_assignments (
      company_id, offer_id, membership_id, manager_membership_id,
      status, assigned_by, updated_by
    )
    select
      new.company_id, new.offer_id, publisher_membership.id, new.membership_id,
      'active'::public.offer_assignment_status, effective_actor_user_id, effective_actor_user_id
    from public.company_memberships publisher_membership
    join public.user_profiles publisher_profile on publisher_profile.user_id = publisher_membership.user_id
    where publisher_membership.company_id = new.company_id
      and publisher_membership.role = 'publisher'
      and publisher_membership.status = 'active'
      and publisher_profile.status = 'active'
      and publisher_membership.invited_by = manager_user_id
    on conflict (offer_id, membership_id)
    do update set
      manager_membership_id = excluded.manager_membership_id,
      status = 'active'::public.offer_assignment_status,
      updated_by = excluded.updated_by
    where public.offer_assignments.status is distinct from 'active'::public.offer_assignment_status
       or public.offer_assignments.manager_membership_id is distinct from excluded.manager_membership_id;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' and new.status is distinct from 'active' then
    update public.offer_assignments publisher_assignment
    set status = 'revoked'::public.offer_assignment_status,
        updated_by = effective_actor_user_id
    from public.company_memberships publisher_membership
    where publisher_assignment.company_id = new.company_id
      and publisher_assignment.offer_id = new.offer_id
      and publisher_assignment.manager_membership_id = new.membership_id
      and publisher_assignment.status is distinct from 'revoked'::public.offer_assignment_status
      and publisher_membership.id = publisher_assignment.membership_id
      and publisher_membership.company_id = publisher_assignment.company_id
      and publisher_membership.role = 'publisher';
  end if;
  return new;
end;
$function$;

revoke all on function private.cascade_manager_offer_assignment_to_active_publishers() from public;

drop trigger if exists zz_offer_assignments_cascade_manager_offer_access on public.offer_assignments;
create trigger zz_offer_assignments_cascade_manager_offer_access
after insert or update of status on public.offer_assignments
for each row execute function private.cascade_manager_offer_assignment_to_active_publishers();
