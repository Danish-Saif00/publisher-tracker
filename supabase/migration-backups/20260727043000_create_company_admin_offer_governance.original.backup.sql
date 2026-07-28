begin;

create sequence public.offer_public_id_seq as bigint start with 1000 increment by 1;

alter table public.offers
  add column public_id bigint;

update public.offers
set public_id = nextval('public.offer_public_id_seq')
where public_id is null;

alter sequence public.offer_public_id_seq
  owned by public.offers.public_id;

alter table public.offers
  alter column public_id set default nextval('public.offer_public_id_seq'),
  alter column public_id set not null;

alter table public.offers
  add constraint offers_public_id_unique unique (public_id);

create sequence public.membership_public_id_seq as bigint start with 1000 increment by 1;

alter table public.company_memberships
  add column public_id bigint;

update public.company_memberships
set public_id = nextval('public.membership_public_id_seq')
where public_id is null;

alter sequence public.membership_public_id_seq
  owned by public.company_memberships.public_id;

alter table public.company_memberships
  alter column public_id set default nextval('public.membership_public_id_seq'),
  alter column public_id set not null;

alter table public.company_memberships
  add constraint company_memberships_public_id_unique unique (public_id);

alter table public.offer_assignments
  add column manager_membership_id uuid;

alter table public.offer_assignments
  add constraint offer_assignments_company_manager_fk
  foreign key (company_id, manager_membership_id)
  references public.company_memberships (company_id, id)
  on delete cascade;

alter table public.offer_assignments
  add constraint offer_assignments_manager_target_check
  check (
    manager_membership_id is null
    or manager_membership_id <> membership_id
  );

create index offer_assignments_manager_offer_status_idx
  on public.offer_assignments (
    manager_membership_id,
    offer_id,
    status,
    updated_at desc
  )
  where manager_membership_id is not null;

create or replace function private.enforce_tracking_domain_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_is_platform_admin boolean;
  target_company_id uuid;
