import { assertCompanyRole } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { CatalogOperationsRepository } from './catalog-operations.repository.js';
import type {
  CatalogDevice,
  CatalogNetworkRecord,
  CatalogNetworkStatus,
  CatalogOfferRecord,
  CatalogOfferStatus,
  CatalogPayoutType,
  CatalogRedirectType,
  CatalogReferrerMode,
  CatalogRepositoryContext,
  CatalogPublisherRecord,
  CoreCatalogSnapshot,
  CreateCatalogNetworkInput,
  CreateCatalogOfferInput,
  NormalizedCatalogNetworkWriteInput,
  NormalizedCatalogOfferWriteInput,
  NormalizedCatalogPublisherWriteInput,
  UpdateCatalogNetworkInput,
  UpdateCatalogOfferInput,
  UpdateCatalogPublisherInput,
} from './catalog-operations.types.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OFFER_CODE_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const TRACKING_PARAMETER_PATTERN = /^[A-Za-z0-9_.-]+$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const MAX_AMOUNT_MINOR = 2_147_483_647;

export interface CatalogOperationsService {
  getSnapshot(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<CoreCatalogSnapshot>;

  createOffer(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateCatalogOfferInput,
  ): Promise<CatalogOfferRecord>;

  updateOffer(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    offerId: string,
    input: UpdateCatalogOfferInput,
  ): Promise<CatalogOfferRecord>;

  createNetwork(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateCatalogNetworkInput,
  ): Promise<CatalogNetworkRecord>;

  updateNetwork(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    accountId: string,
    input: UpdateCatalogNetworkInput,
  ): Promise<CatalogNetworkRecord>;

  updatePublisher(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    membershipId: string,
    input: UpdateCatalogPublisherInput,
  ): Promise<CatalogPublisherRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!UUID_PATTERN.test(normalized)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalized;
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalized = value.trim();

  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain ${String(minimumLength)} to ${String(maximumLength)} characters.`,
    );
  }

  return normalized;
}

function normalizeNullableText(
  value: string | null | undefined,
  fieldName: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain at most ${String(maximumLength)} characters.`,
    );
  }

  return normalized;
}

function normalizeUrl(
  value: string | null | undefined,
  fieldName: string,
  required: boolean,
): string | null {
  const normalized = normalizeNullableText(value, fieldName, 2048);

  if (normalized === null) {
    if (required) {
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} is required.`);
    }

    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch (error: unknown) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a valid URL.`, {
      cause: error,
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must use http or https.`);
  }

  return parsed.toString();
}

function normalizeTimezone(value: string): string {
  const normalized = normalizeRequiredText(value, 'timezone', 1, 64);

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
  } catch (error: unknown) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'timezone must be a valid IANA timezone.', {
      cause: error,
    });
  }

  return normalized;
}

function normalizeOfferCode(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (
    normalized.length < 2 ||
    normalized.length > 80 ||
    !OFFER_CODE_PATTERN.test(normalized)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'code must contain 2 to 80 lowercase letters, numbers, underscores, or hyphens.',
    );
  }

  return normalized;
}

function normalizeCountries(values: readonly string[]): readonly string[] {
  if (values.length > 250) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'countries cannot contain more than 250 values.');
  }

  const normalized = values.map((value) => value.trim().toUpperCase());

  if (normalized.some((value) => !COUNTRY_PATTERN.test(value))) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'countries must contain two-letter uppercase country codes.',
    );
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'countries cannot contain duplicate values.');
  }

  return Object.freeze(normalized);
}

function normalizeDevices(values: readonly unknown[]): readonly CatalogDevice[] {
  if (values.length < 1 || values.length > 3) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'devices must contain one to three values.');
  }

  const normalized = values.map((value): CatalogDevice => {
    if (value !== 'desktop' && value !== 'android' && value !== 'ios') {
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'devices contains an unsupported value.');
    }

    return value;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'devices cannot contain duplicate values.');
  }

  return Object.freeze(normalized);
}

function normalizeActiveDays(values: readonly number[]): readonly number[] {
  if (values.length < 1 || values.length > 7) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'activeDays must contain one to seven values.');
  }

  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 7)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'activeDays values must be integers from 1 to 7.');
  }

  if (new Set(values).size !== values.length) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'activeDays cannot contain duplicate values.');
  }

  return Object.freeze([...values].sort((left, right) => left - right));
}

function normalizeTime(value: string | null | undefined, fieldName: string): string | null {
  const normalized = normalizeNullableText(value, fieldName, 8);

  if (normalized !== null && !TIME_PATTERN.test(normalized)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must use HH:mm or HH:mm:ss.`);
  }

  return normalized;
}

