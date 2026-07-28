import { assertCompanyRole, isPlatformSuperAdmin } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { FinalOperationsRepository } from './final-operations.repository.js';
import type {
  AccountProfileRecord,
  BillingInvoiceRecord,
  ClickLogInput,
  ClickLogRecord,
  ConversionLogInput,
  ConversionLogRecord,
  CreateManualConversionInput,
  CreateManualConversionRequest,
  FinalOperationsRepositoryContext,
  FinalOperationsScope,
  ManualConversionRecord,
  OperationalDevice,
  OperationalReviewStatus,
  PerformanceReportDimension,
  PerformanceReportInput,
  PerformanceReportRow,
  SessionLogInput,
  SessionLogRecord,
  UpdateAccountProfileInput,
  UserAgentLogInput,
  UserAgentLogRecord,
} from './final-operations.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PUBLIC_CLICK_ID_PATTERN = /^clk_[a-f0-9]{32}$/u;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const DIMENSION_STATUS_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_LIMIT = 500;

type CommonFilterInput = Readonly<{
  from?: string;
  to?: string;
  search?: string;
  offerId?: string;
  networkAccountId?: string;
  ownerMembershipId?: string;
  countryCode?: string;
  device?: string;
}>;

type NormalizedCommonFilters = Readonly<{
  from?: string;
  to?: string;
  search?: string;
  offerId?: string;
  networkAccountId?: string;
  ownerMembershipId?: string;
  countryCode?: string;
  device?: OperationalDevice;
}>;

export interface FinalOperationsService {
  listPerformanceReport(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    dimension: string,
    input: Omit<PerformanceReportInput, 'limit'> & {
      readonly limit?: number;
    },
  ): Promise<readonly PerformanceReportRow[]>;

  listClicks(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: Omit<ClickLogInput, 'limit'> & {
      readonly limit?: number;
    },
  ): Promise<readonly ClickLogRecord[]>;

  listConversions(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: Omit<ConversionLogInput, 'limit' | 'conversionStatus'> & {
      readonly conversionStatus?: string;
      readonly limit?: number;
    },
  ): Promise<readonly ConversionLogRecord[]>;

  listSessions(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: Omit<SessionLogInput, 'limit'> & {
      readonly limit?: number;
    },
  ): Promise<readonly SessionLogRecord[]>;

  listUserAgents(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: Omit<UserAgentLogInput, 'limit'> & {
      readonly limit?: number;
    },
  ): Promise<readonly UserAgentLogRecord[]>;

  getAccountProfile(
    identity: ResolvedApiIdentity,
    requestId: string,
  ): Promise<AccountProfileRecord>;

  updateAccountProfile(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: UpdateAccountProfileInput,
  ): Promise<AccountProfileRecord>;

  listBillingInvoices(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    limit?: number,
  ): Promise<readonly BillingInvoiceRecord[]>;

  createManualConversion(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateManualConversionRequest,
  ): Promise<ManualConversionRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!UUID_PATTERN.test(normalized)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalized;
}

function normalizeRequestId(value: string): string {
  const normalized = value.trim();

  if (normalized.length < 1 || normalized.length > 255) {
    throw new Error('API request ID is invalid.');
  }

  return normalized;
}

function normalizeLimit(value: number | undefined, fallback = 200): number {
  const normalized = value ?? fallback;

  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_LIMIT) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `limit must be a whole number between 1 and ${String(MAX_LIMIT)}.`,
    );
  }

  return normalized;
}

function normalizeTimestamp(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `${fieldName} must be a valid date and time.`,
    );
  }

  return timestamp.toISOString();
}

function normalizeRange(input: { readonly from?: string; readonly to?: string }): Readonly<{
  from?: string;
  to?: string;
}> {
  const from = normalizeTimestamp(input.from, 'from');
  const to = normalizeTimestamp(input.to, 'to');

  if (
    from !== undefined &&
    to !== undefined &&
    new Date(from).getTime() >= new Date(to).getTime()
  ) {
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'from must be earlier than to.');
  }

  if (
    from !== undefined &&
    to !== undefined &&
    new Date(to).getTime() - new Date(from).getTime() > MAX_RANGE_MS
  ) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      'The selected range cannot exceed 366 days.',
    );
  }

  return Object.freeze({
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  });
}

function normalizeOptionalUuid(value: string | undefined, fieldName: string): string | undefined {
  return value === undefined || value.trim().length === 0
    ? undefined
    : normalizeUuid(value, fieldName);
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/gu, ' ');

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > 160) {
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'search cannot exceed 160 characters.');
  }

  return normalized;
}

function normalizeCountryCode(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (!COUNTRY_CODE_PATTERN.test(normalized)) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      'countryCode must use a two-letter country code.',
    );
  }

  return normalized;
}

function normalizeDevice(value: string | undefined): OperationalDevice | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  switch (value) {
    case 'desktop':
    case 'mobile':
    case 'tablet':
    case 'other':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'device must be desktop, mobile, tablet, or other.',
      );
  }
}

function normalizeReviewStatus(value: string | undefined): OperationalReviewStatus | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  switch (value) {
    case 'approved':
    case 'rejected':
    case 'unchecked':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be approved, rejected, or unchecked.',
      );
  }
}

