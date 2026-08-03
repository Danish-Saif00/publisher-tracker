begin;

alter type public.tracking_link_source
  add value if not exists 'manager_assignment';

commit;

begin;

-- Publisher Tracker Offer-owned tracking-link governance.
-- Direct tracking-link writes are Company Admin-only. Manager and Publisher
-- links are generated and synchronized by controlled security-definer functions.

drop index if exists public.tracking_links_publisher_assignment_identity_unique;

create unique index if not exists tracking_links_assignment_identity_unique
  on public.tracking_links (
    company_id,
    offer_id,
    owner_membership_id
  )
  where source in (
    'manager_assignment'::public.tracking_link_source,
    'publisher_assignment'::public.tracking_link_source
  );

create or replace function private.can_view_tracking_link(
  target_company_id uuid,
  target_owner_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    private.has_tenant_company_role(
      target_company_id,
      array['company_admin']::public.company_role[]
    )
    or exists (
      select 1
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.id = target_owner_membership_id
        and membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.role in ('manager', 'publisher')
        and membership.status = 'active'
        and company.status = 'active'
        and private.has_tenant_company_role(
          target_company_id,
          array['manager', 'publisher']::public.company_role[]
        )
    );
$function$;

create or replace function private.can_write_tracking_link(
  target_company_id uuid,
  target_owner_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.has_tenant_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );
$function$;

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
  owner_role public.company_role;
  owner_status public.company_membership_status;
  actor_can_manage_all boolean;
  system_write boolean;
  archive_only_transition boolean := false;
begin
  actor_user_id := private.current_actor_user_id();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;
  system_write := coalesce(
    current_setting('app.tracking_link_system_write', true),
    'false'
  ) = 'true';

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

  if not actor_can_manage_all and not system_write then
    raise exception
      using
        errcode = '42501',
        message = 'Only an active Company Admin can create or modify tracking links.';
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
        (old.status = 'draft' and new.status in ('active', 'paused', 'archived'))
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
    membership.role,
    membership.status
  into
    owner_company_id,
    owner_role,
    owner_status
  from public.company_memberships as membership
  where membership.id = new.owner_membership_id;

  if owner_company_id is null
    or owner_company_id <> target_company_id
    or owner_role not in ('manager', 'publisher')
    or (
      new.status = 'active'::public.tracking_link_status
      and owner_status <> 'active'::public.company_membership_status
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking-link owner must be a valid Manager or Publisher in the same company.';
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

create or replace function private.ensure_offer_assignment_tracking_link(
  target_company_id uuid,
  target_offer_id uuid,
  target_membership_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  original_system_write_setting text;
  target_role public.company_role;
  target_membership_status public.company_membership_status;
  target_assignment_status public.offer_assignment_status;
  target_manager_membership_id uuid;
  parent_manager_assignment_status public.offer_assignment_status;
  target_offer_status public.offer_status;
  target_company_status public.company_status;
  target_tracking_domain_id uuid;
  target_domain_status public.tracking_domain_status;
  target_destination_url text;
  target_source public.tracking_link_source;
  desired_status public.tracking_link_status;
  existing_link_id uuid;
  existing_link_status public.tracking_link_status;
  resolved_link_id uuid;
begin
  original_system_write_setting := current_setting(
    'app.tracking_link_system_write',
    true
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_company_id::text || ':' || target_offer_id::text || ':' ||
      target_membership_id::text,
      0
    )
  );

  select
    membership.role,
    membership.status,
    assignment.status,
    assignment.manager_membership_id,
    offer.status,
    company.status,
    configuration.tracking_domain_id,
    domain.status,
    offer.destination_url
  into
    target_role,
    target_membership_status,
    target_assignment_status,
    target_manager_membership_id,
    target_offer_status,
    target_company_status,
    target_tracking_domain_id,
    target_domain_status,
    target_destination_url
  from public.company_memberships as membership
  inner join public.offer_assignments as assignment
    on assignment.company_id = membership.company_id
   and assignment.membership_id = membership.id
   and assignment.offer_id = target_offer_id
  inner join public.offers as offer
    on offer.id = assignment.offer_id
   and offer.company_id = assignment.company_id
  inner join public.companies as company
    on company.id = offer.company_id
  left join public.offer_operational_configurations as configuration
    on configuration.offer_id = offer.id
   and configuration.company_id = offer.company_id
  left join public.tracking_domains as domain
    on domain.id = configuration.tracking_domain_id
   and domain.company_id = offer.company_id
  where membership.id = target_membership_id
    and membership.company_id = target_company_id
    and membership.role in ('manager', 'publisher')
  limit 1;

  if target_role is null then
    return null;
  end if;

  target_source := case target_role
    when 'manager' then 'manager_assignment'::public.tracking_link_source
    else 'publisher_assignment'::public.tracking_link_source
  end;

  if target_role = 'publisher' and target_manager_membership_id is not null then
    select assignment.status
    into parent_manager_assignment_status
    from public.offer_assignments as assignment
    where assignment.company_id = target_company_id
      and assignment.offer_id = target_offer_id
      and assignment.membership_id = target_manager_membership_id
      and assignment.manager_membership_id is null
    limit 1;
  end if;

  select link.id, link.status
  into existing_link_id, existing_link_status
  from public.tracking_links as link
  where link.company_id = target_company_id
    and link.offer_id = target_offer_id
    and link.owner_membership_id = target_membership_id
    and link.source = target_source
  order by link.updated_at desc, link.id desc
  limit 1
  for update;

  if existing_link_status = 'archived'::public.tracking_link_status then
    return existing_link_id;
  end if;

  desired_status := case
    when target_offer_status = 'archived'::public.offer_status
      then 'archived'::public.tracking_link_status
    when target_company_status <> 'active'::public.company_status
      or target_membership_status <> 'active'::public.company_membership_status
      or target_assignment_status <> 'active'::public.offer_assignment_status
      or target_tracking_domain_id is null
      or target_domain_status <> 'active'::public.tracking_domain_status
      or (
        target_role = 'publisher'
        and (
          target_manager_membership_id is null
          or parent_manager_assignment_status is distinct from
            'active'::public.offer_assignment_status
        )
      )
      then 'paused'::public.tracking_link_status
    when target_offer_status = 'active'::public.offer_status
      then 'active'::public.tracking_link_status
    when existing_link_id is null
      then 'draft'::public.tracking_link_status
    when existing_link_status = 'draft'::public.tracking_link_status
      then 'draft'::public.tracking_link_status
    else 'paused'::public.tracking_link_status
  end;

  if existing_link_id is null and (
    target_tracking_domain_id is null
    or target_destination_url is null
    or desired_status = 'paused'::public.tracking_link_status
  ) then
    return null;
  end if;

  perform set_config('app.tracking_link_system_write', 'true', true);

  if existing_link_id is null then
    insert into public.tracking_links (
      company_id,
      offer_id,
      tracking_domain_id,
      owner_membership_id,
      tracking_code,
      custom_slug,
      destination_url,
      query_parameters,
      source,
      status,
      created_by,
      updated_by
    )
    values (
      target_company_id,
      target_offer_id,
      target_tracking_domain_id,
      target_membership_id,
      substr(
        md5(
          target_company_id::text || ':' || target_offer_id::text || ':' ||
          target_membership_id::text || ':' || clock_timestamp()::text || ':' ||
          random()::text
        ),
        1,
        16
      ),
      null,
      target_destination_url,
      '{}'::jsonb,
      target_source,
      desired_status,
      private.current_actor_user_id(),
      private.current_actor_user_id()
    )
    returning id into resolved_link_id;

    insert into public.audit_events (
      company_id,
      actor_user_id,
      request_id,
      event_name,
      entity_type,
      entity_id,
      metadata
    )
    values (
      target_company_id,
      private.current_actor_user_id(),
      private.current_request_id(),
      'tracking_link.assignment_generated',
      'tracking_link',
      resolved_link_id::text,
      jsonb_build_object(
        'offerId', target_offer_id,
        'ownerMembershipId', target_membership_id,
        'ownerRole', target_role,
        'source', target_source,
        'status', desired_status
      )
    );
  else
    update public.tracking_links
    set
      tracking_domain_id = case
        when desired_status = 'archived'::public.tracking_link_status
          then tracking_domain_id
        else coalesce(target_tracking_domain_id, tracking_domain_id)
      end,
      destination_url = case
        when desired_status = 'archived'::public.tracking_link_status
          then destination_url
        else coalesce(target_destination_url, destination_url)
      end,
      status = desired_status
    where id = existing_link_id
    returning id into resolved_link_id;
  end if;

  perform set_config(
    'app.tracking_link_system_write',
    coalesce(original_system_write_setting, ''),
    true
  );

  return resolved_link_id;
exception
  when others then
    perform set_config(
      'app.tracking_link_system_write',
      coalesce(original_system_write_setting, ''),
      true
    );
    raise;
end;
$function$;

create or replace function private.ensure_publisher_offer_tracking_link(
  target_company_id uuid,
  target_offer_id uuid,
  target_publisher_membership_id uuid
)
returns uuid
language sql
security definer
set search_path = pg_catalog
as $function$
  select private.ensure_offer_assignment_tracking_link(
    target_company_id,
    target_offer_id,
    target_publisher_membership_id
  );
$function$;

create or replace function private.sync_tracking_link_from_offer_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  publisher_assignment record;
begin
  perform private.ensure_offer_assignment_tracking_link(
    new.company_id,
    new.offer_id,
    new.membership_id
  );

  if new.manager_membership_id is null then
    for publisher_assignment in
      select assignment.membership_id
      from public.offer_assignments as assignment
      where assignment.company_id = new.company_id
        and assignment.offer_id = new.offer_id
        and assignment.manager_membership_id = new.membership_id
    loop
      perform private.ensure_offer_assignment_tracking_link(
        new.company_id,
        new.offer_id,
        publisher_assignment.membership_id
      );
    end loop;
  end if;

  return new;
end;
$function$;

drop trigger if exists offer_assignments_provision_publisher_tracking_link
on public.offer_assignments;

drop trigger if exists offer_assignments_sync_assignment_tracking_link
on public.offer_assignments;

create trigger offer_assignments_sync_assignment_tracking_link
after insert or update
on public.offer_assignments
for each row
execute function private.sync_tracking_link_from_offer_assignment();

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

  target_offer_id := case
    when tg_table_name = 'offers' then new.id
    else new.offer_id
  end;

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

drop trigger if exists offers_provision_publisher_tracking_links_on_activation
on public.offers;

drop trigger if exists offers_sync_assignment_tracking_links
on public.offers;

create trigger offers_sync_assignment_tracking_links
after update of status, destination_url
on public.offers
for each row
execute function private.sync_offer_assignment_tracking_links();

drop trigger if exists offer_configurations_sync_publisher_tracking_links
on public.offer_operational_configurations;

drop trigger if exists offer_configurations_sync_assignment_tracking_links
on public.offer_operational_configurations;

create trigger offer_configurations_sync_assignment_tracking_links
after insert or update of tracking_domain_id
on public.offer_operational_configurations
for each row
execute function private.sync_offer_assignment_tracking_links();

create or replace function private.sync_offer_assignment_tracking_links_for_offer(
  target_company_id uuid,
  target_offer_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  assignment_record record;
begin
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
end;
$function$;

-- Recreate the domain trigger function after its helper is available.
create or replace function private.sync_tracking_links_from_domain_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  offer_record record;
begin
  for offer_record in
    select configuration.company_id, configuration.offer_id
    from public.offer_operational_configurations as configuration
    where configuration.tracking_domain_id = new.id
  loop
    perform private.sync_offer_assignment_tracking_links_for_offer(
      offer_record.company_id,
      offer_record.offer_id
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists tracking_domains_sync_assignment_tracking_links
on public.tracking_domains;

create trigger tracking_domains_sync_assignment_tracking_links
after update of status
on public.tracking_domains
for each row
execute function private.sync_tracking_links_from_domain_status();

create or replace function private.sync_tracking_links_from_membership_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  assignment_record record;
begin
  if new.role not in ('manager', 'publisher') then
    return new;
  end if;

  for assignment_record in
    select distinct assignment.offer_id, assignment.membership_id
    from public.offer_assignments as assignment
    where assignment.company_id = new.company_id
      and (
        assignment.membership_id = new.id
        or assignment.manager_membership_id = new.id
      )
  loop
    perform private.ensure_offer_assignment_tracking_link(
      new.company_id,
      assignment_record.offer_id,
      assignment_record.membership_id
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists company_memberships_sync_assignment_tracking_links
on public.company_memberships;

create trigger company_memberships_sync_assignment_tracking_links
after update of status
on public.company_memberships
for each row
execute function private.sync_tracking_links_from_membership_status();

do $block$
declare
  assignment_record record;
begin
  for assignment_record in
    select
      assignment.company_id,
      assignment.offer_id,
      assignment.membership_id
    from public.offer_assignments as assignment
    inner join public.company_memberships as membership
      on membership.id = assignment.membership_id
     and membership.company_id = assignment.company_id
     and membership.role in ('manager', 'publisher')
    where assignment.status = 'active'
  loop
    perform private.ensure_offer_assignment_tracking_link(
      assignment_record.company_id,
      assignment_record.offer_id,
      assignment_record.membership_id
    );
  end loop;
end;
$block$;

revoke all
on function private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid)
from public;

grant execute
on function private.can_view_tracking_link(uuid, uuid),
   private.can_write_tracking_link(uuid, uuid)
to authenticated, service_role;

revoke all
on function private.enforce_tracking_link_write_rules(),
   private.ensure_offer_assignment_tracking_link(uuid, uuid, uuid),
   private.ensure_publisher_offer_tracking_link(uuid, uuid, uuid),
   private.sync_tracking_link_from_offer_assignment(),
   private.sync_offer_assignment_tracking_links(),
   private.sync_offer_assignment_tracking_links_for_offer(uuid, uuid),
   private.sync_tracking_links_from_domain_status(),
   private.sync_tracking_links_from_membership_status()
from public, anon, authenticated;

comment on function private.ensure_offer_assignment_tracking_link(uuid, uuid, uuid) is
  'Creates or synchronizes one immutable assignment-owned tracking token for an active Manager or Publisher Offer assignment.';

comment on column public.tracking_links.source is
  'Immutable origin. Manual links are Company Admin-managed; Manager and Publisher assignment links are system-generated.';

commit;
