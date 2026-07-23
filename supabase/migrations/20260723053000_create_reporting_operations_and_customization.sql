begin;

create type public.company_smtp_secure_mode as enum (
  'plain',
  'starttls',
  'tls'
);

create type public.company_smtp_configuration_status as enum (
  'active',
  'disabled'
);

create type public.company_smtp_test_status as enum (
  'pending',
  'sent',
  'failed'
);

create table public.company_customizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  brand_name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  support_email text,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_customizations_company_unique
    unique (company_id),

  constraint company_customizations_brand_name_check
    check (
      brand_name is null
      or char_length(btrim(brand_name)) between 2 and 160
    ),

  constraint company_customizations_logo_url_check
    check (
      logo_url is null
      or (
        char_length(btrim(logo_url)) between 8 and 2048
        and logo_url ~* '^https?://'
      )
    ),

  constraint company_customizations_primary_color_check
    check (
      primary_color is null
      or primary_color ~ '^#[A-Fa-f0-9]{6}$'
    ),

  constraint company_customizations_secondary_color_check
    check (
      secondary_color is null
      or secondary_color ~ '^#[A-Fa-f0-9]{6}$'
    ),

  constraint company_customizations_support_email_check
    check (
      support_email is null
      or (
        char_length(btrim(support_email)) between 3 and 320
        and support_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    )
);

create table public.company_smtp_configurations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  host text not null,
  port integer not null,
  secure_mode public.company_smtp_secure_mode not null,
  username text not null,
  encrypted_password text not null,
  password_iv text not null,
  password_auth_tag text not null,
  sender_email text not null,
  sender_name text not null,
  reply_to_email text,
  status public.company_smtp_configuration_status not null default 'active',
  password_updated_at timestamptz not null default now(),
  last_tested_at timestamptz,
  last_test_status public.company_smtp_test_status,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_smtp_configurations_company_unique
    unique (company_id),

  constraint company_smtp_configurations_host_check
    check (
      char_length(btrim(host)) between 1 and 253
      and host !~ '[[:space:]/\\]'
      and host !~ '[[:cntrl:]]'
    ),

  constraint company_smtp_configurations_port_check
    check (
      port between 1 and 65535
    ),

  constraint company_smtp_configurations_username_check
    check (
      char_length(btrim(username)) between 1 and 320
      and username !~ '[[:cntrl:]]'
    ),

  constraint company_smtp_configurations_ciphertext_check
    check (
      char_length(encrypted_password) between 4 and 8192
      and encrypted_password ~ '^[A-Za-z0-9+/]+={0,2}$'
      and password_iv ~ '^[A-Za-z0-9+/]+={0,2}$'
      and password_auth_tag ~ '^[A-Za-z0-9+/]+={0,2}$'
    ),

  constraint company_smtp_configurations_sender_email_check
    check (
      char_length(btrim(sender_email)) between 3 and 320
      and sender_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  constraint company_smtp_configurations_sender_name_check
    check (
      char_length(btrim(sender_name)) between 1 and 160
      and sender_name !~ '[[:cntrl:]]'
    ),

  constraint company_smtp_configurations_reply_to_email_check
    check (
      reply_to_email is null
      or (
        char_length(btrim(reply_to_email)) between 3 and 320
        and reply_to_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),

  constraint company_smtp_configurations_test_pair_check
    check (
      (last_tested_at is null) = (last_test_status is null)
    )
);

create table public.company_smtp_test_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  smtp_configuration_id uuid not null
    references public.company_smtp_configurations (id)
    on delete cascade,
  recipient_email text not null,
  status public.company_smtp_test_status not null default 'pending',
  error_code text,
  requested_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint company_smtp_test_events_recipient_email_check
    check (
      char_length(btrim(recipient_email)) between 3 and 320
      and recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  constraint company_smtp_test_events_error_code_check
    check (
      error_code is null
      or (
        char_length(btrim(error_code)) between 1 and 120
        and error_code ~ '^[A-Z0-9_]+$'
      )
    ),

  constraint company_smtp_test_events_completion_check
    check (
      (
        status = 'pending'
        and completed_at is null
        and error_code is null
      )
      or (
        status = 'sent'
        and completed_at is not null
        and error_code is null
      )
      or (
        status = 'failed'
        and completed_at is not null
        and error_code is not null
      )
    )
);

create trigger company_customizations_set_updated_at
before update on public.company_customizations
for each row
execute function private.set_updated_at();

create trigger company_smtp_configurations_set_updated_at
before update on public.company_smtp_configurations
for each row
execute function private.set_updated_at();

create index company_smtp_test_events_company_requested_at_idx
  on public.company_smtp_test_events (
    company_id,
    requested_at desc,
    id desc
  );

create index tracking_clicks_company_network_captured_at_idx
  on public.tracking_clicks (
    company_id,
    network_account_id,
    captured_at desc,
    id desc
  );

create index tracking_clicks_company_owner_captured_at_idx
  on public.tracking_clicks (
    company_id,
    owner_membership_id,
    captured_at desc,
    id desc
  );

create index conversions_company_network_converted_at_idx
  on public.conversions (
    company_id,
    network_account_id,
    converted_at desc,
    id desc
  );

create or replace function private.can_read_company_operations(
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
        'manager',
        'publisher'
      ]::public.company_role[]
    );