function normalizeExpiry(value: string | null | undefined): string | null {
  const normalized = normalizeNullableText(value, 'expiresAt', 64);

  if (normalized === null) {
    return null;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'expiresAt must be a valid date and time.');
  }

  return date.toISOString();
}

function normalizePayout(
  amount: number | null | undefined,
  currency: string | null | undefined,
): { readonly amount: number | null; readonly currency: string | null } {
  const normalizedAmount = amount ?? null;
  const normalizedCurrency = currency?.trim().toUpperCase() ?? null;

  if (normalizedAmount === null && normalizedCurrency === null) {
    return Object.freeze({ amount: null, currency: null });
  }

  if (
    normalizedAmount === null ||
    normalizedCurrency === null ||
    !Number.isSafeInteger(normalizedAmount) ||
    normalizedAmount < 1 ||
    normalizedAmount > MAX_AMOUNT_MINOR ||
    !CURRENCY_PATTERN.test(normalizedCurrency)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'defaultPayoutAmountMinor and payoutCurrency must be provided together using a positive integer and three-letter currency code.',
    );
  }

  return Object.freeze({ amount: normalizedAmount, currency: normalizedCurrency });
}

function normalizeRedirectType(value: unknown): CatalogRedirectType {
  if (value !== '301' && value !== '302') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'redirectType must be 301 or 302.');
  }

  return value;
}

function normalizeReferrerMode(value: unknown): CatalogReferrerMode {
  if (value !== 'preserve' && value !== 'strip') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'referrerMode must be preserve or strip.');
  }

  return value;
}

function normalizeOfferStatus(value: unknown): CatalogOfferStatus {
  if (value !== 'draft' && value !== 'active' && value !== 'paused' && value !== 'archived') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is invalid.');
  }

  return value;
}

function normalizeNetworkStatus(value: unknown): CatalogNetworkStatus {
  if (value !== 'active' && value !== 'suspended' && value !== 'archived') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is invalid.');
  }

  return value;
}

function normalizePayoutType(value: unknown): CatalogPayoutType {
  if (value !== 'fixed_member' && value !== 'per_offer') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'payoutType is invalid.');
  }

  return value;
}

function normalizeManagerMembershipIds(values: readonly string[]): readonly string[] {
  const normalized = values.map((value) => normalizeUuid(value, 'Manager membership ID'));

  if (new Set(normalized).size !== normalized.length) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'managerMembershipIds cannot contain duplicate values.',
    );
  }

  return Object.freeze(normalized);
}

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId: string,
): CatalogRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    companyId,
  };
}

function hidePublisherCatalogDetails(
  snapshot: CoreCatalogSnapshot,
): CoreCatalogSnapshot {
  return Object.freeze({
    ...snapshot,
    summary: Object.freeze({
      ...snapshot.summary,
      publishers: 0,
    }),
    publishers: Object.freeze([]),
  });
}

