begin;

create or replace function private.catalog_country_codes_valid(input_values text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select
    coalesce(
      (
        select bool_and(
          item = upper(btrim(item))
          and item ~ '^[A-Z]{2}$'
        )
        from unnest(input_values) as item
      ),
      true
    )
    and cardinality(input_values) = (
      select count(distinct item)
      from unnest(input_values) as item
    );
$function$;

create or replace function private.catalog_text_array_unique(input_values text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select cardinality(input_values) = (
    select count(distinct item)
    from unnest(input_values) as item
  );
$function$;

create or replace function private.catalog_smallint_array_unique(input_values smallint[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select cardinality(input_values) = (
    select count(distinct item)
    from unnest(input_values) as item
  );
$function$;

create or replace function private.can_manage_publisher_configuration(
  target_company_id uuid
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
    );
$function$;

create unique index if not exists offers_company_id_id_unique
  on public.offers (company_id, id);

create unique index if not exists tracking_domains_company_id_id_unique
  on public.tracking_domains (company_id, id);

create unique index if not exists network_accounts_company_id_id_unique
  on public.network_accounts (company_id, id);

create unique index if not exists company_memberships_company_id_id_unique
  on public.company_memberships (company_id, id);

alter table public.offers
  add constraint offers_company_network_account_fk
  foreign key (company_id, network_account_id)
  references public.network_accounts (company_id, id)
  on delete restrict;

alter table public.offer_assignments
  add constraint offer_assignments_company_offer_fk
  foreign key (company_id, offer_id)
  references public.offers (company_id, id)
  on delete cascade;

alter table public.offer_assignments
  add constraint offer_assignments_company_membership_fk
  foreign key (company_id, membership_id)
  references public.company_memberships (company_id, id)
  on delete cascade;

alter table public.member_payout_profiles
  add constraint member_payout_profiles_company_membership_fk
  foreign key (company_id, membership_id)
  references public.company_memberships (company_id, id)
  on delete cascade;

create table public.offer_operational_configurations (
  offer_id uuid primary key,
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  tracking_domain_id uuid,
  countries text[] not null default array[]::text[],
  devices text[] not null default array['desktop']::text[],
  desktop_url text,
  android_url text,
  ios_url text,
  redirect_type text not null default '302',
  referrer_mode text not null default 'preserve',
  default_payout_amount_minor integer,
  payout_currency text,
  timezone text not null default 'UTC',
  active_days smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[],
  active_start_time time,
  active_end_time time,
  proxy_enabled boolean not null default false,
  expires_at timestamptz,
  duplicate_allowed boolean not null default false,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint offer_operational_configurations_company_offer_unique
    unique (company_id, offer_id),

  constraint offer_operational_configurations_company_offer_fk
    foreign key (company_id, offer_id)
    references public.offers (company_id, id)
    on delete cascade,

  constraint offer_operational_configurations_company_domain_fk
    foreign key (company_id, tracking_domain_id)
    references public.tracking_domains (company_id, id)
    on delete restrict,

  constraint offer_operational_configurations_countries_check
    check (
      cardinality(countries) <= 250
      and private.catalog_country_codes_valid(countries)
    ),

  constraint offer_operational_configurations_devices_check
    check (
      cardinality(devices) between 1 and 3
      and devices <@ array['desktop', 'android', 'ios']::text[]
      and private.catalog_text_array_unique(devices)
    ),

  constraint offer_operational_configurations_desktop_url_check
    check (
      desktop_url is null
      or (
        char_length(btrim(desktop_url)) between 8 and 2048
        and desktop_url ~* '^https?://'
      )
    ),

  constraint offer_operational_configurations_android_url_check
    check (
      android_url is null
      or (
        char_length(btrim(android_url)) between 8 and 2048
        and android_url ~* '^https?://'
      )
    ),

  constraint offer_operational_configurations_ios_url_check
    check (
      ios_url is null
      or (
        char_length(btrim(ios_url)) between 8 and 2048
        and ios_url ~* '^https?://'
      )
    ),

  constraint offer_operational_configurations_device_url_check
    check (
      (
        not ('desktop' = any(devices))
        or desktop_url is not null
      )
      and (
        not ('android' = any(devices))
        or android_url is not null
      )
      and (
        not ('ios' = any(devices))
        or ios_url is not null
      )
    ),

  constraint offer_operational_configurations_redirect_type_check
    check (redirect_type in ('301', '302')),

  constraint offer_operational_configurations_referrer_mode_check
    check (referrer_mode in ('preserve', 'strip')),

  constraint offer_operational_configurations_payout_check
    check (
      (
        default_payout_amount_minor is null
        and payout_currency is null
      )
      or (
        default_payout_amount_minor between 1 and 2147483647
        and payout_currency ~ '^[A-Z]{3}$'
      )
    ),

  constraint offer_operational_configurations_timezone_check
    check (
      char_length(btrim(timezone)) between 1 and 64
      and timezone !~ '[[:cntrl:]]'
    ),

  constraint offer_operational_configurations_active_days_check
    check (
      cardinality(active_days) between 1 and 7
      and active_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and private.catalog_smallint_array_unique(active_days)
    ),

  constraint offer_operational_configurations_active_time_pair_check
    check (
      (active_start_time is null) = (active_end_time is null)
      and (
        active_start_time is null
        or active_start_time < active_end_time
      )
    )
);

create index offer_operational_configurations_company_domain_idx
  on public.offer_operational_configurations (
    company_id,
    tracking_domain_id,
    updated_at desc
  );

create table public.network_account_operational_configurations (
  network_account_id uuid primary key,
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  tracking_parameter text,
  postback_url text,
  duplicate_allowed boolean not null default false,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint network_account_operational_configurations_company_account_unique
    unique (company_id, network_account_id),

  constraint network_account_operational_configurations_company_account_fk
    foreign key (company_id, network_account_id)
    references public.network_accounts (company_id, id)
    on delete cascade,

  constraint network_account_operational_configurations_tracking_parameter_check
    check (
      tracking_parameter is null
      or (
        char_length(btrim(tracking_parameter)) between 1 and 120
        and tracking_parameter ~ '^[A-Za-z0-9_.-]+$'
      )
    ),

  constraint network_account_operational_configurations_postback_url_check
    check (
      postback_url is null
      or (
        char_length(btrim(postback_url)) between 8 and 2048
        and postback_url ~* '^https?://'
      )
    )
);

create table public.publisher_operational_configurations (
  membership_id uuid primary key,
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  timezone text not null default 'UTC',
  payout_type text not null default 'per_offer',
  postback_url text,
  email_notifications_enabled boolean not null default true,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint publisher_operational_configurations_company_membership_unique
    unique (company_id, membership_id),

  constraint publisher_operational_configurations_company_membership_fk
    foreign key (company_id, membership_id)
    references public.company_memberships (company_id, id)
    on delete cascade,

  constraint publisher_operational_configurations_timezone_check
    check (
      char_length(btrim(timezone)) between 1 and 64
      and timezone !~ '[[:cntrl:]]'
    ),

  constraint publisher_operational_configurations_payout_type_check
    check (payout_type in ('fixed_member', 'per_offer')),

  constraint publisher_operational_configurations_postback_url_check
    check (
      postback_url is null
      or (
        char_length(btrim(postback_url)) between 8 and 2048
        and postback_url ~* '^https?://'
      )
    )
);

create trigger offer_operational_configurations_set_updated_at
before update on public.offer_operational_configurations
for each row
execute function private.set_updated_at();

create trigger network_account_operational_configurations_set_updated_at
before update on public.network_account_operational_configurations
for each row
execute function private.set_updated_at();

create trigger publisher_operational_configurations_set_updated_at
before update on public.publisher_operational_configurations
for each row
execute function private.set_updated_at();

alter table public.offer_operational_configurations enable row level security;
alter table public.network_account_operational_configurations enable row level security;
alter table public.publisher_operational_configurations enable row level security;

create policy offer_operational_configurations_select_authorized
on public.offer_operational_configurations
for select
to authenticated
using (
  private.can_read_company_operations(company_id)
);

create policy offer_operational_configurations_insert_authorized
on public.offer_operational_configurations
for insert
to authenticated
with check (
  private.can_manage_company_configuration(company_id)
);

create policy offer_operational_configurations_update_authorized
on public.offer_operational_configurations
for update
to authenticated
using (
  private.can_manage_company_configuration(company_id)
)
with check (
  private.can_manage_company_configuration(company_id)
);

create policy network_account_operational_configurations_select_authorized
on public.network_account_operational_configurations
for select
to authenticated
using (
  private.can_read_company_operations(company_id)
);

create policy network_account_operational_configurations_insert_authorized
on public.network_account_operational_configurations
for insert
to authenticated
with check (
  private.can_manage_company_configuration(company_id)
);

create policy network_account_operational_configurations_update_authorized
on public.network_account_operational_configurations
for update
to authenticated
using (
  private.can_manage_company_configuration(company_id)
)
with check (
  private.can_manage_company_configuration(company_id)
);

create policy publisher_operational_configurations_select_authorized
on public.publisher_operational_configurations
for select
to authenticated
using (
  private.can_read_company_operations(company_id)
);

create policy publisher_operational_configurations_insert_authorized
on public.publisher_operational_configurations
for insert
to authenticated
with check (
  private.can_manage_publisher_configuration(company_id)
);

create policy publisher_operational_configurations_update_authorized
on public.publisher_operational_configurations
for update
to authenticated
using (
  private.can_manage_publisher_configuration(company_id)
)
with check (
  private.can_manage_publisher_configuration(company_id)
);

revoke all
on public.offer_operational_configurations,
   public.network_account_operational_configurations,
   public.publisher_operational_configurations
from anon, authenticated;

grant select, insert, update
on public.offer_operational_configurations,
   public.network_account_operational_configurations,
   public.publisher_operational_configurations
to authenticated;

grant all
on public.offer_operational_configurations,
   public.network_account_operational_configurations,
   public.publisher_operational_configurations
to service_role;

revoke all
on function private.catalog_country_codes_valid(text[]),
   private.catalog_text_array_unique(text[]),
   private.catalog_smallint_array_unique(smallint[]),
   private.can_manage_publisher_configuration(uuid)
from public;

grant execute
on function private.catalog_country_codes_valid(text[]),
   private.catalog_text_array_unique(text[]),
   private.catalog_smallint_array_unique(smallint[]),
   private.can_manage_publisher_configuration(uuid)
to authenticated, service_role;

comment on table public.offer_operational_configurations is
  'Operational offer targeting, routing, schedule, payout, proxy, and expiry settings.';

comment on table public.network_account_operational_configurations is
  'Tenant network tracking parameter and postback defaults without storing provider credentials.';

comment on table public.publisher_operational_configurations is
  'Publisher timezone, payout mode, postback, and email-notification preferences.';

commit;
