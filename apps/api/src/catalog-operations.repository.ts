import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  CatalogAssignmentTrackingLinkRecord,
  CatalogCompanyRecord,
  CatalogDomainRecord,
  CatalogDomainStatus,
  CatalogManagerRecord,
  CatalogNetworkDependencySummary,
  CatalogNetworkRecord,
  CatalogNetworkStatus,
  CatalogOfferDependencySummary,
  CatalogOfferRecord,
  CatalogOfferStatus,
  CatalogProviderRecord,
  CatalogPublisherRecord,
  CatalogRedirectType,
  CatalogReferrerMode,
  CatalogRepositoryContext,
  CoreCatalogSnapshot,
  NormalizedCatalogNetworkWriteInput,
  NormalizedCatalogOfferWriteInput,
  NormalizedCatalogPublisherWriteInput,
} from './catalog-operations.types.js';
import type { CompanyStatus } from './company-management.types.js';

type CompanyRow = Readonly<{
  id: string;
  status: string;
}> &
  Record<string, unknown>;

type ProviderRow = Readonly<{
  id: string;
  code: string;
  name: string;
  status: string;
  default_tracking_parameter: string | null;
  postback_click_id_token: string | null;
  postback_conversion_id_token: string | null;
  postback_revenue_amount_token: string | null;
  postback_revenue_currency_token: string | null;
  postback_conversion_status: string | null;
  integration_configured: boolean;
}> &
  Record<string, unknown>;

type DomainRow = Readonly<{
  id: string;
  hostname: string;
  status: string;
  is_primary: boolean;
  verified_at: Date | string | null;
  offer_count: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkRow = Readonly<{
  id: string;
  company_id: string;
  provider_id: string;
  provider_code: string;
  provider_name: string;
  name: string;
  external_account_id: string | null;
  status: string;
  tracking_parameter: string | null;
  effective_tracking_parameter: string;
  provider_integration_configured: boolean;
  postback_url: string | null;
  duplicate_allowed: boolean;
  offer_count: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkDependencyRow = Readonly<{
  id: string;
  offers: number | string;
  postback_endpoints: number | string;
  tracking_clicks: number | string;
  conversions: number | string;
  duplicate_protection_rules: number | string;
}> &
  Record<string, unknown>;

type OfferDependencyRow = Readonly<{
  id: string;
  publisher_assignments: number | string;
  tracking_links: number | string;
  tracking_clicks: number | string;
  conversions: number | string;
  duplicate_protection_rules: number | string;
}> &
  Record<string, unknown>;

type OfferRow = Readonly<{
  id: string;
  public_id: number | string;
  company_id: string;
  network_account_id: string;
  network_account_name: string;
  provider_id: string;
  provider_code: string;
  provider_name: string;
  tracking_domain_id: string | null;
  tracking_domain_hostname: string | null;
  code: string;
  external_offer_id: string | null;
  name: string;
  description: string | null;
  promotional_text_template: string;
  tracking_links: unknown;
  destination_url: string;
  status: string;
  countries: string[];
  devices: string[];
  desktop_url: string | null;
  android_url: string | null;
  ios_url: string | null;
  redirect_type: string;
  referrer_mode: string;
  default_payout_amount_minor: number | null;
  payout_currency: string | null;
  timezone: string;
  active_days: number[];
  active_start_time: string | null;
  active_end_time: string | null;
  proxy_enabled: boolean;
  expires_at: Date | string | null;
  duplicate_allowed: boolean;
  manager_membership_ids: string[];
  publisher_membership_ids: string[];
  clicks: number | string;
  conversions: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type MemberRow = Readonly<{
  membership_id: string;
  public_id: number | string;
  company_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  user_status: string;
  membership_status: string;
  invited_by: string | null;
  offer_count: number | string;
  joined_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type PublisherRow = MemberRow &
  Readonly<{
    timezone: string;
    payout_type: string;
    fixed_payout_amount_minor: number | string | null;
    payout_currency: string | null;
    postback_url: string | null;
    email_notifications_enabled: boolean;
    assigned_offer_ids: string[];
    manager_membership_ids: string[];
  }>;

export interface CatalogOperationsRepository {
  getCompany(
    context: CatalogRepositoryContext,
    companyId: string,
  ): Promise<CatalogCompanyRecord | undefined>;

  getSnapshot(context: CatalogRepositoryContext, companyId: string): Promise<CoreCatalogSnapshot>;

  createOffer(
    context: CatalogRepositoryContext,
    companyId: string,
    input: NormalizedCatalogOfferWriteInput,
  ): Promise<CatalogOfferRecord | undefined>;

  cloneOffer(
    context: CatalogRepositoryContext,
    companyId: string,
    sourceOfferId: string,
    input: NormalizedCatalogOfferWriteInput,
  ): Promise<CatalogOfferRecord | undefined>;

  getOfferDependencySummary(
    context: CatalogRepositoryContext,
    companyId: string,
    offerId: string,
  ): Promise<CatalogOfferDependencySummary | undefined>;

  updateOffer(
    context: CatalogRepositoryContext,
    companyId: string,
    offerId: string,
    input: NormalizedCatalogOfferWriteInput,
  ): Promise<CatalogOfferRecord | undefined>;

  deleteOffer(
    context: CatalogRepositoryContext,
    companyId: string,
    offerId: string,
  ): Promise<boolean>;

  createNetwork(
    context: CatalogRepositoryContext,
    companyId: string,
    input: NormalizedCatalogNetworkWriteInput,
  ): Promise<CatalogNetworkRecord | undefined>;

  cloneNetwork(
    context: CatalogRepositoryContext,
    companyId: string,
    sourceAccountId: string,
    input: NormalizedCatalogNetworkWriteInput,
  ): Promise<CatalogNetworkRecord | undefined>;

  getNetworkDependencySummary(
    context: CatalogRepositoryContext,
    companyId: string,
    accountId: string,
  ): Promise<CatalogNetworkDependencySummary | undefined>;

  updateNetwork(
    context: CatalogRepositoryContext,
    companyId: string,
    accountId: string,
    input: NormalizedCatalogNetworkWriteInput,
  ): Promise<CatalogNetworkRecord | undefined>;

  deleteNetwork(
    context: CatalogRepositoryContext,
    companyId: string,
    accountId: string,
  ): Promise<boolean>;

  updatePublisher(
    context: CatalogRepositoryContext,
    companyId: string,
    membershipId: string,
    input: NormalizedCatalogPublisherWriteInput,
  ): Promise<CatalogPublisherRecord | undefined>;
}

function createDatabaseSessionContext(context: CatalogRepositoryContext): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    companyId: context.companyId,
    requestId: context.requestId,
  };
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid timestamp.');
  }

  return date.toISOString();
}

function normalizeOptionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}

function normalizeCount(value: number | string): number {
  const count = typeof value === 'number' ? value : Number.parseInt(value, 10);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('The database returned an invalid catalog count.');
  }

  return count;
}

function parseCompanyStatus(value: string): CompanyStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function parseDomainStatus(value: string): CatalogDomainStatus {
  switch (value) {
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported tracking-domain status.');
  }
}