function scopeCatalogSnapshotForManager(
  snapshot: CoreCatalogSnapshot,
  membershipId: string,
): CoreCatalogSnapshot {
  const offers = Object.freeze(
    snapshot.offers.filter((offer) => offer.managerMembershipIds.includes(membershipId)),
  );
  const networkIds = new Set(offers.map((offer) => offer.networkAccountId));
  const domainIds = new Set(
    offers.flatMap((offer) =>
      offer.trackingDomainId === null ? [] : [offer.trackingDomainId],
    ),
  );
  const providerIds = new Set(offers.map((offer) => offer.providerId));
  const networks = Object.freeze(
    snapshot.networks
      .filter((network) => networkIds.has(network.id))
      .map((network) =>
        Object.freeze({
          ...network,
          offerCount: offers.filter(
            (offer) =>
              offer.networkAccountId === network.id && offer.status !== 'archived',
          ).length,
        }),
      ),
  );
  const domains = Object.freeze(
    snapshot.domains
      .filter((domain) => domainIds.has(domain.id))
      .map((domain) =>
        Object.freeze({
          ...domain,
          offerCount: offers.filter(
            (offer) =>
              offer.trackingDomainId === domain.id && offer.status !== 'archived',
          ).length,
        }),
      ),
  );
  const providers = Object.freeze(
    snapshot.providers.filter((provider) => providerIds.has(provider.id)),
  );
  const managers = Object.freeze(
    snapshot.managers
      .filter((manager) => manager.membershipId === membershipId)
      .map((manager) =>
        Object.freeze({
          ...manager,
          offerCount: offers.filter((offer) => offer.status !== 'archived').length,
        }),
      ),
  );

  return Object.freeze({
    companyId: snapshot.companyId,
    summary: Object.freeze({
      domains: domains.filter((domain) => domain.status !== 'archived').length,
      networks: networks.filter((network) => network.status !== 'archived').length,
      offers: offers.filter((offer) => offer.status !== 'archived').length,
      managers: managers.length,
      publishers: 0,
    }),
    providers,
    domains,
    networks,
    offers,
    managers,
    publishers: Object.freeze([]),
  });
}

function assertCompanyRequestContext(identity: ResolvedApiIdentity, companyId: string): void {
  if (identity.requestedCompanyId === undefined) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_REQUIRED',
      400,
      'The x-company-id header is required for this operation.',
    );
  }

  if (identity.requestedCompanyId !== companyId) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_MISMATCH',
      400,
      'The x-company-id header must match the company route parameter.',
    );
  }
}

async function requireActiveCompany(
  repository: CatalogOperationsRepository,
  context: CatalogRepositoryContext,
  companyId: string,
): Promise<void> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  if (company.status !== 'active') {
    throw new ApiHttpError(
      'CATALOG_COMPANY_INACTIVE',
      409,
      'Catalog operations require an active company.',
    );
  }
}

function normalizeOfferInput(
  input: CreateCatalogOfferInput | UpdateCatalogOfferInput,
  networkAccountId: string,
  code: string,
  status: CatalogOfferStatus,
): NormalizedCatalogOfferWriteInput {
  const devices = normalizeDevices(input.devices);
  const desktopUrl = normalizeUrl(
    input.desktopUrl,
    'desktopUrl',
    devices.includes('desktop'),
  );
  const androidUrl = normalizeUrl(
    input.androidUrl,
    'androidUrl',
    devices.includes('android'),
  );
  const iosUrl = normalizeUrl(input.iosUrl, 'iosUrl', devices.includes('ios'));
  const destinationUrl = desktopUrl ?? androidUrl ?? iosUrl;

  if (destinationUrl === null) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'At least one destination URL is required.');
  }

  const activeStartTime = normalizeTime(input.activeStartTime, 'activeStartTime');
  const activeEndTime = normalizeTime(input.activeEndTime, 'activeEndTime');

  if ((activeStartTime === null) !== (activeEndTime === null)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'activeStartTime and activeEndTime must be provided together.',
    );
  }

  if (
    activeStartTime !== null &&
    activeEndTime !== null &&
    activeStartTime >= activeEndTime
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'activeStartTime must be earlier than activeEndTime.',
    );
  }

  const payout = normalizePayout(
    input.defaultPayoutAmountMinor,
    input.payoutCurrency,
  );

  return Object.freeze({
    networkAccountId,
    trackingDomainId: normalizeUuid(input.trackingDomainId, 'Tracking domain ID'),
    code,
    externalOfferId: normalizeNullableText(input.externalOfferId, 'externalOfferId', 255),
    name: normalizeRequiredText(input.name, 'name', 2, 160),
    description: normalizeNullableText(input.description, 'description', 4000),
    destinationUrl,
    status,
    countries: normalizeCountries(input.countries),
    devices,
    desktopUrl,
    androidUrl,
    iosUrl,
    redirectType: normalizeRedirectType(input.redirectType),
    referrerMode: normalizeReferrerMode(input.referrerMode),
    defaultPayoutAmountMinor: payout.amount,
    payoutCurrency: payout.currency,
    timezone: normalizeTimezone(input.timezone),
    activeDays: normalizeActiveDays(input.activeDays),
    activeStartTime,
    activeEndTime,
    proxyEnabled: input.proxyEnabled,
    expiresAt: normalizeExpiry(input.expiresAt),
    duplicateAllowed: input.duplicateAllowed,
    managerMembershipIds: normalizeManagerMembershipIds(input.managerMembershipIds),
  });
}