$function$;

create or replace function private.can_manage_company_configuration(
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
      array['company_admin']::public.company_role[]
    );
$function$;

alter table public.company_customizations enable row level security;
alter table public.company_smtp_configurations enable row level security;
alter table public.company_smtp_test_events enable row level security;

create policy company_customizations_select_authorized
on public.company_customizations
for select
to authenticated
using (
  private.can_read_company_operations(company_id)
);

create policy company_customizations_insert_authorized
on public.company_customizations
for insert
to authenticated
with check (
  private.can_manage_company_configuration(company_id)
);

create policy company_customizations_update_authorized
on public.company_customizations
for update
to authenticated
using (
  private.can_manage_company_configuration(company_id)
)
with check (
  private.can_manage_company_configuration(company_id)
);

create policy company_smtp_configurations_select_authorized
on public.company_smtp_configurations
for select
to authenticated
using (
  private.can_manage_company_configuration(company_id)
);

create policy company_smtp_configurations_insert_authorized
on public.company_smtp_configurations
for insert
to authenticated
with check (
  private.can_manage_company_configuration(company_id)
);

create policy company_smtp_configurations_update_authorized
on public.company_smtp_configurations
for update
to authenticated
using (
  private.can_manage_company_configuration(company_id)
)
with check (
  private.can_manage_company_configuration(company_id)
);

create policy company_smtp_test_events_select_authorized
on public.company_smtp_test_events
for select
to authenticated
using (
  private.can_manage_company_configuration(company_id)
);

create policy company_smtp_test_events_insert_authorized
on public.company_smtp_test_events
for insert
to authenticated
with check (
  private.can_manage_company_configuration(company_id)
);

create policy company_smtp_test_events_update_authorized
on public.company_smtp_test_events
for update
to authenticated
using (
  private.can_manage_company_configuration(company_id)
)
with check (
  private.can_manage_company_configuration(company_id)
);