function parseNetworkStatus(value: string): CatalogNetworkStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported network status.');
  }
}

function parseOfferStatus(value: string): CatalogOfferStatus {
  switch (value) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported offer status.');
  }
}

function parseRedirectType(value: string): CatalogRedirectType {
  switch (value) {
    case '301':
    case '302':
      return value;
    default:
      throw new Error('The database returned an unsupported redirect type.');
  }
}

function parseReferrerMode(value: string): CatalogReferrerMode {
  switch (value) {
    case 'preserve':
    case 'strip':
      return value;
    default:
      throw new Error('The database returned an unsupported referrer mode.');
  }
}

function parseMembershipStatus(value: string): CatalogPublisherRecord['membershipStatus'] {
  switch (value) {
    case 'invited':
    case 'active':
    case 'suspended':
    case 'revoked':
      return value;
    default:
      throw new Error('The database returned an unsupported membership status.');
  }
}

function mapProvider(row: ProviderRow): CatalogProviderRecord {
  if (row.status !== 'active' && row.status !== 'archived') {
    throw new Error('The database returned an unsupported provider status.');
  }

  const postbackConversionStatus = row.postback_conversion_status ?? 'approved';

  if (postbackConversionStatus !== 'pending' && postbackConversionStatus !== 'approved') {
    throw new Error('The database returned an unsupported provider postback status.');
  }

  return Object.freeze({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    integration: Object.freeze({
      defaultTrackingParameter: row.default_tracking_parameter,
      postbackClickIdToken: row.postback_click_id_token,
      postbackConversionIdToken: row.postback_conversion_id_token,
      postbackRevenueAmountToken: row.postback_revenue_amount_token,
      postbackRevenueCurrencyToken: row.postback_revenue_currency_token,
      postbackConversionStatus,
      configured: row.integration_configured,
    }),
  });
}

function mapDomain(row: DomainRow): CatalogDomainRecord {
  return Object.freeze({
    id: row.id,
    hostname: row.hostname,
    status: parseDomainStatus(row.status),
    isPrimary: row.is_primary,
    verifiedAt: normalizeOptionalTimestamp(row.verified_at),
    offerCount: normalizeCount(row.offer_count),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapNetwork(row: NetworkRow): CatalogNetworkRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    providerId: row.provider_id,
    providerCode: row.provider_code,
    providerName: row.provider_name,
    name: row.name,
    externalAccountId: row.external_account_id,
    status: parseNetworkStatus(row.status),
    trackingParameter: row.tracking_parameter,
    effectiveTrackingParameter: row.effective_tracking_parameter,
    providerIntegrationConfigured: row.provider_integration_configured,
    postbackUrl: row.postback_url,
    duplicateAllowed: row.duplicate_allowed,
    offerCount: normalizeCount(row.offer_count),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapNetworkDependencySummary(row: NetworkDependencyRow): CatalogNetworkDependencySummary {
  return Object.freeze({
    offers: normalizeCount(row.offers),
    postbackEndpoints: normalizeCount(row.postback_endpoints),
    trackingClicks: normalizeCount(row.tracking_clicks),
    conversions: normalizeCount(row.conversions),
    duplicateProtectionRules: normalizeCount(row.duplicate_protection_rules),
  });
}

function mapOfferDependencySummary(row: OfferDependencyRow): CatalogOfferDependencySummary {
  return Object.freeze({
    publisherAssignments: normalizeCount(row.publisher_assignments),
    trackingLinks: normalizeCount(row.tracking_links),
    trackingClicks: normalizeCount(row.tracking_clicks),
    conversions: normalizeCount(row.conversions),
    duplicateProtectionRules: normalizeCount(row.duplicate_protection_rules),
  });
}

function mapAssignmentTrackingLinks(
  value: unknown,
): readonly CatalogAssignmentTrackingLinkRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('The database returned invalid assignment tracking links.');
  }

  return Object.freeze(
    value.map((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new Error('The database returned an invalid assignment tracking link.');
      }

      const record = item as Record<string, unknown>;
      const id = record['id'];
      const ownerMembershipId = record['ownerMembershipId'];
      const ownerPublicId = record['ownerPublicId'];
      const ownerRole = record['ownerRole'];
      const source = record['source'];
      const status = record['status'];
      const url = record['url'];

      if (ownerRole !== 'manager' && ownerRole !== 'publisher') {
        throw new Error('The database returned an unsupported tracking-link owner role.');
      }

      if (source !== 'manager_assignment' && source !== 'publisher_assignment') {
        throw new Error('The database returned an unsupported assignment tracking-link source.');
      }

      if (
        status !== 'draft' &&
        status !== 'active' &&
        status !== 'paused' &&
        status !== 'archived'
      ) {
        throw new Error('The database returned an unsupported assignment tracking-link status.');
      }

      if (
        typeof id !== 'string' ||
        typeof ownerMembershipId !== 'string' ||
        typeof ownerPublicId !== 'number' ||
        typeof url !== 'string'
      ) {
        throw new Error('The database returned incomplete assignment tracking-link data.');
      }

      return Object.freeze({
        id,
        ownerMembershipId,
        ownerRole,
        ownerPublicId,
        source,
        status,
        url,
      });
    }),
  );
}

function createTrackingLinkTemplate(hostname: string | null, offerPublicId: number): string | null {
  if (hostname === null) {
    return null;
  }

  return `https://${hostname}?pub_id=%PUB_ID%&offer_id=${String(offerPublicId)}`;
}