function normalizeTrackingParameter(value: string | null | undefined): string | null {
  const normalized = normalizeNullableText(value, 'trackingParameter', 120);

  if (normalized !== null && !TRACKING_PARAMETER_PATTERN.test(normalized)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'trackingParameter may only contain letters, numbers, dots, underscores, or hyphens.',
    );
  }

  return normalized;
}

function normalizeNetworkInput(
  input: CreateCatalogNetworkInput | UpdateCatalogNetworkInput,
  providerId: string,
  status: CatalogNetworkStatus,
): NormalizedCatalogNetworkWriteInput {
  return Object.freeze({
    providerId,
    name: normalizeRequiredText(input.name, 'name', 2, 160),
    externalAccountId: normalizeNullableText(input.externalAccountId, 'externalAccountId', 255),
    status,
    trackingParameter: normalizeTrackingParameter(input.trackingParameter),
    postbackUrl: normalizeUrl(input.postbackUrl, 'postbackUrl', false),
    duplicateAllowed: input.duplicateAllowed,
  });
}

function validateOfferReferences(
  snapshot: CoreCatalogSnapshot,
  input: NormalizedCatalogOfferWriteInput,
): void {
  const account = snapshot.networks.find((item) => item.id === input.networkAccountId);

  if (account?.status !== 'active') {
    throw new ApiHttpError(
      'CATALOG_NETWORK_INVALID',
      409,
      'The offer requires an active network from the selected company.',
    );
  }

  const domain = snapshot.domains.find((item) => item.id === input.trackingDomainId);

  if (domain?.status !== 'active') {
    throw new ApiHttpError(
      'CATALOG_DOMAIN_INVALID',
      409,
      'The offer requires an active verified tracking domain.',
    );
  }

  const eligibleManagerIds = new Set(
    snapshot.managers
      .filter(
        (manager) =>
          manager.membershipStatus === 'active' && manager.userStatus === 'active',
      )
      .map((manager) => manager.membershipId),
  );

  if (input.managerMembershipIds.some((membershipId) => !eligibleManagerIds.has(membershipId))) {
    throw new ApiHttpError(
      'CATALOG_MANAGER_INVALID',
      409,
      'Offers can only be assigned to active Manager memberships.',
    );
  }
}

