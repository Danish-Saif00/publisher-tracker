begin;

create table public.network_provider_integration_configurations (
  provider_id uuid primary key,
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  default_tracking_parameter text,
  postback_click_id_token text,
  postback_conversion_id_token text,
  postback_revenue_amount_token text,
  postback_revenue_currency_token text,
  postback_conversion_status public.conversion_status not null default 'approved',
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  updated_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint network_provider_integration_company_provider_unique
    unique (company_id, provider_id),

  constraint network_provider_integration_company_provider_fk
    foreign key (company_id, provider_id)
    references public.network_providers (company_id, id)
    on delete cascade,

  constraint network_provider_integration_tracking_parameter_check
    check (
      default_tracking_parameter is null
      or (
        char_length(btrim(default_tracking_parameter)) between 1 and 120
        and default_tracking_parameter ~ '^[A-Za-z0-9_.-]+$'
      )
    ),

  constraint network_provider_integration_click_token_check
    check (
      postback_click_id_token is null
      or (
        char_length(btrim(postback_click_id_token)) between 1 and 240
        and postback_click_id_token !~ '[[:cntrl:]&=#?]'
      )
    ),

  constraint network_provider_integration_conversion_token_check
    check (
      postback_conversion_id_token is null
      or (
        char_length(btrim(postback_conversion_id_token)) between 1 and 240
        and postback_conversion_id_token !~ '[[:cntrl:]&=#?]'
      )
    ),

  constraint network_provider_integration_revenue_amount_token_check
    check (
      postback_revenue_amount_token is null
      or (
        char_length(btrim(postback_revenue_amount_token)) between 1 and 240
        and postback_revenue_amount_token !~ '[[:cntrl:]&=#?]'
      )
    ),

  constraint network_provider_integration_revenue_currency_token_check
    check (
      postback_revenue_currency_token is null
      or (
        char_length(btrim(postback_revenue_currency_token)) between 1 and 240
        and postback_revenue_currency_token !~ '[[:cntrl:]&=#?]'
      )
    ),

  constraint network_provider_integration_revenue_pair_check
    check (
      (postback_revenue_amount_token is null)
      = (postback_revenue_currency_token is null)
    ),

  constraint network_provider_integration_initial_status_check
    check (postback_conversion_status in ('pending', 'approved'))
);

create index network_provider_integration_company_updated_at_idx
  on public.network_provider_integration_configurations (
    company_id,
    updated_at desc,
    provider_id
  );

create or replace function private.resolve_effective_tracking_parameter(
  target_company_id uuid,
  target_network_account_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (
      select coalesce(
        nullif(btrim(network_configuration.tracking_parameter), ''),
        nullif(btrim(provider_configuration.default_tracking_parameter), ''),
        'click_id'
      )
      from public.network_accounts as account
      left join public.network_account_operational_configurations
        as network_configuration
        on network_configuration.network_account_id = account.id
       and network_configuration.company_id = account.company_id
      left join public.network_provider_integration_configurations
        as provider_configuration
        on provider_configuration.provider_id = account.provider_id
       and provider_configuration.company_id = account.company_id
      where account.id = target_network_account_id
        and account.company_id = target_company_id
      limit 1
    ),
    'click_id'
  );
$function$;

create trigger network_provider_integration_set_updated_at
before update on public.network_provider_integration_configurations
for each row
execute function private.set_updated_at();

create trigger aaa_reject_platform_admin_write
before insert or update or delete
on public.network_provider_integration_configurations
for each row
execute function private.reject_platform_super_admin_operational_write();

alter table public.network_provider_integration_configurations enable row level security;

create policy network_provider_integration_select_company
on public.network_provider_integration_configurations
for select
to authenticated
using (
  private.has_tenant_company_role(
    company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  )
);

create policy network_provider_integration_insert_company_admin
on public.network_provider_integration_configurations
for insert
to authenticated
with check (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy network_provider_integration_update_company_admin
on public.network_provider_integration_configurations
for update
to authenticated
using (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  company_id = private.current_company_id()
  and private.has_tenant_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

revoke all on table public.network_provider_integration_configurations
from public, anon;

grant select, insert, update
on table public.network_provider_integration_configurations
to authenticated;

grant select, insert, update, delete
on table public.network_provider_integration_configurations
to service_role;

revoke all on function private.resolve_effective_tracking_parameter(
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function private.resolve_effective_tracking_parameter(
  uuid,
  uuid
) to service_role;

commit;