function mapOffer(row: OfferRow): CatalogOfferRecord {
  const publicId = normalizeCount(row.public_id);
  const devices = row.devices.map((device) => {
    if (device !== 'desktop' && device !== 'android' && device !== 'ios') {
      throw new Error('The database returned an unsupported offer device.');
    }

    return device;
  });

  return Object.freeze({
    id: row.id,
    publicId,
    companyId: row.company_id,
    networkAccountId: row.network_account_id,
    networkAccountName: row.network_account_name,
    providerId: row.provider_id,
    providerCode: row.provider_code,
    providerName: row.provider_name,
    trackingDomainId: row.tracking_domain_id,
    trackingDomainHostname: row.tracking_domain_hostname,
    code: row.code,
    externalOfferId: row.external_offer_id,
    name: row.name,
    description: row.description,
    promotionalTextTemplate: row.promotional_text_template,
    trackingLinkTemplate: createTrackingLinkTemplate(row.tracking_domain_hostname, publicId),
    trackingLinks: mapAssignmentTrackingLinks(row.tracking_links),
    destinationUrl: row.destination_url,
    status: parseOfferStatus(row.status),
    countries: Object.freeze([...row.countries]),
    devices: Object.freeze(devices),
    desktopUrl: row.desktop_url,
    androidUrl: row.android_url,
    iosUrl: row.ios_url,
    redirectType: parseRedirectType(row.redirect_type),
    referrerMode: parseReferrerMode(row.referrer_mode),
    defaultPayoutAmountMinor: row.default_payout_amount_minor,
    payoutCurrency: row.payout_currency,
    timezone: row.timezone,
    activeDays: Object.freeze(row.active_days.map(Number)),
    activeStartTime: row.active_start_time,
    activeEndTime: row.active_end_time,
    proxyEnabled: row.proxy_enabled,
    expiresAt: normalizeOptionalTimestamp(row.expires_at),
    duplicateAllowed: row.duplicate_allowed,
    managerMembershipIds: Object.freeze([...row.manager_membership_ids]),
    publisherMembershipIds: Object.freeze([...row.publisher_membership_ids]),
    clicks: normalizeCount(row.clicks),
    conversions: normalizeCount(row.conversions),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapManager(row: MemberRow): CatalogManagerRecord {
  if (row.user_status !== 'active' && row.user_status !== 'suspended') {
    throw new Error('The database returned an unsupported user status.');
  }

  return Object.freeze({
    membershipId: row.membership_id,
    publicId: normalizeCount(row.public_id),
    companyId: row.company_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    userStatus: row.user_status,
    membershipStatus: parseMembershipStatus(row.membership_status),
    offerCount: normalizeCount(row.offer_count),
    joinedAt: normalizeOptionalTimestamp(row.joined_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapPublisher(row: PublisherRow): CatalogPublisherRecord {
  if (row.user_status !== 'active' && row.user_status !== 'suspended') {
    throw new Error('The database returned an unsupported user status.');
  }

  if (row.payout_type !== 'fixed_member' && row.payout_type !== 'per_offer') {
    throw new Error('The database returned an unsupported publisher payout type.');
  }

  return Object.freeze({
    membershipId: row.membership_id,
    publicId: normalizeCount(row.public_id),
    companyId: row.company_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    userStatus: row.user_status,
    membershipStatus: parseMembershipStatus(row.membership_status),
    invitedBy: row.invited_by,
    timezone: row.timezone,
    payoutType: row.payout_type,
    fixedPayoutAmountMinor:
      row.fixed_payout_amount_minor === null ? null : normalizeCount(row.fixed_payout_amount_minor),
    payoutCurrency: row.payout_currency,
    postbackUrl: row.postback_url,
    emailNotificationsEnabled: row.email_notifications_enabled,
    offerCount: normalizeCount(row.offer_count),
    assignedOfferIds: Object.freeze([...row.assigned_offer_ids]),
    managerMembershipIds: Object.freeze([...row.manager_membership_ids]),
    joinedAt: normalizeOptionalTimestamp(row.joined_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

const OFFER_SELECT = `
  select
    offer.id,
    offer.public_id,
    offer.company_id,
    offer.network_account_id,
    account.name as network_account_name,
    provider.id as provider_id,
    provider.code as provider_code,
    provider.name as provider_name,
    configuration.tracking_domain_id,
    domain.hostname as tracking_domain_hostname,
    offer.code,
    offer.external_offer_id,
    offer.name,
    offer.description,
    coalesce(
      configuration.promotional_text_template,
      '%OFFER_NAME% - available in %COUNTRIES% for %DEVICES%. Use this link: %TRACKING_LINK%'
    ) as promotional_text_template,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', link.id,
            'ownerMembershipId', link.owner_membership_id,
            'ownerRole', owner.role,
            'ownerPublicId', owner.public_id,
            'source', link.source,
            'status', link.status,
            'url', format(
              'https://%s/r/%s',
              link_domain.hostname,
              coalesce(link.custom_slug, link.tracking_code)
            )
          )
          order by owner.role, owner.public_id, link.created_at, link.id
        )
        from public.tracking_links as link
        inner join public.company_memberships as owner
          on owner.id = link.owner_membership_id
         and owner.company_id = link.company_id
        inner join public.tracking_domains as link_domain
          on link_domain.id = link.tracking_domain_id
         and link_domain.company_id = link.company_id
        where link.company_id = offer.company_id
          and link.offer_id = offer.id
          and link.source in (
            'manager_assignment'::public.tracking_link_source,
            'publisher_assignment'::public.tracking_link_source
          )
      ),
      '[]'::jsonb
    ) as tracking_links,
    offer.destination_url,
    offer.status,
    coalesce(configuration.countries, array[]::text[]) as countries,
    coalesce(configuration.devices, array['desktop']::text[]) as devices,
    coalesce(configuration.desktop_url, offer.destination_url) as desktop_url,
    configuration.android_url,
    configuration.ios_url,
    coalesce(configuration.redirect_type, '302') as redirect_type,
    coalesce(configuration.referrer_mode, 'preserve') as referrer_mode,
    configuration.default_payout_amount_minor,
    configuration.payout_currency,
    coalesce(configuration.timezone, 'UTC') as timezone,
    coalesce(
      configuration.active_days,
      array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ) as active_days,
    configuration.active_start_time::text as active_start_time,
    configuration.active_end_time::text as active_end_time,
    coalesce(configuration.proxy_enabled, false) as proxy_enabled,
    configuration.expires_at,
    coalesce(configuration.duplicate_allowed, false) as duplicate_allowed,
    coalesce(
      array(
        select assignment.membership_id::text
        from public.offer_assignments as assignment
        inner join public.company_memberships as assigned_membership
          on assigned_membership.id = assignment.membership_id
        where assignment.offer_id = offer.id
          and assignment.status = 'active'
          and assigned_membership.role = 'manager'
        order by assignment.created_at asc, assignment.id asc
      ),
      array[]::text[]
    ) as manager_membership_ids,
    coalesce(
      array(
        select assignment.membership_id::text
        from public.offer_assignments as assignment
        inner join public.company_memberships as assigned_membership
          on assigned_membership.id = assignment.membership_id
        where assignment.offer_id = offer.id
          and assignment.status = 'active'
          and assigned_membership.role = 'publisher'
        order by assignment.created_at asc, assignment.id asc
      ),
      array[]::text[]
    ) as publisher_membership_ids,
    (
      select count(*)::integer
      from public.tracking_clicks as click
      where click.offer_id = offer.id
    ) as clicks,
    (
      select count(*)::integer
      from public.conversions as conversion
      where conversion.offer_id = offer.id
    ) as conversions,
    offer.created_at,
    offer.updated_at
  from public.offers as offer
  inner join public.network_accounts as account
    on account.id = offer.network_account_id
  inner join public.network_providers as provider
    on provider.id = account.provider_id
    and provider.company_id = account.company_id
  left join public.offer_operational_configurations as configuration
    on configuration.offer_id = offer.id
  left join public.tracking_domains as domain
    on domain.id = configuration.tracking_domain_id
`;

const NETWORK_SELECT = `
  select
    account.id,
    account.company_id,
    provider.id as provider_id,
    provider.code as provider_code,
    provider.name as provider_name,
    account.name,
    account.external_account_id,
    account.status,
    configuration.tracking_parameter,
    coalesce(
      configuration.tracking_parameter,
      provider_integration.default_tracking_parameter,
      'click_id'
    ) as effective_tracking_parameter,
    (
      provider_integration.postback_click_id_token is not null
      and provider_integration.postback_conversion_id_token is not null
    ) as provider_integration_configured,
    configuration.postback_url,
    coalesce(configuration.duplicate_allowed, false) as duplicate_allowed,
    (
      select count(*)::integer
      from public.offers as offer
      where offer.network_account_id = account.id
        and offer.status <> 'archived'
    ) as offer_count,
    account.created_at,
    account.updated_at
  from public.network_accounts as account
  inner join public.network_providers as provider
    on provider.id = account.provider_id
    and provider.company_id = account.company_id
  left join public.network_account_operational_configurations as configuration
    on configuration.network_account_id = account.id
  left join public.network_provider_integration_configurations as provider_integration
    on provider_integration.provider_id = provider.id
   and provider_integration.company_id = provider.company_id
`;

const MEMBER_SELECT = `
  select
    membership.id as membership_id,
    membership.public_id,
    membership.company_id,
    membership.user_id,
    auth_user.email,
    profile.display_name,
    profile.status as user_status,
    membership.status as membership_status,
    membership.invited_by,
    (
      select count(*)::integer
      from public.offer_assignments as assignment
      where assignment.membership_id = membership.id
        and assignment.status <> 'revoked'
    ) as offer_count,
    membership.joined_at,
    membership.created_at,
    membership.updated_at
  from public.company_memberships as membership
  inner join public.user_profiles as profile
    on profile.user_id = membership.user_id
  left join auth.users as auth_user
    on auth_user.id = membership.user_id
`;

const PUBLISHER_SELECT = `
  select
    membership.id as membership_id,
    membership.public_id,
    membership.company_id,
    membership.user_id,
    auth_user.email,
    profile.display_name,
    profile.status as user_status,
    membership.status as membership_status,
    membership.invited_by,
    coalesce(configuration.timezone, 'UTC') as timezone,
    coalesce(
      payout.mode::text,
      configuration.payout_type,
      'per_offer'
    ) as payout_type,
    payout.fixed_payout_amount_minor,
    payout.payout_currency,
    configuration.postback_url,
    coalesce(configuration.email_notifications_enabled, true) as email_notifications_enabled,
    (
      select count(*)::integer
      from public.offer_assignments as assignment
      where assignment.membership_id = membership.id
        and assignment.status <> 'revoked'
    ) as offer_count,
    coalesce(
      array(
        select assignment.offer_id::text
        from public.offer_assignments as assignment
        where assignment.membership_id = membership.id
          and assignment.status <> 'revoked'
          and assignment.manager_membership_id is not null
        order by assignment.created_at asc, assignment.id asc
      ),
      array[]::text[]
    ) as assigned_offer_ids,
    coalesce(
      array(
        select distinct assignment.manager_membership_id::text
        from public.offer_assignments as assignment
        where assignment.membership_id = membership.id
          and assignment.status <> 'revoked'
          and assignment.manager_membership_id is not null
        order by assignment.manager_membership_id::text
      ),
      array[]::text[]
    ) as manager_membership_ids,
    membership.joined_at,
    membership.created_at,
    greatest(
      membership.updated_at,
      coalesce(configuration.updated_at, membership.updated_at),
      coalesce(payout.updated_at, membership.updated_at)
    ) as updated_at
  from public.company_memberships as membership
  inner join public.user_profiles as profile
    on profile.user_id = membership.user_id
  left join auth.users as auth_user
    on auth_user.id = membership.user_id
  left join public.publisher_operational_configurations as configuration
    on configuration.membership_id = membership.id
  left join public.member_payout_profiles as payout
    on payout.membership_id = membership.id
`;

async function writeAuditEvent(
  transaction: DatabaseTransaction,
  context: CatalogRepositoryContext,
  input: {
    readonly eventName: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await transaction.query({
    name: 'catalog-operations-write-audit-event',
    text: `
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
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
    `,
    values: [
      context.companyId,
      context.actorUserId,
      context.requestId,
      input.eventName,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata),
    ],
  });
}

async function loadOffer(
  transaction: DatabaseTransaction,
  companyId: string,
  offerId: string,
): Promise<CatalogOfferRecord | undefined> {
  const result = await transaction.query<OfferRow>({
    name: 'catalog-operations-load-offer',
    text: `
      ${OFFER_SELECT}
      where offer.company_id = $1
        and offer.id = $2
      limit 1
    `,
    values: [companyId, offerId],
  });

  const row = result.rows[0];

  return row === undefined ? undefined : mapOffer(row);
}

async function loadNetwork(
  transaction: DatabaseTransaction,
  companyId: string,
  accountId: string,
): Promise<CatalogNetworkRecord | undefined> {
  const result = await transaction.query<NetworkRow>({
    name: 'catalog-operations-load-network',
    text: `
      ${NETWORK_SELECT}
      where account.company_id = $1
        and account.id = $2
      limit 1
    `,
    values: [companyId, accountId],
  });

  const row = result.rows[0];

  return row === undefined ? undefined : mapNetwork(row);
}

async function loadPublisher(
  transaction: DatabaseTransaction,
  companyId: string,
  membershipId: string,
): Promise<CatalogPublisherRecord | undefined> {
  const result = await transaction.query<PublisherRow>({
    name: 'catalog-operations-load-publisher',
    text: `
      ${PUBLISHER_SELECT}
      where membership.company_id = $1
        and membership.id = $2
        and membership.role = 'publisher'
      limit 1
    `,
    values: [companyId, membershipId],
  });

  const row = result.rows[0];

  return row === undefined ? undefined : mapPublisher(row);
}

async function replaceManagerOfferAssignments(
  transaction: DatabaseTransaction,
  context: CatalogRepositoryContext,
  offerId: string,
  membershipIds: readonly string[],
): Promise<void> {
  await transaction.query({
    name: 'catalog-operations-revoke-removed-manager-offer-assignments',
    text: `
      update public.offer_assignments as assignment
      set
        status = 'revoked',
        updated_by = $3
      from public.company_memberships as membership
      where assignment.company_id = $1
        and assignment.offer_id = $2
        and assignment.membership_id = membership.id
        and membership.role = 'manager'
        and assignment.status <> 'revoked'
        and not (assignment.membership_id = any($4::uuid[]))
    `,
    values: [context.companyId, offerId, context.actorUserId, [...membershipIds]],
  });

  if (membershipIds.length === 0) {
    return;
  }

  await transaction.query({
    name: 'catalog-operations-upsert-manager-offer-assignments',
    text: `
      insert into public.offer_assignments (
        company_id,
        offer_id,
        membership_id,
        manager_membership_id,
        status,
        assigned_by,
        updated_by
      )
      select
        $1,
        $2,
        membership.id,
        null,
        'active'::public.offer_assignment_status,
        $3,
        $3
      from public.company_memberships as membership
      where membership.company_id = $1
        and membership.id = any($4::uuid[])
        and membership.role = 'manager'
        and membership.status = 'active'
      on conflict (offer_id, membership_id)
      do update
      set
        status = 'active',
        updated_by = excluded.updated_by
    `,
    values: [context.companyId, offerId, context.actorUserId, [...membershipIds]],
  });
}

export function createCatalogOperationsRepository(
  database: DatabaseRuntime,
): CatalogOperationsRepository {
  return Object.freeze<CatalogOperationsRepository>({
    async getCompany(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'catalog-operations-get-company',
            text: `
              select id, status
              from public.companies
              where id = $1
              limit 1
            `,
            values: [companyId],
          });

          const row = result.rows[0];

          return row === undefined
            ? undefined
            : Object.freeze({
                id: row.id,
                status: parseCompanyStatus(row.status),
              });
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getSnapshot(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const providerResult = await transaction.query<ProviderRow>({
            name: 'catalog-operations-list-providers',
            text: `
              select
                provider.id,
                provider.code,
                provider.name,
                provider.status,
                integration.default_tracking_parameter,
                integration.postback_click_id_token,
                integration.postback_conversion_id_token,
                integration.postback_revenue_amount_token,
                integration.postback_revenue_currency_token,
                integration.postback_conversion_status,
                (
                  integration.postback_click_id_token is not null
                  and integration.postback_conversion_id_token is not null
                ) as integration_configured
              from public.network_providers as provider
              left join public.network_provider_integration_configurations as integration
                on integration.provider_id = provider.id
               and integration.company_id = provider.company_id
              where provider.company_id = $1
              order by
                case when provider.status = 'active' then 0 else 1 end,
                provider.name asc,
                provider.id asc
            `,
            values: [companyId],
          });

          const domainResult = await transaction.query<DomainRow>({
            name: 'catalog-operations-list-domains',
            text: `
              select
                domain.id,
                domain.hostname,
                domain.status,
                domain.is_primary,
                domain.verified_at,
                (
                  select count(*)::integer
                  from (
                    select configuration.offer_id
                    from public.offer_operational_configurations as configuration
                    inner join public.offers as configured_offer
                      on configured_offer.id = configuration.offer_id
                    where configuration.tracking_domain_id = domain.id
                      and configured_offer.status <> 'archived'

                    union

                    select link.offer_id
                    from public.tracking_links as link
                    inner join public.offers as linked_offer
                      on linked_offer.id = link.offer_id
                    where link.tracking_domain_id = domain.id
                      and linked_offer.status <> 'archived'
                  ) as domain_offer
                ) as offer_count,
                domain.created_at,
                domain.updated_at
              from public.tracking_domains as domain
              where domain.company_id = $1
              order by domain.created_at desc, domain.id desc
            `,
            values: [companyId],
          });

          const networkResult = await transaction.query<NetworkRow>({
            name: 'catalog-operations-list-networks',
            text: `
              ${NETWORK_SELECT}
              where account.company_id = $1
              order by account.created_at desc, account.id desc
            `,
            values: [companyId],
          });

          const offerResult = await transaction.query<OfferRow>({
            name: 'catalog-operations-list-offers',
            text: `
              ${OFFER_SELECT}
              where offer.company_id = $1
              order by offer.created_at desc, offer.id desc
            `,
            values: [companyId],
          });

          const managerResult = await transaction.query<MemberRow>({
            name: 'catalog-operations-list-managers',
            text: `
              ${MEMBER_SELECT}
              where membership.company_id = $1
                and membership.role = 'manager'
              order by membership.created_at desc, membership.id desc
            `,
            values: [companyId],
          });

          const publisherResult = await transaction.query<PublisherRow>({
            name: 'catalog-operations-list-publishers',
            text: `
              ${PUBLISHER_SELECT}
              where membership.company_id = $1
                and membership.role = 'publisher'
              order by membership.created_at desc, membership.id desc
            `,
            values: [companyId],
          });

          const providers = Object.freeze(providerResult.rows.map(mapProvider));
          const domains = Object.freeze(domainResult.rows.map(mapDomain));
          const networks = Object.freeze(networkResult.rows.map(mapNetwork));
          const offers = Object.freeze(offerResult.rows.map(mapOffer));
          const managers = Object.freeze(managerResult.rows.map(mapManager));
          const publishers = Object.freeze(publisherResult.rows.map(mapPublisher));

          return Object.freeze({
            companyId,
            summary: Object.freeze({
              domains: domains.filter((domain) => domain.status !== 'archived').length,
              networks: networks.filter((network) => network.status !== 'archived').length,
              offers: offers.filter((offer) => offer.status !== 'archived').length,
              managers: managers.filter((manager) => manager.membershipStatus !== 'revoked').length,
              publishers: publishers.filter((publisher) => publisher.membershipStatus !== 'revoked')
                .length,
            }),
            providers,
            domains,
            networks,
            offers,
            managers,
            publishers,
          });
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createOffer(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const offerResult = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-create-offer',
            text: `
              insert into public.offers (
                company_id,
                network_account_id,
                code,
                external_offer_id,
                name,
                description,
                destination_url,
                status,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $9
              )
              on conflict do nothing
              returning id
            `,
            values: [
              companyId,
              input.networkAccountId,
              input.code,
              input.externalOfferId,
              input.name,
              input.description,
              input.destinationUrl,
              input.status,
              context.actorUserId,
            ],
          });

          const offerId = offerResult.rows[0]?.id;

          if (offerId === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'catalog-operations-create-offer-configuration',
            text: `
              insert into public.offer_operational_configurations (
                offer_id,
                company_id,
                tracking_domain_id,
                promotional_text_template,
                countries,
                devices,
                desktop_url,
                android_url,
                ios_url,
                redirect_type,
                referrer_mode,
                default_payout_amount_minor,
                payout_currency,
                timezone,
                active_days,
                active_start_time,
                active_end_time,
                proxy_enabled,
                expires_at,
                duplicate_allowed,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5::text[],
                $6::text[],
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15::smallint[],
                $16::time,
                $17::time,
                $18,
                $19::timestamptz,
                $20,
                $21,
                $21
              )
            `,
            values: [
              offerId,
              companyId,
              input.trackingDomainId,
              input.promotionalTextTemplate,
              [...input.countries],
              [...input.devices],
              input.desktopUrl,
              input.androidUrl,
              input.iosUrl,
              input.redirectType,
              input.referrerMode,
              input.defaultPayoutAmountMinor,
              input.payoutCurrency,
              input.timezone,
              [...input.activeDays],
              input.activeStartTime,
              input.activeEndTime,
              input.proxyEnabled,
              input.expiresAt,
              input.duplicateAllowed,
              context.actorUserId,
            ],
          });

          await replaceManagerOfferAssignments(
            transaction,
            context,
            offerId,
            input.managerMembershipIds,
          );

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.offer.created',
            entityType: 'offer',
            entityId: offerId,
            metadata: {
              code: input.code,
              networkAccountId: input.networkAccountId,
              trackingDomainId: input.trackingDomainId,
              managerCount: input.managerMembershipIds.length,
            },
          });

          return loadOffer(transaction, companyId, offerId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async cloneOffer(context, companyId, sourceOfferId, input) {
      return database.transaction(
        async (transaction) => {
          const offerResult = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-clone-offer',
            text: `
              insert into public.offers (
                company_id,
                network_account_id,
                code,
                external_offer_id,
                name,
                description,
                destination_url,
                status,
                created_by,
                updated_by
              )
              select
                $1,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                'draft'::public.offer_status,
                $9,
                $9
              from public.offers as source
              where source.id = $2
                and source.company_id = $1
              on conflict do nothing
              returning id
            `,
            values: [
              companyId,
              sourceOfferId,
              input.networkAccountId,
              input.code,
              input.externalOfferId,
              input.name,
              input.description,
              input.destinationUrl,
              context.actorUserId,
            ],
          });

          const offerId = offerResult.rows[0]?.id;

          if (offerId === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'catalog-operations-clone-offer-configuration',
            text: `
              insert into public.offer_operational_configurations (
                offer_id,
                company_id,
                tracking_domain_id,
                promotional_text_template,
                countries,
                devices,
                desktop_url,
                android_url,
                ios_url,
                redirect_type,
                referrer_mode,
                default_payout_amount_minor,
                payout_currency,
                timezone,
                active_days,
                active_start_time,
                active_end_time,
                proxy_enabled,
                expires_at,
                duplicate_allowed,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5::text[],
                $6::text[],
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15::smallint[],
                $16::time,
                $17::time,
                $18,
                $19::timestamptz,
                $20,
                $21,
                $21
              )
            `,
            values: [
              offerId,
              companyId,
              input.trackingDomainId,
              input.promotionalTextTemplate,
              [...input.countries],
              [...input.devices],
              input.desktopUrl,
              input.androidUrl,
              input.iosUrl,
              input.redirectType,
              input.referrerMode,
              input.defaultPayoutAmountMinor,
              input.payoutCurrency,
              input.timezone,
              [...input.activeDays],
              input.activeStartTime,
              input.activeEndTime,
              input.proxyEnabled,
              input.expiresAt,
              input.duplicateAllowed,
              context.actorUserId,
            ],
          });

          await replaceManagerOfferAssignments(
            transaction,
            context,
            offerId,
            input.managerMembershipIds,
          );

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.offer.cloned',
            entityType: 'offer',
            entityId: offerId,
            metadata: {
              sourceOfferId,
              code: input.code,
              networkAccountId: input.networkAccountId,
              trackingDomainId: input.trackingDomainId,
              managerCount: input.managerMembershipIds.length,
            },
          });

          return loadOffer(transaction, companyId, offerId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getOfferDependencySummary(context, companyId, offerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<OfferDependencyRow>({
            name: 'catalog-operations-offer-dependency-summary',
            text: `
              select
                offer.id,
                (
                  select count(*)
                  from public.offer_assignments as assignment
                  inner join public.company_memberships as membership
                    on membership.id = assignment.membership_id
                   and membership.company_id = assignment.company_id
                  where assignment.company_id = offer.company_id
                    and assignment.offer_id = offer.id
                    and membership.role = 'publisher'
                ) as publisher_assignments,
                (
                  select count(*)
                  from public.tracking_links as link
                  where link.company_id = offer.company_id
                    and link.offer_id = offer.id
                ) as tracking_links,
                (
                  select count(*)
                  from public.tracking_clicks as click
                  where click.company_id = offer.company_id
                    and click.offer_id = offer.id
                ) as tracking_clicks,
                (
                  select count(*)
                  from public.conversions as conversion
                  where conversion.company_id = offer.company_id
                    and conversion.offer_id = offer.id
                ) as conversions,
                (
                  select count(*)
                  from public.duplicate_protection_rules as duplicate_rule
                  where duplicate_rule.company_id = offer.company_id
                    and duplicate_rule.offer_id = offer.id
                ) as duplicate_protection_rules
              from public.offers as offer
              where offer.company_id = $1
                and offer.id = $2
              limit 1
            `,
            values: [companyId, offerId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapOfferDependencySummary(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateOffer(context, companyId, offerId, input) {
      return database.transaction(
        async (transaction) => {
          const existing = await loadOffer(transaction, companyId, offerId);

          if (existing === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'catalog-operations-upsert-offer-configuration',
            text: `
              insert into public.offer_operational_configurations (
                offer_id,
                company_id,
                tracking_domain_id,
                promotional_text_template,
                countries,
                devices,
                desktop_url,
                android_url,
                ios_url,
                redirect_type,
                referrer_mode,
                default_payout_amount_minor,
                payout_currency,
                timezone,
                active_days,
                active_start_time,
                active_end_time,
                proxy_enabled,
                expires_at,
                duplicate_allowed,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5::text[],
                $6::text[],
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15::smallint[],
                $16::time,
                $17::time,
                $18,
                $19::timestamptz,
                $20,
                $21,
                $21
              )
              on conflict (offer_id)
              do update
              set
                tracking_domain_id = excluded.tracking_domain_id,
                promotional_text_template = excluded.promotional_text_template,
                countries = excluded.countries,
                devices = excluded.devices,
                desktop_url = excluded.desktop_url,
                android_url = excluded.android_url,
                ios_url = excluded.ios_url,
                redirect_type = excluded.redirect_type,
                referrer_mode = excluded.referrer_mode,
                default_payout_amount_minor = excluded.default_payout_amount_minor,
                payout_currency = excluded.payout_currency,
                timezone = excluded.timezone,
                active_days = excluded.active_days,
                active_start_time = excluded.active_start_time,
                active_end_time = excluded.active_end_time,
                proxy_enabled = excluded.proxy_enabled,
                expires_at = excluded.expires_at,
                duplicate_allowed = excluded.duplicate_allowed,
                updated_by = excluded.updated_by
            `,
            values: [
              offerId,
              companyId,
              input.trackingDomainId,
              input.promotionalTextTemplate,
              [...input.countries],
              [...input.devices],
              input.desktopUrl,
              input.androidUrl,
              input.iosUrl,
              input.redirectType,
              input.referrerMode,
              input.defaultPayoutAmountMinor,
              input.payoutCurrency,
              input.timezone,
              [...input.activeDays],
              input.activeStartTime,
              input.activeEndTime,
              input.proxyEnabled,
              input.expiresAt,
              input.duplicateAllowed,
              context.actorUserId,
            ],
          });

          await replaceManagerOfferAssignments(
            transaction,
            context,
            offerId,
            input.managerMembershipIds,
          );

          const result = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-update-offer',
            text: `
              update public.offers
              set
                network_account_id = $3,
                external_offer_id = $4,
                name = $5,
                description = $6,
                destination_url = $7,
                status = $8,
                updated_by = $9
              where id = $1
                and company_id = $2
              returning id
            `,
            values: [
              offerId,
              companyId,
              input.networkAccountId,
              input.externalOfferId,
              input.name,
              input.description,
              input.destinationUrl,
              input.status,
              context.actorUserId,
            ],
          });

          if (result.rows[0] === undefined) {
            return undefined;
          }

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.offer.updated',
            entityType: 'offer',
            entityId: offerId,
            metadata: {
              previousNetworkAccountId: existing.networkAccountId,
              networkAccountId: input.networkAccountId,
              status: input.status,
              trackingDomainId: input.trackingDomainId,
              managerCount: input.managerMembershipIds.length,
            },
          });

          return loadOffer(transaction, companyId, offerId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

        async deleteOffer(context, companyId, offerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<
            { id: string; code: string; name: string; network_account_id: string } & Record<
              string,
              unknown
            >
          >({
            name: 'catalog-operations-delete-offer-logically',
            text: `
              update public.offers as offer
              set
                status = 'archived',
                updated_by = $3
              where offer.id = $1
                and offer.company_id = $2
                and offer.status <> 'archived'
              returning offer.id, offer.code, offer.name, offer.network_account_id
            `,
            values: [offerId, companyId, context.actorUserId],
          });
          const deleted = result.rows[0];

          if (deleted === undefined) {
            return false;
          }

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.offer.deleted',
            entityType: 'offer',
            entityId: deleted.id,
            metadata: {
              code: deleted.code,
              name: deleted.name,
              networkAccountId: deleted.network_account_id,
              deletionMode: 'logical_terminal',
              historyPreserved: true,
            },
          });
          return true;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createNetwork(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const accountResult = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-create-network',
            text: `
              insert into public.network_accounts (
                company_id,
                provider_id,
                name,
                external_account_id,
                status,
                created_by,
                updated_by
              )
              select
                $1,
                provider.id,
                $3,
                $4,
                $5::public.network_account_status,
                $6,
                $6
              from public.network_providers as provider
              where provider.id = $2
                and provider.company_id = $1
                and provider.status = 'active'
              on conflict do nothing
              returning id
            `,
            values: [
              companyId,
              input.providerId,
              input.name,
              input.externalAccountId,
              input.status,
              context.actorUserId,
            ],
          });

          const accountId = accountResult.rows[0]?.id;

          if (accountId === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'catalog-operations-create-network-configuration',
            text: `
              insert into public.network_account_operational_configurations (
                network_account_id,
                company_id,
                tracking_parameter,
                postback_url,
                duplicate_allowed,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $6
              )
            `,
            values: [
              accountId,
              companyId,
              input.trackingParameter,
              input.postbackUrl,
              input.duplicateAllowed,
              context.actorUserId,
            ],
          });

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.network.created',
            entityType: 'network_account',
            entityId: accountId,
            metadata: {
              providerId: input.providerId,
              name: input.name,
            },
          });

          return loadNetwork(transaction, companyId, accountId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async cloneNetwork(context, companyId, sourceAccountId, input) {
      return database.transaction(
        async (transaction) => {
          const accountResult = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-clone-network',
            text: `
              insert into public.network_accounts (
                company_id,
                provider_id,
                name,
                external_account_id,
                status,
                created_by,
                updated_by
              )
              select
                $1,
                provider.id,
                $4,
                $5,
                'active'::public.network_account_status,
                $6,
                $6
              from public.network_accounts as source_account
              inner join public.network_providers as provider
                on provider.id = $3
               and provider.company_id = $1
               and provider.status = 'active'
              where source_account.id = $2
                and source_account.company_id = $1
              on conflict do nothing
              returning id
            `,
            values: [
              companyId,
              sourceAccountId,
              input.providerId,
              input.name,
              input.externalAccountId,
              context.actorUserId,
            ],
          });

          const accountId = accountResult.rows[0]?.id;

          if (accountId === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'catalog-operations-clone-network-configuration',
            text: `
              insert into public.network_account_operational_configurations (
                network_account_id,
                company_id,
                tracking_parameter,
                postback_url,
                duplicate_allowed,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $6
              )
            `,
            values: [
              accountId,
              companyId,
              input.trackingParameter,
              input.postbackUrl,
              input.duplicateAllowed,
              context.actorUserId,
            ],
          });

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.network.cloned',
            entityType: 'network_account',
            entityId: accountId,
            metadata: {
              sourceNetworkId: sourceAccountId,
              providerId: input.providerId,
              name: input.name,
            },
          });

          return loadNetwork(transaction, companyId, accountId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getNetworkDependencySummary(context, companyId, accountId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkDependencyRow>({
            name: 'catalog-operations-network-dependency-summary',
            text: `
              select
                account.id,
                (
                  select count(*)
                  from public.offers as offer
                  where offer.company_id = account.company_id
                    and offer.network_account_id = account.id
                ) as offers,
                (
                  select count(*)
                  from public.network_postback_endpoints as endpoint
                  where endpoint.company_id = account.company_id
                    and endpoint.network_account_id = account.id
                ) as postback_endpoints,
                (
                  select count(*)
                  from public.tracking_clicks as click
                  where click.company_id = account.company_id
                    and click.network_account_id = account.id
                ) as tracking_clicks,
                (
                  select count(*)
                  from public.conversions as conversion
                  where conversion.company_id = account.company_id
                    and conversion.network_account_id = account.id
                ) as conversions,
                (
                  select count(*)
                  from public.duplicate_protection_rules as duplicate_rule
                  where duplicate_rule.company_id = account.company_id
                    and duplicate_rule.network_account_id = account.id
                ) as duplicate_protection_rules
              from public.network_accounts as account
              where account.company_id = $1
                and account.id = $2
              limit 1
            `,
            values: [companyId, accountId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapNetworkDependencySummary(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateNetwork(context, companyId, accountId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-update-network',
            text: `
              update public.network_accounts
              set
                provider_id = $3,
                name = $4,
                external_account_id = $5,
                status = $6,
                updated_by = $7
              where id = $1
                and company_id = $2
              returning id
            `,
            values: [
              accountId,
              companyId,
              input.providerId,
              input.name,
              input.externalAccountId,
              input.status,
              context.actorUserId,
            ],
          });

          if (result.rows[0] === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'catalog-operations-upsert-network-configuration',
            text: `
              insert into public.network_account_operational_configurations (
                network_account_id,
                company_id,
                tracking_parameter,
                postback_url,
                duplicate_allowed,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $6
              )
              on conflict (network_account_id)
              do update
              set
                tracking_parameter = excluded.tracking_parameter,
                postback_url = excluded.postback_url,
                duplicate_allowed = excluded.duplicate_allowed,
                updated_by = excluded.updated_by
            `,
            values: [
              accountId,
              companyId,
              input.trackingParameter,
              input.postbackUrl,
              input.duplicateAllowed,
              context.actorUserId,
            ],
          });

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.network.updated',
            entityType: 'network_account',
            entityId: accountId,
            metadata: {
              providerId: input.providerId,
              status: input.status,
              name: input.name,
            },
          });

          return loadNetwork(transaction, companyId, accountId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

        async deleteNetwork(context, companyId, accountId) {
      return database.transaction(
        async (transaction) => {
          const archivedOffers = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'catalog-operations-delete-network-archive-offers',
            text: `
              update public.offers as offer
              set
                status = 'archived',
                updated_by = $3
              where offer.network_account_id = $1
                and offer.company_id = $2
                and offer.status <> 'archived'
              returning offer.id
            `,
            values: [accountId, companyId, context.actorUserId],
          });

          const result = await transaction.query<
            { id: string; name: string; provider_id: string } & Record<string, unknown>
          >({
            name: 'catalog-operations-delete-network-logically',
            text: `
              update public.network_accounts as account
              set
                status = 'archived',
                updated_by = $3
              where account.id = $1
                and account.company_id = $2
                and account.status <> 'archived'
              returning account.id, account.name, account.provider_id
            `,
            values: [accountId, companyId, context.actorUserId],
          });
          const deleted = result.rows[0];

          if (deleted === undefined) {
            return false;
          }

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.network.deleted',
            entityType: 'network_account',
            entityId: deleted.id,
            metadata: {
              providerId: deleted.provider_id,
              name: deleted.name,
              deletionMode: 'logical_terminal',
              historyPreserved: true,
              archivedOfferCount: archivedOffers.rows.length,
            },
          });
          return true;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updatePublisher(context, companyId, membershipId, input) {
      return database.transaction(
        async (transaction) => {
          const membershipResult = await transaction.query<
            { id: string; status: string } & Record<string, unknown>
          >({
            name: 'catalog-operations-verify-managed-publisher',
            text: `
              select publisher.id, publisher.status
              from public.company_memberships as publisher
              inner join public.company_memberships as manager
                on manager.id = $3
               and manager.company_id = publisher.company_id
               and manager.user_id = $4
               and manager.role = 'manager'
               and manager.status = 'active'
              where publisher.id = $1
                and publisher.company_id = $2
                and publisher.role = 'publisher'
                and publisher.status <> 'revoked'
                and (
                  publisher.invited_by = $4
                  or exists (
                    select 1
                    from public.offer_assignments as assignment
                    where assignment.company_id = publisher.company_id
                      and assignment.membership_id = publisher.id
                      and assignment.manager_membership_id = manager.id
                  )
                )
              limit 1
            `,
            values: [membershipId, companyId, input.managerMembershipId, context.actorUserId],
          });

          const managedPublisher = membershipResult.rows[0];

          if (managedPublisher === undefined) {
            return undefined;
          }

          if (managedPublisher.status !== 'active' && input.assignedOfferIds.length > 0) {
            throw new Error('A suspended Publisher cannot retain active Offer assignments.');
          }

          await transaction.query({
            name: 'catalog-operations-upsert-publisher-configuration',
            text: `
              insert into public.publisher_operational_configurations (
                membership_id,
                company_id,
                timezone,
                payout_type,
                postback_url,
                email_notifications_enabled,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $7
              )
              on conflict (membership_id)
              do update
              set
                timezone = excluded.timezone,
                payout_type = excluded.payout_type,
                postback_url = excluded.postback_url,
                email_notifications_enabled = excluded.email_notifications_enabled,
                updated_by = excluded.updated_by
            `,
            values: [
              membershipId,
              companyId,
              input.timezone,
              input.payoutType,
              input.postbackUrl,
              input.emailNotificationsEnabled,
              context.actorUserId,
            ],
          });

          await transaction.query({
            name: 'catalog-operations-upsert-publisher-payout-profile',
            text: `
              insert into public.member_payout_profiles (
                company_id,
                membership_id,
                mode,
                fixed_payout_amount_minor,
                payout_currency,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3::public.payout_mode,
                $4,
                $5,
                $6,
                $6
              )
              on conflict (membership_id)
              do update
              set
                mode = excluded.mode,
                fixed_payout_amount_minor = excluded.fixed_payout_amount_minor,
                payout_currency = excluded.payout_currency,
                updated_by = excluded.updated_by
            `,
            values: [
              companyId,
              membershipId,
              input.payoutType,
              input.fixedPayoutAmountMinor,
              input.payoutCurrency,
              context.actorUserId,
            ],
          });

          await transaction.query({
            name: 'catalog-operations-revoke-removed-publisher-assignments',
            text: `
              update public.offer_assignments
              set
                status = 'revoked',
                updated_by = $4
              where company_id = $1
                and membership_id = $2
                and manager_membership_id = $3
                and status <> 'revoked'
                and not (offer_id = any($5::uuid[]))
            `,
            values: [
              companyId,
              membershipId,
              input.managerMembershipId,
              context.actorUserId,
              [...input.assignedOfferIds],
            ],
          });

          if (input.assignedOfferIds.length > 0) {
            const assignmentResult = await transaction.query<
              { offer_id: string } & Record<string, unknown>
            >({
              name: 'catalog-operations-upsert-publisher-offer-assignments',
              text: `
                insert into public.offer_assignments (
                  company_id,
                  offer_id,
                  membership_id,
                  manager_membership_id,
                  status,
                  manual_payout_amount_minor,
                  manual_payout_currency,
                  assigned_by,
                  updated_by
                )
                select
                  $1,
                  offer.id,
                  $2,
                  $3,
                  'active'::public.offer_assignment_status,
                  case
                    when $4::public.payout_mode = 'per_offer'
                    then configuration.default_payout_amount_minor
                    else null
                  end,
                  case
                    when $4::public.payout_mode = 'per_offer'
                    then configuration.payout_currency
                    else null
                  end,
                  $5,
                  $5
                from public.offers as offer
                inner join public.offer_assignments as manager_assignment
                  on manager_assignment.company_id = offer.company_id
                 and manager_assignment.offer_id = offer.id
                 and manager_assignment.membership_id = $3
                 and manager_assignment.manager_membership_id is null
                 and manager_assignment.status = 'active'
                left join public.offer_operational_configurations as configuration
                  on configuration.offer_id = offer.id
                where offer.company_id = $1
                  and offer.id = any($6::uuid[])
                  and offer.status <> 'archived'
                  and (
                    $4::public.payout_mode = 'fixed_member'
                    or (
                      configuration.default_payout_amount_minor is not null
                      and configuration.payout_currency is not null
                    )
                  )
                on conflict (offer_id, membership_id)
                do update
                set
                  status = 'active',
                  manual_payout_amount_minor = excluded.manual_payout_amount_minor,
                  manual_payout_currency = excluded.manual_payout_currency,
                  updated_by = excluded.updated_by
                where public.offer_assignments.manager_membership_id =
                  excluded.manager_membership_id
                returning offer_id
              `,
              values: [
                companyId,
                membershipId,
                input.managerMembershipId,
                input.payoutType,
                context.actorUserId,
                [...input.assignedOfferIds],
              ],
            });

            if (assignmentResult.rows.length !== input.assignedOfferIds.length) {
              throw new Error(
                'One or more selected Offers are unavailable or missing default payout configuration.',
              );
            }
          }

          await writeAuditEvent(transaction, context, {
            eventName: 'catalog.publisher.updated',
            entityType: 'company_membership',
            entityId: membershipId,
            metadata: {
              managerMembershipId: input.managerMembershipId,
              payoutType: input.payoutType,
              fixedPayoutAmountMinor: input.fixedPayoutAmountMinor,
              payoutCurrency: input.payoutCurrency,
              emailNotificationsEnabled: input.emailNotificationsEnabled,
              assignedOfferIds: input.assignedOfferIds,
            },
          });

          return loadPublisher(transaction, companyId, membershipId);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