create or replace function public.get_company_reporting_dashboard(
  target_company_id uuid,
  target_from timestamptz,
  target_to timestamptz,
  target_offer_id uuid default null,
  target_network_account_id uuid default null,
  target_owner_membership_id uuid default null,
  target_owner_user_id uuid default null
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  with scoped_clicks as (
    select click.*
    from public.tracking_clicks as click
    where click.company_id = target_company_id
      and click.captured_at >= target_from
      and click.captured_at < target_to
      and (
        target_offer_id is null
        or click.offer_id = target_offer_id
      )
      and (
        target_network_account_id is null
        or click.network_account_id = target_network_account_id
      )
      and (
        target_owner_membership_id is null
        or click.owner_membership_id = target_owner_membership_id
      )
      and (
        target_owner_user_id is null
        or click.owner_user_id = target_owner_user_id
      )
  ),
  scoped_conversions as (
    select conversion.*
    from public.conversions as conversion
    where conversion.company_id = target_company_id
      and conversion.converted_at >= target_from
      and conversion.converted_at < target_to
      and (
        target_offer_id is null
        or conversion.offer_id = target_offer_id
      )
      and (
        target_network_account_id is null
        or conversion.network_account_id = target_network_account_id
      )
      and (
        target_owner_membership_id is null
        or conversion.owner_membership_id = target_owner_membership_id
      )
      and (
        target_owner_user_id is null
        or conversion.owner_user_id = target_owner_user_id
      )
  ),
  conversion_money as (
    select
      conversion.offer_id,
      conversion.network_account_id,
      conversion.owner_membership_id,
      conversion.revenue_currency as currency,
      conversion.revenue_amount_minor as revenue_amount_minor,
      0::bigint as payout_amount_minor
    from scoped_conversions as conversion
    where conversion.revenue_currency is not null
      and conversion.revenue_amount_minor is not null

    union all

    select
      conversion.offer_id,
      conversion.network_account_id,
      conversion.owner_membership_id,
      conversion.payout_currency as currency,
      0::bigint as revenue_amount_minor,
      conversion.payout_amount_minor
    from scoped_conversions as conversion
  ),
  offer_dimensions as (
    select click.offer_id as id
    from scoped_clicks as click
    union
    select conversion.offer_id
    from scoped_conversions as conversion
  ),
  network_dimensions as (
    select click.network_account_id as id
    from scoped_clicks as click
    union
    select conversion.network_account_id
    from scoped_conversions as conversion
  ),
  member_dimensions as (
    select click.owner_membership_id as id
    from scoped_clicks as click
    union
    select conversion.owner_membership_id
    from scoped_conversions as conversion
  )
  select jsonb_build_object(
    'companyId',
    target_company_id,
    'period',
    jsonb_build_object(
      'from',
      target_from,
      'to',
      target_to
    ),
    'totals',
    jsonb_build_object(
      'clicks',
      (
        select count(*)
        from scoped_clicks
      ),
      'uniqueVisitors',
      (
        select count(distinct visitor_id)
        from scoped_clicks
      ),
      'duplicateClicks',
      (
        select count(*)
        from scoped_clicks
        where duplicate_decision = 'duplicate'
      ),
      'highRiskClicks',
      (
        select count(*)
        from scoped_clicks
        where fraud_risk_level = 'high'
      ),
      'conversions',
      (
        select count(*)
        from scoped_conversions
      ),
      'approvedConversions',
      (
        select count(*)
        from scoped_conversions
        where status = 'approved'
      ),
      'monetaryTotals',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'currency',
              money.currency,
              'revenueAmountMinor',
              money.revenue_amount_minor,
              'payoutAmountMinor',
              money.payout_amount_minor
            )
            order by money.currency
          ),
          '[]'::jsonb
        )
        from (
          select
            currency,
            sum(revenue_amount_minor) as revenue_amount_minor,
            sum(payout_amount_minor) as payout_amount_minor
          from conversion_money
          group by currency
        ) as money
      )
    ),
    'offers',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'dimensionId',
            dimension.id,
            'dimensionName',
            offer.name,
            'clicks',
            (
              select count(*)
              from scoped_clicks as click
              where click.offer_id = dimension.id
            ),
            'conversions',
            (
              select count(*)
              from scoped_conversions as conversion
              where conversion.offer_id = dimension.id
            ),
            'approvedConversions',
            (
              select count(*)
              from scoped_conversions as conversion
              where conversion.offer_id = dimension.id
                and conversion.status = 'approved'
            ),
            'monetaryTotals',
            (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'currency',
                    money.currency,
                    'revenueAmountMinor',
                    money.revenue_amount_minor,
                    'payoutAmountMinor',
                    money.payout_amount_minor
                  )
                  order by money.currency
                ),
                '[]'::jsonb
              )
              from (
                select
                  currency,
                  sum(revenue_amount_minor) as revenue_amount_minor,
                  sum(payout_amount_minor) as payout_amount_minor
                from conversion_money
                where offer_id = dimension.id
                group by currency
              ) as money
            )
          )
          order by offer.name, dimension.id
        ),
        '[]'::jsonb
      )
      from offer_dimensions as dimension
      inner join public.offers as offer
        on offer.id = dimension.id
    ),
    'networkAccounts',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'dimensionId',
            dimension.id,
            'dimensionName',
            account.name,
            'clicks',
            (
              select count(*)
              from scoped_clicks as click
              where click.network_account_id = dimension.id
            ),
            'conversions',
            (
              select count(*)
              from scoped_conversions as conversion
              where conversion.network_account_id = dimension.id
            ),
            'approvedConversions',
            (
              select count(*)
              from scoped_conversions as conversion
              where conversion.network_account_id = dimension.id
                and conversion.status = 'approved'
            ),
            'monetaryTotals',
            (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'currency',
                    money.currency,
                    'revenueAmountMinor',
                    money.revenue_amount_minor,
                    'payoutAmountMinor',
                    money.payout_amount_minor
                  )
                  order by money.currency
                ),
                '[]'::jsonb
              )
              from (
                select
                  currency,
                  sum(revenue_amount_minor) as revenue_amount_minor,
                  sum(payout_amount_minor) as payout_amount_minor
                from conversion_money
                where network_account_id = dimension.id
                group by currency
              ) as money
            )
          )
          order by account.name, dimension.id
        ),
        '[]'::jsonb
      )
      from network_dimensions as dimension
      inner join public.network_accounts as account
        on account.id = dimension.id
    ),
    'members',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'dimensionId',
            dimension.id,
            'dimensionName',
            coalesce(profile.display_name, membership.user_id::text),
            'clicks',
            (
              select count(*)
              from scoped_clicks as click
              where click.owner_membership_id = dimension.id
            ),
            'conversions',
            (
              select count(*)
              from scoped_conversions as conversion
              where conversion.owner_membership_id = dimension.id
            ),
            'approvedConversions',
            (
              select count(*)
              from scoped_conversions as conversion
              where conversion.owner_membership_id = dimension.id
                and conversion.status = 'approved'
            ),
            'monetaryTotals',
            (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'currency',
                    money.currency,
                    'revenueAmountMinor',
                    money.revenue_amount_minor,
                    'payoutAmountMinor',
                    money.payout_amount_minor
                  )
                  order by money.currency
                ),
                '[]'::jsonb
              )
              from (
                select
                  currency,
                  sum(revenue_amount_minor) as revenue_amount_minor,
                  sum(payout_amount_minor) as payout_amount_minor
                from conversion_money
                where owner_membership_id = dimension.id
                group by currency
              ) as money
            )
          )
          order by coalesce(profile.display_name, membership.user_id::text), dimension.id
        ),
        '[]'::jsonb
      )
      from member_dimensions as dimension
      inner join public.company_memberships as membership
        on membership.id = dimension.id
      left join public.user_profiles as profile
        on profile.user_id = membership.user_id
    )
  );
$function$;

revoke all
on public.company_customizations,
   public.company_smtp_configurations,
   public.company_smtp_test_events
from anon, authenticated;

grant select, insert, update
on public.company_customizations,
   public.company_smtp_configurations,
   public.company_smtp_test_events
to authenticated;

grant all
on public.company_customizations,
   public.company_smtp_configurations,
   public.company_smtp_test_events
to service_role;

revoke all
on function private.can_read_company_operations(uuid),
   private.can_manage_company_configuration(uuid),
   public.get_company_reporting_dashboard(
     uuid,
     timestamptz,
     timestamptz,
     uuid,
     uuid,
     uuid,
     uuid
   )
from public;

grant execute
on function private.can_read_company_operations(uuid),
   private.can_manage_company_configuration(uuid),
   public.get_company_reporting_dashboard(
     uuid,
     timestamptz,
     timestamptz,
     uuid,
     uuid,
     uuid,
     uuid
   )
to authenticated, service_role;

commit;