export function createCatalogOperationsService(
  repository: CatalogOperationsRepository,
): CatalogOperationsService {
  return Object.freeze<CatalogOperationsService>({
    async getSnapshot(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(repository, context, companyId);

      const snapshot = await repository.getSnapshot(context, companyId);

      if (identity.companyMembership?.role === 'manager') {
        return scopeCatalogSnapshotForManager(
          snapshot,
          identity.companyMembership.membershipId,
        );
      }

      return hidePublisherCatalogDetails(snapshot);
    },

    async createOffer(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(repository, context, companyId);
      const snapshot = await repository.getSnapshot(context, companyId);
      const normalized = normalizeOfferInput(
        input,
        normalizeUuid(input.networkAccountId, 'Network account ID'),
        normalizeOfferCode(input.code),
        input.status === undefined ? 'draft' : normalizeOfferStatus(input.status),
      );

      validateOfferReferences(snapshot, normalized);

      const created = await repository.createOffer(context, companyId, normalized);

      if (created === undefined) {
        throw new ApiHttpError(
          'CATALOG_OFFER_CONFLICT',
          409,
          'An offer with this code or external network identifier already exists.',
        );
      }

      return created;
    },

    async updateOffer(identity, requestId, companyIdValue, offerIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const offerId = normalizeUuid(offerIdValue, 'Offer ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(repository, context, companyId);
      const snapshot = await repository.getSnapshot(context, companyId);
      const current = snapshot.offers.find((offer) => offer.id === offerId);

      if (current === undefined) {
        throw new ApiHttpError('CATALOG_OFFER_NOT_FOUND', 404, 'The requested offer was not found.');
      }

      if (current.status === 'archived') {
        throw new ApiHttpError('CATALOG_OFFER_ARCHIVED', 409, 'An archived offer is immutable.');
      }

      const normalized = normalizeOfferInput(
        input,
        current.networkAccountId,
        current.code,
        normalizeOfferStatus(input.status),
      );

      validateOfferReferences(snapshot, normalized);

      const updated = await repository.updateOffer(context, companyId, offerId, normalized);

      if (updated === undefined) {
        throw new ApiHttpError('CATALOG_OFFER_NOT_FOUND', 404, 'The requested offer was not found.');
      }

      return updated;
    },

    async createNetwork(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(repository, context, companyId);
      const snapshot = await repository.getSnapshot(context, companyId);
      const providerId = normalizeUuid(input.providerId, 'Provider ID');
      const provider = snapshot.providers.find((item) => item.id === providerId);

      if (provider?.status !== 'active') {
        throw new ApiHttpError(
          'CATALOG_PROVIDER_INVALID',
          409,
          'The selected network provider is unavailable.',
        );
      }

      const normalized = normalizeNetworkInput(input, providerId, 'active');
      const created = await repository.createNetwork(context, companyId, normalized);

      if (created === undefined) {
        throw new ApiHttpError(
          'CATALOG_NETWORK_CONFLICT',
          409,
          'This network account already exists or the provider is unavailable.',
        );
      }

      return created;
    },

    async updateNetwork(identity, requestId, companyIdValue, accountIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const accountId = normalizeUuid(accountIdValue, 'Network account ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(repository, context, companyId);
      const snapshot = await repository.getSnapshot(context, companyId);
      const current = snapshot.networks.find((network) => network.id === accountId);

      if (current === undefined) {
        throw new ApiHttpError('CATALOG_NETWORK_NOT_FOUND', 404, 'The network was not found.');
      }

      if (current.status === 'archived') {
        throw new ApiHttpError('CATALOG_NETWORK_ARCHIVED', 409, 'An archived network is immutable.');
      }

      const normalized = normalizeNetworkInput(
        input,
        current.providerId,
        normalizeNetworkStatus(input.status),
      );
      const updated = await repository.updateNetwork(context, companyId, accountId, normalized);

      if (updated === undefined) {
        throw new ApiHttpError('CATALOG_NETWORK_NOT_FOUND', 404, 'The network was not found.');
      }

      return updated;
    },

    async updatePublisher(identity, requestId, companyIdValue, membershipIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const membershipId = normalizeUuid(membershipIdValue, 'Membership ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['manager']);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(repository, context, companyId);

      const normalized: NormalizedCatalogPublisherWriteInput = Object.freeze({
        timezone: normalizeTimezone(input.timezone),
        payoutType: normalizePayoutType(input.payoutType),
        postbackUrl: normalizeUrl(input.postbackUrl, 'postbackUrl', false),
        emailNotificationsEnabled: input.emailNotificationsEnabled,
      });
      const updated = await repository.updatePublisher(
        context,
        companyId,
        membershipId,
        normalized,
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'CATALOG_PUBLISHER_NOT_FOUND',
          404,
          'The Publisher membership was not found.',
        );
      }

      return updated;
    },
  });
}
