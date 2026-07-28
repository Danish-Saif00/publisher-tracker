begin;

drop function if exists public.get_company_reporting_dashboard(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  uuid
);

create or replace function public.get_company_reporting_dashboard(
  target_company_id uuid,
  target_from timestamptz,
  target_to timestamptz,
  target_offer_id uuid default null,
  target_network_account_id uuid default null,
  target_owner_membership_id uuid default null,
  target_owner_user_id uuid default null,
  target_manager_membership_id uuid default null
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
      and (
        target_manager_membership_id is null
        or (
          exists (
            select 1
            from public.offer_assignments as manager_assignment
            where manager_assignment.company_id = click.company_id
              and manager_assignment.offer_id = click.offer_id
              and manager_assignment.membership_id = target_manager_membership_id
              and manager_assignment.manager_membership_id is null
              and manager_assignment.status = 'active'
          )
          and exists (
            select 1
            from public.offer_assignments as publisher_assignment
            where publisher_assignment.company_id = click.company_id
              and publisher_assignment.offer_id = click.offer_id
              and publisher_assignment.membership_id = click.owner_membership_id
              and publisher_assignment.manager_membership_id =
                target_manager_membership_id
              and publisher_assignment.status = 'active'
          )
        )
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
      and (
        target_manager_membership_id is null
        or (
          exists (
            select 1
            from public.offer_assignments as manager_assignment
            where manager_assignment.company_id = conversion.company_id
              and manager_assignment.offer_id = conversion.offer_id
              and manager_assignment.membership_id = target_manager_membership_id
              and manager_assignment.manager_membership_id is null
              and manager_assignment.status = 'active'
          )
          and exists (
            select 1
            from public.offer_assignments as publisher_assignment
            where publisher_assignment.company_id = conversion.company_id
              and publisher_assignment.offer_id = conversion.offer_id
              and publisher_assignment.membership_id =
                conversion.owner_membership_id
              and publisher_assignment.manager_membership_id =
                target_manager_membership_id
              and publisher_assignment.status = 'active'
          )
        )
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
on function public.get_company_reporting_dashboard(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon;

grant execute
on function public.get_company_reporting_dashboard(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
)
to authenticated, service_role;

commit;
