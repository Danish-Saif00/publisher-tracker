begin;

create type public.visitor_identity_source as enum (
  'new_cookie',
  'existing_cookie',
  'renewed_cookie'
);

create or replace function private.tracking_click_attribution_valid(
  target_attribution jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select
    jsonb_typeof(target_attribution) = 'object'
    and (
      select count(*) <= 20
      from jsonb_each(target_attribution)
    )
    and not exists (
      select 1
      from jsonb_each(target_attribution) as parameter(key, value)
      where char_length(parameter.key) not between 1 and 64
        or parameter.key !~ '^[A-Za-z0-9_.-]+$'
        or jsonb_typeof(parameter.value) <> 'string'
        or char_length(parameter.value #>> '{}') > 500
        or parameter.value #>> '{}' ~ '[[:cntrl:]]'
    );
$function$;

create table public.tracking_clicks (
  id uuid primary key default gen_random_uuid(),
  public_click_id text not null,
  company_id uuid not null
    references public.companies (id)
    on delete restrict,
  tracking_link_id uuid not null
    references public.tracking_links (id)
    on delete restrict,
  offer_id uuid not null
    references public.offers (id)
    on delete restrict,
  network_account_id uuid not null
    references public.network_accounts (id)
    on delete restrict,
  network_provider_id uuid not null
    references public.network_providers (id)
    on delete restrict,
  tracking_domain_id uuid not null
    references public.tracking_domains (id)
    on delete restrict,
  owner_membership_id uuid not null
    references public.company_memberships (id)
    on delete restrict,
  owner_user_id uuid not null,
  offer_assignment_id uuid not null
    references public.offer_assignments (id)
    on delete restrict,
  visitor_id uuid not null,
  visitor_identity_source public.visitor_identity_source not null,
  ip_hash text not null,
  user_agent text,
  user_agent_hash text not null,
  visitor_fingerprint text not null,
  referrer_url text,
  referrer_hostname text,
  request_hostname text not null,
  request_path text not null,
  attribution jsonb not null default '{}'::jsonb,
  tracking_link_snapshot jsonb not null,
  offer_snapshot jsonb not null,
  network_snapshot jsonb not null,
  domain_snapshot jsonb not null,
  owner_snapshot jsonb not null,
  assignment_snapshot jsonb not null,
  captured_at timestamptz not null default now(),

  constraint tracking_clicks_public_click_id_unique
    unique (public_click_id),

  constraint tracking_clicks_public_click_id_check
    check (
      public_click_id = lower(public_click_id)
      and public_click_id ~ '^clk_[a-f0-9]{32}$'
    ),

  constraint tracking_clicks_hashes_check
    check (
      ip_hash ~ '^[a-f0-9]{64}$'
      and user_agent_hash ~ '^[a-f0-9]{64}$'
      and visitor_fingerprint ~ '^[a-f0-9]{64}$'
    ),

  constraint tracking_clicks_user_agent_check
    check (
      user_agent is null
      or (
        char_length(user_agent) between 1 and 1024
        and user_agent !~ '[[:cntrl:]]'
      )
    ),

  constraint tracking_clicks_referrer_url_check
    check (
      referrer_url is null
      or (
        char_length(referrer_url) between 8 and 2048
        and referrer_url ~* '^https?://'
        and referrer_url !~ '[[:cntrl:]]'
      )
    ),

  constraint tracking_clicks_referrer_hostname_check
    check (
      referrer_hostname is null
      or (
        referrer_hostname = lower(referrer_hostname)
        and char_length(referrer_hostname) between 1 and 253
        and referrer_hostname !~ '[[:cntrl:]]'
      )
    ),

  constraint tracking_clicks_referrer_pair_check
    check (
      (referrer_url is null) = (referrer_hostname is null)
    ),

  constraint tracking_clicks_request_hostname_check
    check (
      request_hostname = lower(request_hostname)
      and char_length(request_hostname) between 1 and 253
      and request_hostname !~ '[[:cntrl:]]'
    ),

  constraint tracking_clicks_request_path_check
    check (
      char_length(request_path) between 1 and 1024
      and left(request_path, 1) = '/'
      and request_path !~ '[[:cntrl:]]'
    ),

  constraint tracking_clicks_attribution_check
    check (
      private.tracking_click_attribution_valid(attribution)
    ),

  constraint tracking_clicks_snapshot_shapes_check
    check (
      jsonb_typeof(tracking_link_snapshot) = 'object'
      and jsonb_typeof(offer_snapshot) = 'object'
      and jsonb_typeof(network_snapshot) = 'object'
      and jsonb_typeof(domain_snapshot) = 'object'
      and jsonb_typeof(owner_snapshot) = 'object'
      and jsonb_typeof(assignment_snapshot) = 'object'
    )
);

create index tracking_clicks_company_captured_at_idx
  on public.tracking_clicks (
    company_id,
    captured_at desc,
    id desc
  );

create index tracking_clicks_link_captured_at_idx
  on public.tracking_clicks (
    tracking_link_id,
    captured_at desc,
    id desc
  );

create index tracking_clicks_offer_owner_captured_at_idx
  on public.tracking_clicks (
    offer_id,
    owner_membership_id,
    captured_at desc,
    id desc
  );

create index tracking_clicks_network_account_captured_at_idx
  on public.tracking_clicks (
    network_account_id,
    captured_at desc,
    id desc
  );

create index tracking_clicks_visitor_captured_at_idx
  on public.tracking_clicks (
    visitor_id,
    captured_at desc,
    id desc
  );

create index tracking_clicks_ip_hash_captured_at_idx
  on public.tracking_clicks (
    ip_hash,
    captured_at desc,
    id desc
  );

create index tracking_clicks_fingerprint_captured_at_idx
  on public.tracking_clicks (
    visitor_fingerprint,
    captured_at desc,
    id desc
  );

create or replace function private.prevent_tracking_click_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception
    using
      errcode = '42501',
      message = 'Captured tracking clicks are immutable.';
end;
$function$;

create trigger tracking_clicks_prevent_mutation
before update or delete
on public.tracking_clicks
for each row
execute function private.prevent_tracking_click_mutation();

create or replace function private.can_view_tracking_click(
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
    private.is_platform_super_admin()
    or private.has_company_role(
      target_company_id,
      array[
        'company_admin',
        'manager'
      ]::public.company_role[]
    )
    or exists (
      select 1
      from public.company_memberships as membership
      inner join public.companies as company
        on company.id = membership.company_id
      where membership.id = target_owner_membership_id
        and membership.company_id = target_company_id
        and membership.user_id = private.current_actor_user_id()
        and membership.role = 'publisher'
        and membership.status = 'active'
        and company.status = 'active'
    );
$function$;

alter table public.tracking_clicks
  enable row level security;

create policy tracking_clicks_select_authorized
on public.tracking_clicks
for select
to authenticated
using (
  private.can_view_tracking_click(
    company_id,
    owner_membership_id
  )
);

drop function public.resolve_public_tracking_link(text, text);

create or replace function public.capture_public_tracking_click(
  target_hostname text,
  target_public_token text,
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
  captured_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_hostname text;
  normalized_public_token text;
  resolved record;
  inserted_click_id uuid;
  inserted_captured_at timestamptz;
begin
  normalized_hostname := lower(btrim(target_hostname, '.'));
  normalized_public_token := lower(btrim(target_public_token));

  if normalized_hostname is null
    or char_length(normalized_hostname) not between 1 and 253
    or normalized_hostname ~ '[[:cntrl:]]'
    or position('/' in normalized_hostname) > 0
    or position(':' in normalized_hostname) > 0
    or position(chr(92) in normalized_hostname) > 0
    or normalized_public_token is null
    or char_length(normalized_public_token) not between 2 and 80
    or normalized_public_token !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  then
    return;
  end if;

  if target_public_click_id is null
    or target_public_click_id !~ '^clk_[a-f0-9]{32}$'
    or target_visitor_id is null
    or target_visitor_identity_source is null
    or target_ip_hash is null
    or target_ip_hash !~ '^[a-f0-9]{64}$'
    or target_user_agent_hash is null
    or target_user_agent_hash !~ '^[a-f0-9]{64}$'
    or target_visitor_fingerprint is null
    or target_visitor_fingerprint !~ '^[a-f0-9]{64}$'
    or target_request_path is null
    or char_length(target_request_path) not between 1 and 1024
    or left(target_request_path, 1) <> '/'
    or target_request_path ~ '[[:cntrl:]]'
    or target_attribution is null
    or not private.tracking_click_attribution_valid(target_attribution)
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click capture input is invalid.';
  end if;

  if target_user_agent is not null
    and (
      char_length(target_user_agent) not between 1 and 1024
      or target_user_agent ~ '[[:cntrl:]]'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click user agent is invalid.';
  end if;

  if target_referrer_url is not null
    and (
      char_length(target_referrer_url) not between 8 and 2048
      or target_referrer_url !~* '^https?://'
      or target_referrer_url ~ '[[:cntrl:]]'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click referrer URL is invalid.';
  end if;

  if target_referrer_hostname is not null
    and (
      char_length(target_referrer_hostname) not between 1 and 253
      or target_referrer_hostname <> lower(target_referrer_hostname)
      or target_referrer_hostname ~ '[[:cntrl:]]'
    )
  then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click referrer hostname is invalid.';
  end if;

  if (target_referrer_url is null) <> (target_referrer_hostname is null) then
    raise exception
      using
        errcode = '22023',
        message = 'Tracking-click referrer URL and hostname must be provided together.';
  end if;

  select
    link.id as tracking_link_id,
    link.company_id,
    link.offer_id,
    link.tracking_domain_id,
    link.owner_membership_id,
    link.tracking_code,
    link.custom_slug,
    link.destination_url as link_destination_url,
    link.query_parameters,
    link.status as tracking_link_status,

    offer.code as offer_code,
    offer.external_offer_id,
    offer.name as offer_name,
    offer.destination_url as offer_destination_url,
    offer.status as offer_status,
    offer.network_account_id,

    domain.hostname,
    domain.status as domain_status,

    membership.user_id as owner_user_id,
    membership.role as owner_role,
    membership.status as owner_membership_status,

    assignment.id as offer_assignment_id,
    assignment.status as assignment_status,

    account.provider_id as network_provider_id,
    account.name as network_account_name,
    account.external_account_id,
    account.status as network_account_status,

    provider.code as network_provider_code,
    provider.name as network_provider_name,
    provider.status as network_provider_status
  into resolved
  from public.tracking_links as link
  inner join public.tracking_domains as domain
    on domain.id = link.tracking_domain_id
  inner join public.offers as offer
    on offer.id = link.offer_id
  inner join public.company_memberships as membership
    on membership.id = link.owner_membership_id
  inner join public.offer_assignments as assignment
    on assignment.company_id = link.company_id
    and assignment.offer_id = link.offer_id
    and assignment.membership_id = link.owner_membership_id
  inner join public.companies as company
    on company.id = link.company_id
  inner join public.network_accounts as account
    on account.id = offer.network_account_id
    and account.company_id = link.company_id
  inner join public.network_providers as provider
    on provider.id = account.provider_id
  where lower(domain.hostname) = normalized_hostname
    and (
      link.tracking_code = normalized_public_token
      or link.custom_slug = normalized_public_token
    )
    and link.status = 'active'
    and domain.status = 'active'
    and offer.status = 'active'
    and membership.status = 'active'
    and membership.role in ('manager', 'publisher')
    and assignment.status = 'active'
    and company.status = 'active'
    and account.status = 'active'
    and provider.status = 'active'
  order by
    case
      when link.custom_slug = normalized_public_token then 0
      else 1
    end,
    link.id
  limit 1
  for share of
    link,
    domain,
    offer,
    membership,
    assignment,
    company,
    account,
    provider;

  if not found then
    return;
  end if;

  insert into public.tracking_clicks as click (
    public_click_id,
    company_id,
    tracking_link_id,
    offer_id,
    network_account_id,
    network_provider_id,
    tracking_domain_id,
    owner_membership_id,
    owner_user_id,
    offer_assignment_id,
    visitor_id,
    visitor_identity_source,
    ip_hash,
    user_agent,
    user_agent_hash,
    visitor_fingerprint,
    referrer_url,
    referrer_hostname,
    request_hostname,
    request_path,
    attribution,
    tracking_link_snapshot,
    offer_snapshot,
    network_snapshot,
    domain_snapshot,
    owner_snapshot,
    assignment_snapshot
  )
  values (
    target_public_click_id,
    resolved.company_id,
    resolved.tracking_link_id,
    resolved.offer_id,
    resolved.network_account_id,
    resolved.network_provider_id,
    resolved.tracking_domain_id,
    resolved.owner_membership_id,
    resolved.owner_user_id,
    resolved.offer_assignment_id,
    target_visitor_id,
    target_visitor_identity_source,
    target_ip_hash,
    target_user_agent,
    target_user_agent_hash,
    target_visitor_fingerprint,
    target_referrer_url,
    target_referrer_hostname,
    normalized_hostname,
    target_request_path,
    target_attribution,
    jsonb_build_object(
      'id', resolved.tracking_link_id,
      'trackingCode', resolved.tracking_code,
      'customSlug', resolved.custom_slug,
      'destinationUrl', resolved.link_destination_url,
      'queryParameters', resolved.query_parameters,
      'status', resolved.tracking_link_status
    ),
    jsonb_build_object(
      'id', resolved.offer_id,
      'code', resolved.offer_code,
      'externalOfferId', resolved.external_offer_id,
      'name', resolved.offer_name,
      'destinationUrl', resolved.offer_destination_url,
      'status', resolved.offer_status
    ),
    jsonb_build_object(
      'accountId', resolved.network_account_id,
      'accountName', resolved.network_account_name,
      'externalAccountId', resolved.external_account_id,
      'accountStatus', resolved.network_account_status,
      'providerId', resolved.network_provider_id,
      'providerCode', resolved.network_provider_code,
      'providerName', resolved.network_provider_name,
      'providerStatus', resolved.network_provider_status
    ),
    jsonb_build_object(
      'id', resolved.tracking_domain_id,
      'hostname', resolved.hostname,
      'status', resolved.domain_status
    ),
    jsonb_build_object(
      'membershipId', resolved.owner_membership_id,
      'userId', resolved.owner_user_id,
      'role', resolved.owner_role,
      'membershipStatus', resolved.owner_membership_status
    ),
    jsonb_build_object(
      'id', resolved.offer_assignment_id,
      'status', resolved.assignment_status
    )
  )
  returning
    click.id,
    click.captured_at
  into
    inserted_click_id,
    inserted_captured_at;

  return query
  select
    inserted_click_id,
    target_public_click_id,
    resolved.tracking_link_id,
    resolved.company_id,
    resolved.offer_id,
    resolved.network_account_id,
    resolved.tracking_domain_id,
    resolved.owner_membership_id,
    resolved.link_destination_url,
    resolved.query_parameters,
    inserted_captured_at;
end;
$function$;

revoke all
on public.tracking_clicks
from anon, authenticated;

grant select
on public.tracking_clicks
to authenticated;

grant all
on public.tracking_clicks
to service_role;

revoke all
on function private.tracking_click_attribution_valid(jsonb),
   private.prevent_tracking_click_mutation(),
   private.can_view_tracking_click(uuid, uuid),
   public.capture_public_tracking_click(
     text,
     text,
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
   )
from public;

grant execute
on function private.can_view_tracking_click(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.capture_public_tracking_click(
  text,
  text,
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
)
to anon, authenticated, service_role;

commit;