begin
  actor_is_platform_admin := private.is_platform_super_admin();

  if tg_op = 'INSERT' then
    target_company_id := new.company_id;

    if not actor_is_platform_admin
      and not private.has_company_role(
        target_company_id,
        array['company_admin']::public.company_role[]
      )
    then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin or Company Admin can create tracking domains.';
    end if;

    if new.status <> 'pending_verification'
      or new.verified_at is not null
      or new.is_primary
    then
      raise exception
        using
          errcode = '23514',
          message = 'A new tracking domain must begin pending verification.';
    end if;
  else
    target_company_id := old.company_id;

    if not actor_is_platform_admin
      and not private.has_company_role(
        target_company_id,
        array['company_admin']::public.company_role[]
      )
    then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin or Company Admin can update tracking domains.';
    end if;

    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Tracking domain identity and creation fields are immutable.';
    end if;

    if old.status = 'archived'
      and (
        new.hostname is distinct from old.hostname
        or new.status is distinct from old.status
        or new.verification_token is distinct from old.verification_token
        or new.verified_at is distinct from old.verified_at
        or new.is_primary is distinct from old.is_primary
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'An archived tracking domain is immutable.';
    end if;

    if not actor_is_platform_admin then
      if new.status = 'active'
        and old.status <> 'active'
        and not (
          old.status = 'suspended'
          and old.verified_at is not null
          and new.verified_at is not distinct from old.verified_at
          and new.hostname is not distinct from old.hostname
        )
      then
        raise exception
          using
            errcode = '42501',
            message = 'Only a Platform Super Admin can verify a pending tracking domain.';
      end if;

      if new.verified_at is distinct from old.verified_at
      then
        raise exception
          using
            errcode = '42501',
            message = 'Only a Platform Super Admin can change tracking-domain verification time.';
      end if;

      if new.verification_token is distinct from old.verification_token
        and new.hostname is not distinct from old.hostname
      then
        raise exception
          using
            errcode = '42501',
            message = 'A tracking-domain verification token can only change with its hostname.';
      end if;

      if new.hostname is distinct from old.hostname
        and (
          new.status <> 'pending_verification'
          or new.verified_at is not null
          or new.is_primary
        )
      then
        raise exception
          using
            errcode = '23514',
            message = 'Changing a hostname must reset tracking-domain verification.';
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from public.companies as company
    where company.id = target_company_id
      and (
        actor_is_platform_admin
        or company.status = 'active'
      )
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'The tracking domain requires an accessible company.';
  end if;

  new.updated_by := private.current_actor_user_id();

  return new;
end;
$function$;

create or replace function private.enforce_offer_assignment_write_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id uuid;
  actor_is_platform_admin boolean;
  actor_is_company_admin boolean;
  actor_manager_membership_id uuid;
  target_company_id uuid;
  offer_company_id uuid;
  offer_status public.offer_status;
  membership_company_id uuid;
  membership_role public.company_role;
  membership_status public.company_membership_status;
  manager_company_id uuid;
  manager_role public.company_role;
  manager_status public.company_membership_status;
  profile_mode public.payout_mode;
begin
  actor_user_id := private.current_actor_user_id();
  actor_is_platform_admin := private.is_platform_super_admin();
  target_company_id := case when tg_op = 'INSERT' then new.company_id else old.company_id end;
  actor_is_company_admin := private.has_company_role(
    target_company_id,
    array['company_admin']::public.company_role[]
  );

  select membership.id
  into actor_manager_membership_id
  from public.company_memberships as membership
  where membership.company_id = target_company_id
    and membership.user_id = actor_user_id
    and membership.role = 'manager'
    and membership.status = 'active'
  limit 1;

  if not actor_is_platform_admin
    and not actor_is_company_admin
    and actor_manager_membership_id is null
  then
    raise exception
      using
        errcode = '42501',
        message = 'Only a Platform Super Admin, Company Admin, or assigned Manager can modify offer assignments.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.offer_id is distinct from old.offer_id
      or new.membership_id is distinct from old.membership_id
      or new.manager_membership_id is distinct from old.manager_membership_id
      or new.assigned_by is distinct from old.assigned_by
      or new.created_at is distinct from old.created_at
    then
      raise exception
        using
          errcode = '42501',
          message = 'Offer assignment identity, hierarchy, and creation fields are immutable.';
    end if;

    if old.status = 'revoked'
      and new.status = 'revoked'
      and (
        new.manual_payout_amount_minor is distinct from old.manual_payout_amount_minor
        or new.manual_payout_currency is distinct from old.manual_payout_currency
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'A revoked offer assignment cannot be edited without reactivation.';
    end if;

    if new.status is distinct from old.status
      and not (
        (old.status = 'active' and new.status in ('paused', 'revoked'))
        or (old.status = 'paused' and new.status in ('active', 'revoked'))
        or (old.status = 'revoked' and new.status = 'active')
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'The requested offer-assignment status transition is invalid.';
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
        message = 'Offer assignments require an active company.';
  end if;

  select offer.company_id, offer.status
  into offer_company_id, offer_status
  from public.offers as offer
  where offer.id = new.offer_id;

  if offer_company_id is null
    or offer_company_id <> target_company_id
    or offer_status = 'archived'
  then
    raise exception
      using
        errcode = '23514',
        message = 'The assignment requires a non-archived offer from the same company.';
  end if;

  select membership.company_id, membership.role, membership.status
  into membership_company_id, membership_role, membership_status
  from public.company_memberships as membership
  where membership.id = new.membership_id;

  if membership_company_id is null
    or membership_company_id <> target_company_id
    or membership_role not in ('manager', 'publisher')
    or membership_status <> 'active'
  then
    raise exception
      using
        errcode = '23514',
        message = 'The assignment requires an active Manager or Publisher membership from the same company.';
  end if;

  if membership_role = 'manager' then
    if new.manager_membership_id is not null then
      raise exception
        using
          errcode = '23514',
          message = 'A Manager offer assignment cannot have a parent Manager.';
    end if;

    if not actor_is_platform_admin and not actor_is_company_admin then
      raise exception
        using
          errcode = '42501',
          message = 'Only a Platform Super Admin or Company Admin can assign offers to Managers.';
    end if;
  else
    if new.manager_membership_id is null then
      raise exception
        using
          errcode = '23514',
          message = 'A Publisher offer assignment requires its assigning Manager.';
    end if;

    select membership.company_id, membership.role, membership.status
    into manager_company_id, manager_role, manager_status
    from public.company_memberships as membership
    where membership.id = new.manager_membership_id;

    if manager_company_id is null
      or manager_company_id <> target_company_id
      or manager_role <> 'manager'
      or manager_status <> 'active'
      or not exists (
        select 1
        from public.offer_assignments as manager_assignment
        where manager_assignment.company_id = target_company_id
          and manager_assignment.offer_id = new.offer_id
          and manager_assignment.membership_id = new.manager_membership_id
          and manager_assignment.manager_membership_id is null
          and manager_assignment.status = 'active'
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'A Publisher can only receive an offer from an active Manager assigned to that offer.';
    end if;

    if actor_manager_membership_id is distinct from new.manager_membership_id
    then
      raise exception
        using
          errcode = '42501',
          message = 'Only the assigned Manager can assign or manage this Offer for a Publisher.';
    end if;

    select profile.mode
    into profile_mode
    from public.member_payout_profiles as profile
    where profile.membership_id = new.membership_id
      and profile.company_id = target_company_id;

    if profile_mode is null then
      raise exception
        using
          errcode = '23514',
          message = 'A Publisher assignment requires a member payout profile.';
    end if;

    if new.status <> 'revoked'
      and profile_mode = 'per_offer'
      and (
        new.manual_payout_amount_minor is null
        or new.manual_payout_currency is null
      )
    then
      raise exception
        using
          errcode = '23514',
          message = 'per_offer mode requires a manual payout on every open Publisher assignment.';
    end if;
  end if;

  new.updated_by := actor_user_id;

  return new;
end;
$function$;

drop policy if exists offer_assignments_insert_company_admin
on public.offer_assignments;

create policy offer_assignments_insert_authorized
on public.offer_assignments
for insert
to authenticated
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin', 'manager']::public.company_role[]
  )
);

drop policy if exists offer_assignments_update_company_admin
on public.offer_assignments;

create policy offer_assignments_update_authorized
on public.offer_assignments
for update
to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin', 'manager']::public.company_role[]
  )
)
with check (
  private.is_platform_super_admin()
  or private.has_company_role(
    company_id,
    array['company_admin', 'manager']::public.company_role[]
  )
);

