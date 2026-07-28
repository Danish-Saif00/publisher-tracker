begin;

alter table public.offer_operational_configurations
  add column if not exists promotional_text_template text;

update public.offer_operational_configurations
set promotional_text_template =
  '%OFFER_NAME% - available in %COUNTRIES% for %DEVICES%. Use this link: %TRACKING_LINK%'
where promotional_text_template is null
   or btrim(promotional_text_template) = '';

alter table public.offer_operational_configurations
  alter column promotional_text_template set default
    '%OFFER_NAME% - available in %COUNTRIES% for %DEVICES%. Use this link: %TRACKING_LINK%',
  alter column promotional_text_template set not null;

alter table public.offer_operational_configurations
  drop constraint if exists offer_operational_configurations_promotional_text_template_check;

alter table public.offer_operational_configurations
  add constraint offer_operational_configurations_promotional_text_template_check
  check (
    char_length(btrim(promotional_text_template)) between 1 and 2000
    and position('%TRACKING_LINK%' in promotional_text_template) > 0
  );

create or replace function private.ensure_publisher_offer_tracking_link(
  target_company_id uuid,
  target_offer_id uuid,
  target_publisher_membership_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  original_actor_setting text;
  publisher_user_id uuid;
  target_tracking_domain_id uuid;
  target_destination_url text;
  existing_link_id uuid;
  existing_link_status public.tracking_link_status;
  resolved_link_id uuid;
begin
  original_actor_setting := current_setting('app.current_actor_user_id', true);

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_company_id::text || ':' || target_offer_id::text || ':' ||
      target_publisher_membership_id::text,
      0
    )
  );

  select
    publisher.user_id,
    configuration.tracking_domain_id,
    offer.destination_url
  into
    publisher_user_id,
    target_tracking_domain_id,
    target_destination_url
  from public.company_memberships as publisher
  inner join public.offer_assignments as publisher_assignment
    on publisher_assignment.company_id = publisher.company_id
   and publisher_assignment.membership_id = publisher.id
   and publisher_assignment.offer_id = target_offer_id
   and publisher_assignment.manager_membership_id is not null
   and publisher_assignment.status = 'active'
  inner join public.offer_assignments as manager_assignment
    on manager_assignment.company_id = publisher_assignment.company_id
   and manager_assignment.offer_id = publisher_assignment.offer_id
   and manager_assignment.membership_id =
     publisher_assignment.manager_membership_id
   and manager_assignment.manager_membership_id is null
   and manager_assignment.status = 'active'
  inner join public.offers as offer
    on offer.id = publisher_assignment.offer_id
   and offer.company_id = publisher_assignment.company_id
   and offer.status <> 'archived'
  inner join public.offer_operational_configurations as configuration
    on configuration.offer_id = offer.id
   and configuration.company_id = offer.company_id
  inner join public.tracking_domains as domain
    on domain.id = configuration.tracking_domain_id
   and domain.company_id = offer.company_id
   and domain.status = 'active'
  inner join public.companies as company
    on company.id = offer.company_id
   and company.status = 'active'
  where publisher.id = target_publisher_membership_id
    and publisher.company_id = target_company_id
    and publisher.role = 'publisher'
    and publisher.status = 'active'
  limit 1;

  if publisher_user_id is null
    or target_tracking_domain_id is null
    or target_destination_url is null
  then
    return null;
  end if;

  select
    link.id,
    link.status
  into
    existing_link_id,
    existing_link_status
  from public.tracking_links as link
  where link.company_id = target_company_id
    and link.offer_id = target_offer_id
    and link.owner_membership_id = target_publisher_membership_id
    and link.status <> 'archived'
    and link.custom_slug is null
  order by link.updated_at desc, link.id desc
  limit 1
  for update;

  perform set_config(
    'app.current_actor_user_id',
    publisher_user_id::text,
    true
  );

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
      status,
      created_by,
      updated_by
    )
    values (
      target_company_id,
      target_offer_id,
      target_tracking_domain_id,
      target_publisher_membership_id,
      md5(
        target_company_id::text || ':' || target_offer_id::text || ':' ||
        target_publisher_membership_id::text || ':' ||
        clock_timestamp()::text || ':' || random()::text
      ),
      null,
      target_destination_url,
      '{}'::jsonb,
      'active'::public.tracking_link_status,
      publisher_user_id,
      publisher_user_id
    )
    returning id into resolved_link_id;
  else
    update public.tracking_links
    set
      tracking_domain_id = target_tracking_domain_id,
      destination_url = target_destination_url,
      status = case
        when existing_link_status in ('draft', 'paused')
          then 'active'::public.tracking_link_status
        else existing_link_status
      end,
      updated_by = publisher_user_id
    where id = existing_link_id
    returning id into resolved_link_id;
  end if;

  perform set_config(
    'app.current_actor_user_id',
    coalesce(original_actor_setting, ''),
    true
  );

  return resolved_link_id;