function normalizeConversionStatus(
  value: string | undefined,
): ConversionLogInput['conversionStatus'] {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  switch (value) {
    case 'pending':
    case 'approved':
    case 'rejected':
    case 'reversed':
      return value;
    default:
      throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'conversionStatus is unsupported.');
  }
}

function normalizeDimensionStatus(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (!DIMENSION_STATUS_PATTERN.test(normalized)) {
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'dimensionStatus is invalid.');
  }

  return normalized;
}

function normalizeReportDimension(value: string): PerformanceReportDimension {
  switch (value) {
    case 'networks':
    case 'offers':
    case 'managers':
    case 'publishers':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_PATH_PARAMETER',
        400,
        'dimension must be networks, offers, managers, or publishers.',
      );
  }
}

function createContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): FinalOperationsRepositoryContext {
  return Object.freeze({
    actorUserId: identity.actor.userId,
    requestId: normalizeRequestId(requestId),
    ...(companyId !== undefined ? { companyId } : {}),
  });
}

function createScope(identity: ResolvedApiIdentity): FinalOperationsScope {
  if (isPlatformSuperAdmin(identity.subject)) {
    return Object.freeze({});
  }

  if (identity.companyMembership?.role === 'publisher') {
    return Object.freeze({
      ownerUserId: identity.actor.userId,
    });
  }

  if (identity.companyMembership?.role === 'manager') {
    return Object.freeze({
      managerMembershipId: identity.companyMembership.membershipId,
    });
  }

  return Object.freeze({});
}

function assertPublisherReportDimension(
  identity: ResolvedApiIdentity,
  dimension: PerformanceReportDimension,
): void {
  if (identity.companyMembership?.role === 'publisher' && dimension !== 'offers') {
    throw new ApiHttpError(
      'PUBLISHER_REPORT_DIMENSION_FORBIDDEN',
      403,
      'Publishers can access only their own Offer performance report.',
    );
  }
}

function assertPublisherOwnerFilter(
  identity: ResolvedApiIdentity,
  ownerMembershipId: string | undefined,
): void {
  const membership = identity.companyMembership;

  if (
    membership?.role === 'publisher' &&
    ownerMembershipId !== undefined &&
    ownerMembershipId !== membership.membershipId
  ) {
    throw new ApiHttpError(
      'PUBLISHER_OWNER_FILTER_FORBIDDEN',
      403,
      'Publishers cannot request logs or reports for another membership.',
    );
  }
}

function assertReadAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
    'publisher',
  ]);
}

function assertOperationsAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
  ]);
}

function assertBillingAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
}

function normalizeCommonFilters(input: CommonFilterInput): NormalizedCommonFilters {
  const range = normalizeRange(input);
  const search = normalizeSearch(input.search);
  const offerId = normalizeOptionalUuid(input.offerId, 'offerId');
  const networkAccountId = normalizeOptionalUuid(input.networkAccountId, 'networkAccountId');
  const ownerMembershipId = normalizeOptionalUuid(input.ownerMembershipId, 'ownerMembershipId');
  const countryCode = normalizeCountryCode(input.countryCode);
  const device = normalizeDevice(input.device);

  return Object.freeze({
    ...range,
    ...(search !== undefined ? { search } : {}),
    ...(offerId !== undefined ? { offerId } : {}),
    ...(networkAccountId !== undefined ? { networkAccountId } : {}),
    ...(ownerMembershipId !== undefined ? { ownerMembershipId } : {}),
    ...(countryCode !== undefined ? { countryCode } : {}),
    ...(device !== undefined ? { device } : {}),
  });
}

function normalizeDisplayName(value: string | null): string | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/gu, ' ');

  if (normalized.length > 120) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'displayName cannot exceed 120 characters.',
    );
  }

  return normalized;
}

function normalizeTimezone(value: string): string {
  const normalized = value.trim();

  if (normalized.length < 1 || normalized.length > 64) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'timezone must contain 1 to 64 characters.',
    );
  }

  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
    }).format();
  } catch {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'timezone must be a valid IANA timezone.');
  }

  return normalized;
}

function normalizeManualConversionInput(
  input: CreateManualConversionRequest,
): CreateManualConversionInput {
  const publicClickId = input.publicClickId.trim().toLowerCase();

  if (!PUBLIC_CLICK_ID_PATTERN.test(publicClickId)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'publicClickId must be a valid Publisher Tracker click ID.',
    );
  }

  let status: CreateManualConversionInput['status'];

  switch (input.status) {
    case 'pending':
    case 'approved':
    case 'rejected':
      status = input.status;
      break;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be pending, approved, or rejected.',
      );
  }

  const revenueAmountMinor = input.revenueAmountMinor ?? null;
  const revenueCurrency =
    input.revenueCurrency === undefined || input.revenueCurrency === null
      ? null
      : input.revenueCurrency.trim().toUpperCase();

  if ((revenueAmountMinor === null) !== (revenueCurrency === null)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'revenueAmountMinor and revenueCurrency must be provided together.',
    );
  }

  if (
    revenueAmountMinor !== null &&
    (!Number.isSafeInteger(revenueAmountMinor) || revenueAmountMinor < 0)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'revenueAmountMinor must be a non-negative whole number.',
    );
  }

  if (revenueCurrency !== null && !CURRENCY_PATTERN.test(revenueCurrency)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'revenueCurrency must be a three-letter currency code.',
    );
  }

  return Object.freeze({
    publicClickId,
    status,
    ...(revenueAmountMinor !== null && revenueCurrency !== null
      ? {
          revenueAmountMinor,
          revenueCurrency,
        }
      : {}),
  });
}

