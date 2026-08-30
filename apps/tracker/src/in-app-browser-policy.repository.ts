import type { DatabaseRuntime } from '@affiliate-tracker/database';
import type {
  InAppBrowserKind,
  InAppBrowserPolicyRecord,
  PublicInAppBrowserPolicyRequest,
  ReferenceInAppBrowserPolicyRequest,
} from './in-app-browser-policy.types.js';
export interface InAppBrowserPolicyRepository {
  readonly findPublicPolicy: (
    input: PublicInAppBrowserPolicyRequest,
  ) => Promise<InAppBrowserPolicyRecord | undefined>;
  readonly findReferencePolicy: (
    input: ReferenceInAppBrowserPolicyRequest,
  ) => Promise<InAppBrowserPolicyRecord | undefined>;
}
interface PolicyRow {
  readonly offer_name: string;
  readonly blocked_in_app_browsers: string[];
}
const SUPPORTED_BROWSERS = new Set<InAppBrowserKind>([
  'snapchat',
  'instagram',
  'facebook',
  'messenger',
  'discord',
  'telegram',
  'tiktok',
  'other',
]);
function mapPolicyRow(row: PolicyRow | undefined): InAppBrowserPolicyRecord | undefined {
  if (row === undefined) {
    return undefined;
  }
  const blockedInAppBrowsers = row.blocked_in_app_browsers.filter(
    (browser): browser is InAppBrowserKind => SUPPORTED_BROWSERS.has(browser as InAppBrowserKind),
  );
  return Object.freeze({
    offerName: row.offer_name,
    blockedInAppBrowsers: Object.freeze(blockedInAppBrowsers),
  });
}
export function createInAppBrowserPolicyRepository(
  database: DatabaseRuntime,
): InAppBrowserPolicyRepository {
  return Object.freeze<InAppBrowserPolicyRepository>({
    async findPublicPolicy(input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<PolicyRow>({
            name: 'tracker-read-public-in-app-browser-policy',
            text: `
              select
                offer.name as offer_name,
                coalesce(
                  customization.blocked_in_app_browsers,
                  array[]::text[]
                ) as blocked_in_app_browsers
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
              left join public.company_customizations as customization
                on customization.company_id = link.company_id
              where lower(domain.hostname) = lower(btrim($1, '.'))
                and (
                  link.tracking_code = lower(btrim($2))
                  or link.custom_slug = lower(btrim($2))
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
                  when link.custom_slug = lower(btrim($2)) then 0
                  else 1
                end,
                link.id
              limit 1
            `,
            values: [input.hostname, input.publicToken],
          });
          return mapPolicyRow(result.rows[0]);
        },
        { readOnly: true },
      );
    },
    async findReferencePolicy(input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<PolicyRow>({
            name: 'tracker-read-reference-in-app-browser-policy',
            text: `
              select
                offer.name as offer_name,
                coalesce(
                  customization.blocked_in_app_browsers,
                  array[]::text[]
                ) as blocked_in_app_browsers
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
                and manager_assignment.membership_id =
                  publisher_assignment.manager_membership_id
                and manager_assignment.manager_membership_id is null
              inner join public.companies as company
                on company.id = link.company_id
              left join public.company_subscriptions as subscription
                on subscription.company_id = company.id
              left join public.company_customizations as customization
                on customization.company_id = link.company_id
              where domain.hostname = lower(btrim($1))
                and publisher.public_id = $2::bigint
                and publisher.role = 'publisher'
                and publisher.status = 'active'
                and offer.public_id = $3::bigint
                and offer.status = 'active'
                and link.status = 'active'
                and domain.status = 'active'
                and publisher_assignment.status = 'active'
                and manager_assignment.status = 'active'
                and company.status = 'active'
                and subscription.status = 'active'
                and subscription.starts_at <= now()
                and (
                  subscription.ends_at is null
                  or subscription.ends_at > now()
                )
              order by link.updated_at desc, link.id desc
              limit 1
            `,
            values: [input.hostname, input.publisherPublicId, input.offerPublicId],
          });
          return mapPolicyRow(result.rows[0]);
        },
        { readOnly: true },
      );
    },
  });
}