create or replace function public.capture_reference_tracking_click(
  target_hostname text,
  target_publisher_public_id bigint,
  target_offer_public_id bigint,
  target_public_click_id text,
  target_visitor_id uuid,
  target_visitor_identity_source public.visitor_identity_source,
  target_ip_hash text,
  target_user_agent text,
  target_user_agent_hash text,
  target_visitor_fingerprint text,
  target_referrer_url text,
  target_referrer_hostname text,
  target_request_path text,
  target_attribution jsonb
)
returns table (
  tracking_click_id uuid,
  public_click_id text,
  tracking_link_id uuid,
  company_id uuid,
  offer_id uuid,
  network_account_id uuid,
  tracking_domain_id uuid,
  owner_membership_id uuid,
  destination_url text,
  query_parameters jsonb,
  duplicate_decision public.duplicate_decision,
  fraud_risk_level public.fraud_risk_level,
  fraud_signals text[],
  attribution_eligible boolean,
  captured_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  resolved_tracking_code text;
begin
  select link.tracking_code
  into resolved_tracking_code
  from public.tracking_links as link
  inner join public.tracking_domains as domain
    on domain.id = link.tracking_domain_id
  inner join public.offers as offer
    on offer.id = link.offer_id
  inner join public.company_memberships as publisher
    on publisher.id = link.owner_membership_id
  inner join public.offer_assignments as publisher_assignment
    on publisher_assignment.offer_id = offer.id
   and publisher_assignment.membership_id = publisher.id
  inner join public.offer_assignments as manager_assignment
    on manager_assignment.offer_id = offer.id
   and manager_assignment.membership_id = publisher_assignment.manager_membership_id
   and manager_assignment.manager_membership_id is null
  inner join public.companies as company
    on company.id = link.company_id
  left join public.company_subscriptions as subscription
    on subscription.company_id = company.id
  where domain.hostname = lower(btrim(target_hostname))
    and publisher.public_id = target_publisher_public_id
    and publisher.role = 'publisher'
    and publisher.status = 'active'
    and offer.public_id = target_offer_public_id
    and offer.status = 'active'
    and link.status = 'active'
    and domain.status = 'active'
    and publisher_assignment.status = 'active'
    and manager_assignment.status = 'active'
    and company.status = 'active'
    and subscription.status = 'active'
    and subscription.starts_at <= now()
    and (subscription.ends_at is null or subscription.ends_at > now())
  order by link.updated_at desc, link.id desc
  limit 1;

  if resolved_tracking_code is null then
    return;
  end if;

  return query
  select *
  from public.capture_public_tracking_click(
    target_hostname,
    resolved_tracking_code,
    target_public_click_id,
    target_visitor_id,
    target_visitor_identity_source,
    target_ip_hash,
    target_user_agent,
    target_user_agent_hash,
    target_visitor_fingerprint,
    target_referrer_url,
    target_referrer_hostname,
    target_request_path,
    target_attribution
  );
end;
$function$;

revoke all on function public.capture_reference_tracking_click(
  text,
  bigint,
  bigint,
  text,
  uuid,
  public.visitor_identity_source,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.capture_reference_tracking_click(
  text,
  bigint,
  bigint,
  text,
  uuid,
  public.visitor_identity_source,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

commit;
