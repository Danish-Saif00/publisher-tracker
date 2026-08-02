begin;

create or replace function private.enforce_tracking_link_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id uuid;
  target_company_id uuid;
  offer_company_id uuid;
  offer_status public.offer_status;
  domain_company_id uuid;
  domain_status public.tracking_domain_status;
  owner_company_id uuid;
  owner_user_id uuid;
  owner_role public.company_role;
  owner_status public.company_membership_status;
  actor_can_manage_all boolean;
  archive_only_transition boolean := false;
begin
  actor_user_id := private.current_actor_user_id();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;

  actor_can_manage_all := private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );

  if tg_op = 'DELETE' then
    if not actor_can_manage_all then
      raise exception
        using
          errcode = '42501',
          message = 'Only an active Company Admin can permanently delete a tracking link.';
    end if;

    if old.status <> 'archived'::public.tracking_link_status then
      raise exception
        using
          errcode = '23514',
          message = 'A tracking link must be archived before permanent deletion.';
    end if;

    if old.source <> 'manual'::public.tracking_link_source then
      raise exception
        using
          errcode = '23514',
          message = 'Assignment-generated tracking links cannot be permanently deleted.';
    end if;

    if exists (
      select 1
      from public.tracking_clicks as click
      where click.company_id = old.company_id
        and click.tracking_link_id = old.id
    ) or exists (
      select 1
      from public.conversions as conversion
      where conversion.company_id = old.company_id
        and conversion.tracking_link_id = old.id
    ) then
      raise exception
        using
          errcode = '23503',
          message = 'A tracking link with click or conversion history cannot be permanently deleted.';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.offer_id is distinct from old.offer_id
      or new.owner_membership_id is distinct from old.owner_membership_id
      or new.tracking_code is distinct from old.tracking_code
      or new.source is distinct from old.source
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Tracking-link identity, company, offer, owner, code, source, and creation fields are immutable.';
    end if;

    if old.status = 'archived'::public.tracking_link_status
      and (
        new.tracking_domain_id is distinct from old.tracking_domain_id
        or new.custom_slug is distinct from old.custom_slug
        or new.destination_url is distinct from old.destination_url
        or new.query_parameters is distinct from old.query_parameters
        or new.status is distinct from old.status
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived tracking link is immutable.';
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
          message = 'The requested tracking-link status transition is invalid.';
    end if;

    archive_only_transition :=
      new.status = 'archived'::public.tracking_link_status
      and old.status <> 'archived'::public.tracking_link_status
      and new.tracking_domain_id is not distinct from old.tracking_domain_id
      and new.custom_slug is not distinct from old.custom_slug
      and new.destination_url is not distinct from old.destination_url
      and new.query_parameters is not distinct from old.query_parameters;

    if new.status = 'archived'::public.tracking_link_status
      and old.status <> 'archived'::public.tracking_link_status
      and not archive_only_transition
    then
      raise exception
        using
          errcode = '23514',
          message = 'Archiving a tracking link can change only its status.';
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
        message = 'Tracking links require an active company.';
  end if;

  select offer.company_id, offer.status
  into offer_company_id, offer_status
  from public.offers as offer
  where offer.id = new.offer_id;

  if offer_company_id is null or offer_company_id <> target_company_id then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking-link offer must belong to the same company.';
  end if;

  select domain.company_id, domain.status
  into domain_company_id, domain_status
  from public.tracking_domains as domain
  where domain.id = new.tracking_domain_id;

  if domain_company_id is null or domain_company_id <> target_company_id then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking domain must belong to the same company.';
  end if;

  select
    membership.company_id,
    membership.user_id,
    membership.role,
    membership.status
  into
    owner_company_id,
    owner_user_id,
    owner_role,
    owner_status
  from public.company_memberships as membership
  where membership.id = new.owner_membership_id;

  if owner_company_id is null
    or owner_company_id <> target_company_id
    or owner_role not in ('manager', 'publisher')
    or (not archive_only_transition and owner_status <> 'active')
  then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking-link owner must be a valid Manager or Publisher in the same company and must be active except for archive-only cleanup.';
  end if;

  if not actor_can_manage_all
    and (actor_user_id is null or actor_user_id <> owner_user_id)
  then
    raise exception
      using
        errcode = '42501',
        message = 'Managers and Publishers can modify only their own tracking links.';
  end if;

  if new.status = 'active'::public.tracking_link_status then
    if offer_status <> 'active'::public.offer_status then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active offer.';
    end if;

    if domain_status <> 'active'::public.tracking_domain_status then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active verified tracking domain.';
    end if;

    if owner_status <> 'active'::public.company_membership_status then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active owner membership.';
    end if;

    if not exists (
      select 1
      from public.offer_assignments as assignment
      where assignment.company_id = target_company_id
        and assignment.offer_id = new.offer_id
        and assignment.membership_id = new.owner_membership_id
        and assignment.status = 'active'
    ) then
      raise exception
        using
          errcode = '23514',
          message = 'An active tracking link requires an active offer assignment for its owner.';
    end if;
  end if;

  new.updated_by := actor_user_id;

  return new;
end;
$function$;

drop trigger if exists tracking_links_enforce_write_rules
on public.tracking_links;

create trigger tracking_links_enforce_write_rules
before insert or update or delete
on public.tracking_links
for each row
execute function private.enforce_tracking_link_write_rules();

drop policy if exists tracking_links_delete_authorized
on public.tracking_links;

create policy tracking_links_delete_authorized
on public.tracking_links
for delete
to authenticated
using (
  status = 'archived'::public.tracking_link_status
  and source = 'manual'::public.tracking_link_source
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

grant delete
on public.tracking_links
to authenticated;

revoke all
on function private.enforce_tracking_link_write_rules()
from public, anon, authenticated;

commit;