export function createFinalOperationsService(
  repository: FinalOperationsRepository,
): FinalOperationsService {
  return Object.freeze<FinalOperationsService>({
    async listPerformanceReport(identity, requestId, companyIdValue, dimensionValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const dimension = normalizeReportDimension(dimensionValue);
      const filters = normalizeCommonFilters(input);
      const status = normalizeDimensionStatus(input.status);

      assertReadAccess(identity, companyId);
      assertPublisherReportDimension(identity, dimension);
      assertPublisherOwnerFilter(identity, filters.ownerMembershipId);

      return repository.listPerformanceReport(
        createContext(identity, requestId, companyId),
        companyId,
        dimension,
        {
          ...filters,
          ...(status !== undefined ? { status } : {}),
          limit: normalizeLimit(input.limit, 250),
        },
        createScope(identity),
      );
    },

    async listClicks(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const filters = normalizeCommonFilters(input);
      const status = normalizeReviewStatus(input.status);

      assertReadAccess(identity, companyId);
      assertPublisherOwnerFilter(identity, filters.ownerMembershipId);

      return repository.listClicks(
        createContext(identity, requestId, companyId),
        companyId,
        {
          ...filters,
          ...(status !== undefined ? { status } : {}),
          limit: normalizeLimit(input.limit),
        },
        createScope(identity),
      );
    },

    async listConversions(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const filters = normalizeCommonFilters(input);
      const status = normalizeReviewStatus(input.status);
      const conversionStatus = normalizeConversionStatus(input.conversionStatus);

      assertReadAccess(identity, companyId);
      assertPublisherOwnerFilter(identity, filters.ownerMembershipId);

      return repository.listConversions(
        createContext(identity, requestId, companyId),
        companyId,
        {
          ...filters,
          ...(status !== undefined ? { status } : {}),
          ...(conversionStatus !== undefined ? { conversionStatus } : {}),
          limit: normalizeLimit(input.limit),
        },
        createScope(identity),
      );
    },

    async listSessions(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const filters = normalizeCommonFilters(input);

      assertReadAccess(identity, companyId);
      assertPublisherOwnerFilter(identity, filters.ownerMembershipId);

      return repository.listSessions(
        createContext(identity, requestId, companyId),
        companyId,
        {
          ...filters,
          limit: normalizeLimit(input.limit),
        },
        createScope(identity),
      );
    },

    async listUserAgents(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const filters = normalizeCommonFilters(input);
      const status = normalizeReviewStatus(input.status);

      assertReadAccess(identity, companyId);
      assertPublisherOwnerFilter(identity, filters.ownerMembershipId);

      return repository.listUserAgents(
        createContext(identity, requestId, companyId),
        companyId,
        {
          ...filters,
          ...(status !== undefined ? { status } : {}),
          limit: normalizeLimit(input.limit),
        },
        createScope(identity),
      );
    },

    async getAccountProfile(identity, requestId) {
      const profile = await repository.getAccountProfile(
        createContext(identity, requestId),
        identity.actor.userId,
      );

      if (profile === undefined) {
        throw new ApiHttpError(
          'ACCOUNT_PROFILE_NOT_FOUND',
          404,
          'The account profile was not found.',
        );
      }

      return profile;
    },

    async updateAccountProfile(identity, requestId, input) {
      const profile = await repository.updateAccountProfile(
        createContext(identity, requestId),
        identity.actor.userId,
        {
          displayName: normalizeDisplayName(input.displayName),
          timezone: normalizeTimezone(input.timezone),
        },
      );

      if (profile === undefined) {
        throw new ApiHttpError(
          'ACCOUNT_PROFILE_NOT_FOUND',
          404,
          'The account profile was not found.',
        );
      }

      return profile;
    },

    async listBillingInvoices(identity, requestId, companyIdValue, limit) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertBillingAccess(identity, companyId);

      return repository.listBillingInvoices(
        createContext(identity, requestId, companyId),
        companyId,
        normalizeLimit(limit, 100),
      );
    },

    async createManualConversion(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertOperationsAccess(identity, companyId);

      const conversion = await repository.createManualConversion(
        createContext(identity, requestId, companyId),
        companyId,
        normalizeManualConversionInput(input),
        createScope(identity),
      );

      if (conversion === undefined) {
        throw new ApiHttpError(
          'MANUAL_CONVERSION_CONFLICT',
          409,
          'The click is unavailable, ineligible, missing payout configuration, or already has a manual conversion.',
        );
      }

      return conversion;
    },
  });
}