exception
  when others then
    perform set_config(
      'app.current_actor_user_id',
      coalesce(original_actor_setting, ''),
      true
    );
    raise;
end;
$function$;

create or replace function private.provision_publisher_tracking_link_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_role public.company_role;
begin
  select membership.role
  into target_role
  from public.company_memberships as membership
  where membership.id = new.membership_id
    and membership.company_id = new.company_id;

  if target_role = 'publisher'
    and new.manager_membership_id is not null
    and new.status = 'active'
  then
    perform private.ensure_publisher_offer_tracking_link(
      new.company_id,
      new.offer_id,
      new.membership_id
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists offer_assignments_provision_publisher_tracking_link
on public.offer_assignments;

create trigger offer_assignments_provision_publisher_tracking_link
after insert or update of status, manager_membership_id
on public.offer_assignments
for each row
execute function private.provision_publisher_tracking_link_from_assignment();

create or replace function private.sync_offer_publisher_tracking_links()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  publisher_assignment record;
begin
  for publisher_assignment in
    select assignment.membership_id
    from public.offer_assignments as assignment
    inner join public.company_memberships as membership
      on membership.id = assignment.membership_id
     and membership.company_id = assignment.company_id
     and membership.role = 'publisher'
     and membership.status = 'active'
    where assignment.company_id = new.company_id
      and assignment.offer_id = new.offer_id
      and assignment.manager_membership_id is not null
      and assignment.status = 'active'
  loop
    perform private.ensure_publisher_offer_tracking_link(
      new.company_id,
      new.offer_id,
      publisher_assignment.membership_id
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists offer_configurations_sync_publisher_tracking_links
on public.offer_operational_configurations;

create trigger offer_configurations_sync_publisher_tracking_links
after insert or update of
  tracking_domain_id,
  desktop_url,
  android_url,
  ios_url
on public.offer_operational_configurations
for each row
execute function private.sync_offer_publisher_tracking_links();

do $block$
declare
  publisher_assignment record;
begin
  for publisher_assignment in
    select
      assignment.company_id,
      assignment.offer_id,
      assignment.membership_id
    from public.offer_assignments as assignment
    inner join public.company_memberships as membership
      on membership.id = assignment.membership_id
     and membership.company_id = assignment.company_id
     and membership.role = 'publisher'
     and membership.status = 'active'
    where assignment.manager_membership_id is not null
      and assignment.status = 'active'
  loop
    perform private.ensure_publisher_offer_tracking_link(
      publisher_assignment.company_id,
      publisher_assignment.offer_id,
      publisher_assignment.membership_id
    );
  end loop;
end;
$block$;

revoke all on function private.ensure_publisher_offer_tracking_link(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

revoke all on function private.provision_publisher_tracking_link_from_assignment()
from public, anon, authenticated;

revoke all on function private.sync_offer_publisher_tracking_links()
from public, anon, authenticated;

comment on column public.offer_operational_configurations.promotional_text_template is
  'Percentage-wrapped Offer copy template resolved for each Publisher assignment.';

commit;
