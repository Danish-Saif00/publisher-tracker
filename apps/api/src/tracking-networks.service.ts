import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';

import {
  assertPlatformSuperAdmin,
  assertTenantCompanyRole,
  isPlatformSuperAdmin,
} from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import {
  CustomDomainProviderError,
  type CustomDomainProvider,
  type CustomDomainProviderRecord,
} from './custom-domain-provider.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { TrackingNetworksRepository } from './tracking-networks.repository.js';
import type { TrackingDomainVerifier } from './tracking-domain-verifier.js';
import type {
  CreateNetworkAccountInput,
  CreateNetworkProviderInput,
  CreateTrackingDomainInput,
  ListPlatformTrackingDomainsInput,
  NetworkAccountDependencySummary,
  NetworkAccountRecord,
  NetworkAccountStatus,
  NetworkAccountWriteInput,
  NetworkProviderIntegrationInput,
  NetworkProviderRecord,
  NetworkProviderStatus,
  NetworkProviderWriteInput,
  TrackingDomainProvisioningWriteInput,
  TrackingDomainRecord,
  TrackingDomainStatus,
  TrackingDomainWriteInput,
  TrackingNetworkCompanyRecord,
  TrackingNetworkRepositoryContext,
  UpdateNetworkAccountInput,
  UpdateNetworkProviderInput,
  UpdatePlatformTrackingDomainStatusInput,
  UpdateTrackingDomainInput,
} from './tracking-networks.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PROVIDER_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const TRACKING_PARAMETER_PATTERN = /^[A-Za-z0-9_.-]+$/;
const POSTBACK_TOKEN_RESERVED_CHARACTERS = new Set(['&', '=', '#', '?']);

function hasUnsafeProviderPostbackTokenCharacter(value: string): boolean {
  for (const character of value) {
    const codeUnit = character.charCodeAt(0);

    if (
      codeUnit <= 0x1f ||
      codeUnit === 0x7f ||
      POSTBACK_TOKEN_RESERVED_CHARACTERS.has(character)
    ) {
      return true;
    }
  }

  return false;
}

export interface TrackingNetworksServiceOptions {
  readonly now?: () => Date;
  readonly createVerificationToken?: () => string;
  readonly customDomainProvider?: CustomDomainProvider;
  readonly trackingDomainVerifier?: TrackingDomainVerifier;
}

export interface TrackingNetworksService {
  createTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateTrackingDomainInput,
  ): Promise<TrackingDomainRecord>;

  listCompanyTrackingDomains(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly TrackingDomainRecord[]>;

  getCompanyTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    domainId: string,
  ): Promise<TrackingDomainRecord>;

  updateCompanyTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    domainId: string,
    input: UpdateTrackingDomainInput,
  ): Promise<TrackingDomainRecord>;

  listPlatformTrackingDomains(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: ListPlatformTrackingDomainsInput,
  ): Promise<readonly TrackingDomainRecord[]>;

  updatePlatformTrackingDomainStatus(
    identity: ResolvedApiIdentity,
    requestId: string,
    domainId: string,
    input: UpdatePlatformTrackingDomainStatusInput,
  ): Promise<TrackingDomainRecord>;

  adoptPlatformTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    domainId: string,
  ): Promise<TrackingDomainRecord>;

  reconcilePlatformTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    domainId: string,
  ): Promise<TrackingDomainRecord>;

  disconnectPlatformTrackingDomain(
    identity: ResolvedApiIdentity,
    requestId: string,
    domainId: string,
  ): Promise<TrackingDomainRecord>;

  createCompanyNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  listCompanyNetworkProviders(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly NetworkProviderRecord[]>;

  getCompanyNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    providerId: string,
  ): Promise<NetworkProviderRecord>;

  updateCompanyNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    providerId: string,
    input: UpdateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  createNetworkAccount(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateNetworkAccountInput,
  ): Promise<NetworkAccountRecord>;

  listCompanyNetworkAccounts(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly NetworkAccountRecord[]>;

  getCompanyNetworkAccount(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    accountId: string,
  ): Promise<NetworkAccountRecord>;

  updateCompanyNetworkAccount(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    accountId: string,
    input: UpdateNetworkAccountInput,
  ): Promise<NetworkAccountRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeHostname(value: string): string {
  const normalizedValue = value.trim().toLowerCase().replace(/\.$/, '');

  if (
    normalizedValue.length < 4 ||
    normalizedValue.length > 253 ||
    !HOSTNAME_PATTERN.test(normalizedValue) ||
    isIP(normalizedValue) !== 0
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'hostname must be a valid lowercase fully qualified domain name.',
    );
  }

  return normalizedValue;
}

function normalizeManagedHostname(value: string): string {
  const hostname = normalizeHostname(value);

  if (hostname.split('.').length < 3) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'hostname must be a dedicated tracking subdomain such as track.example.com.',
    );
  }

  return hostname;
}

function normalizeProviderCode(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 2 ||
    normalizedValue.length > 80 ||
    !PROVIDER_CODE_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Provider code must contain 2 to 80 lowercase letters, numbers, or single underscores.',
    );
  }

  return normalizedValue;
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length < minimumLength || normalizedValue.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain ${String(minimumLength)} to ${String(maximumLength)} characters.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalNullableText(
  value: string | null | undefined,
  fieldName: string,
  maximumLength: number,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain 1 to ${String(maximumLength)} characters or be null.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalUrl(
  value: string | null | undefined,
  fieldName: string,
): string | null | undefined {
  const normalizedValue = normalizeOptionalNullableText(value, fieldName, 2048);

  if (normalizedValue === undefined || normalizedValue === null) {
    return normalizedValue;
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch (error: unknown) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a valid URL.`, {
      cause: error,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must use the http or https protocol.`,
    );
  }

  return url.toString();
}

function normalizeProviderTrackingParameter(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (
    normalizedValue.length < 1 ||
    normalizedValue.length > 120 ||
    !TRACKING_PARAMETER_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'defaultTrackingParameter must contain 1 to 120 letters, numbers, dots, underscores, or hyphens, or be null.',
    );
  }

  return normalizedValue;
}

function normalizeProviderPostbackToken(value: string | null, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (
    normalizedValue.length < 1 ||
    normalizedValue.length > 240 ||
    hasUnsafeProviderPostbackTokenCharacter(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain 1 to 240 safe token characters without &, =, #, ?, or control characters, or be null.`,
    );
  }

  return normalizedValue;
}

function normalizeProviderIntegration(
  input: NetworkProviderIntegrationInput | undefined,
  fallback?: NetworkProviderRecord['integration'],
): NetworkProviderIntegrationInput {
  const integration = input ??
    fallback ?? {
      defaultTrackingParameter: null,
      postbackClickIdToken: null,
      postbackConversionIdToken: null,
      postbackRevenueAmountToken: null,
      postbackRevenueCurrencyToken: null,
      postbackConversionStatus: 'approved',
    };

  const postbackRevenueAmountToken = normalizeProviderPostbackToken(
    integration.postbackRevenueAmountToken,
    'postbackRevenueAmountToken',
  );
  const postbackRevenueCurrencyToken = normalizeProviderPostbackToken(
    integration.postbackRevenueCurrencyToken,
    'postbackRevenueCurrencyToken',
  );

  if ((postbackRevenueAmountToken === null) !== (postbackRevenueCurrencyToken === null)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Revenue amount and currency tokens must be configured together or both be null.',
    );
  }

  return Object.freeze({
    defaultTrackingParameter: normalizeProviderTrackingParameter(
      integration.defaultTrackingParameter,
    ),
    postbackClickIdToken: normalizeProviderPostbackToken(
      integration.postbackClickIdToken,
      'postbackClickIdToken',
    ),
    postbackConversionIdToken: normalizeProviderPostbackToken(
      integration.postbackConversionIdToken,
      'postbackConversionIdToken',
    ),
    postbackRevenueAmountToken,
    postbackRevenueCurrencyToken,
    postbackConversionStatus: integration.postbackConversionStatus,
  });
}

function normalizeTrackingDomainStatus(value: TrackingDomainStatus): TrackingDomainStatus {
  switch (value) {
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'Tracking-domain status is invalid.');
  }
}

function normalizeTenantTrackingDomainStatus(
  value: 'active' | 'suspended' | 'archived',
): 'active' | 'suspended' | 'archived' {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'Tenant tracking-domain status must be active, suspended, or archived.',
      );
  }
}

function normalizeNetworkProviderStatus(
  value: NetworkProviderStatus,
  code: 'INVALID_QUERY_PARAMETER' | 'INVALID_REQUEST_BODY',
): NetworkProviderStatus {
  switch (value) {
    case 'active':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(code, 400, 'Network-provider status is invalid.');
  }
}

function normalizeNetworkAccountStatus(
  value: NetworkAccountStatus,
  code: 'INVALID_QUERY_PARAMETER' | 'INVALID_REQUEST_BODY',
): NetworkAccountStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(code, 400, 'Network-account status is invalid.');
  }
}

function normalizeVerificationToken(value: string): string {
  if (value.length < 32 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('The tracking-domain verification token generator returned an invalid value.');
  }

  return value;
}

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): TrackingNetworkRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    ...(companyId !== undefined
      ? {
          companyId,
        }
      : {}),
  };
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

function assertTrackingDomainManager(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRequestContext(identity, companyId);

  if (isPlatformSuperAdmin(identity.subject)) {
    assertPlatformSuperAdmin(identity.subject);
    return;
  }

  assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
  ]);
}

function resolveTrackingDomainProvisioningCompanyId(
  identity: ResolvedApiIdentity,
): string | undefined {
  if (isPlatformSuperAdmin(identity.subject)) {
    assertPlatformSuperAdmin(identity.subject);
    return undefined;
  }

  const companyId = identity.requestedCompanyId;

  if (companyId === undefined) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_REQUIRED',
      400,
      'The x-company-id header is required for company-managed domain provisioning.',
    );
  }

  assertTrackingDomainManager(identity, companyId);

  return companyId;
}

async function requireCompany(  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
): Promise<TrackingNetworkCompanyRecord> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  return company;
}

async function requireActiveCompany(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
): Promise<TrackingNetworkCompanyRecord> {
  const company = await requireCompany(repository, context, companyId);

  if (company.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_NETWORK_COMPANY_INACTIVE',
      409,
      'Tracking and network configuration requires an active company.',
    );
  }

  return company;
}

async function requireTrackingDomain(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  domainId: string,
  companyId?: string,
): Promise<TrackingDomainRecord> {
  const domain = await repository.getTrackingDomain(context, domainId, companyId);

  if (domain === undefined) {
    throw new ApiHttpError(
      'TRACKING_DOMAIN_NOT_FOUND',
      404,
      'The requested tracking domain was not found.',
    );
  }

  return domain;
}

async function requireCompanyNetworkProvider(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
  providerId: string,
): Promise<NetworkProviderRecord> {
  const provider = await repository.getCompanyNetworkProvider(context, companyId, providerId);

  if (provider === undefined) {
    throw new ApiHttpError(
      'NETWORK_PROVIDER_NOT_FOUND',
      404,
      'The requested network provider was not found.',
    );
  }

  return provider;
}

async function requireActiveCompanyNetworkProvider(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
  providerId: string,
): Promise<NetworkProviderRecord> {
  const provider = await requireCompanyNetworkProvider(repository, context, companyId, providerId);

  if (provider.status !== 'active') {
    throw new ApiHttpError(
      'NETWORK_PROVIDER_ARCHIVED',
      409,
      'An archived network provider cannot receive new accounts.',
    );
  }

  return provider;
}

async function requireCompanyNetworkAccount(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  companyId: string,
  accountId: string,
): Promise<NetworkAccountRecord> {
  const account = await repository.getNetworkAccount(context, companyId, accountId);

  if (account === undefined) {
    throw new ApiHttpError(
      'NETWORK_ACCOUNT_NOT_FOUND',
      404,
      'The requested network account was not found.',
    );
  }

  return account;
}

function trackingDomainsAreEquivalent(
  current: TrackingDomainRecord,
  next: TrackingDomainWriteInput,
): boolean {
  return (
    current.hostname === next.hostname &&
    current.status === next.status &&
    current.verificationToken === next.verificationToken &&
    current.verifiedAt === next.verifiedAt &&
    current.isPrimary === next.isPrimary
  );
}

function providersAreEquivalent(
  current: NetworkProviderRecord,
  next: NetworkProviderWriteInput,
): boolean {
  return (
    current.name === next.name &&
    current.status === next.status &&
    current.websiteUrl === next.websiteUrl &&
    current.documentationUrl === next.documentationUrl &&
    current.integration.defaultTrackingParameter === next.integration.defaultTrackingParameter &&
    current.integration.postbackClickIdToken === next.integration.postbackClickIdToken &&
    current.integration.postbackConversionIdToken === next.integration.postbackConversionIdToken &&
    current.integration.postbackRevenueAmountToken ===
      next.integration.postbackRevenueAmountToken &&
    current.integration.postbackRevenueCurrencyToken ===
      next.integration.postbackRevenueCurrencyToken &&
    current.integration.postbackConversionStatus === next.integration.postbackConversionStatus
  );
}

function accountsAreEquivalent(
  current: NetworkAccountRecord,
  next: NetworkAccountWriteInput,
): boolean {
  return (
    current.providerId === next.providerId &&
    current.name === next.name &&
    current.externalAccountId === next.externalAccountId &&
    current.status === next.status
  );
}

function hasNetworkAccountDependencies(summary: NetworkAccountDependencySummary): boolean {
  return (
    summary.offers > 0 ||
    summary.postbackEndpoints > 0 ||
    summary.trackingClicks > 0 ||
    summary.conversions > 0 ||
    summary.duplicateProtectionRules > 0
  );
}

function formatNetworkAccountDependencies(summary: NetworkAccountDependencySummary): string {
  return [
    `offers=${String(summary.offers)}`,
    `postbackEndpoints=${String(summary.postbackEndpoints)}`,
    `trackingClicks=${String(summary.trackingClicks)}`,
    `conversions=${String(summary.conversions)}`,
    `duplicateProtectionRules=${String(summary.duplicateProtectionRules)}`,
  ].join(', ');
}

function assertNetworkAccountTransition(
  currentStatus: NetworkAccountStatus,
  nextStatus: NetworkAccountStatus,
): void {
  if (currentStatus === 'archived') {
    throw new ApiHttpError(
      'NETWORK_ACCOUNT_ARCHIVED',
      409,
      'An archived network account is immutable.',
    );
  }

  const valid =
    currentStatus === nextStatus ||
    (currentStatus === 'active' && (nextStatus === 'suspended' || nextStatus === 'archived')) ||
    (currentStatus === 'suspended' && (nextStatus === 'active' || nextStatus === 'archived'));

  if (!valid) {
    throw new ApiHttpError(
      'NETWORK_ACCOUNT_STATUS_TRANSITION_INVALID',
      409,
      `A network account cannot transition from ${currentStatus} to ${nextStatus}.`,
    );
  }
}

function requireCustomDomainAutomation(options: TrackingNetworksServiceOptions): Readonly<{
  provider: CustomDomainProvider;
  verifier: TrackingDomainVerifier;
}> {
  if (options.customDomainProvider === undefined || options.trackingDomainVerifier === undefined) {
    throw new ApiHttpError(
      'CUSTOM_DOMAIN_AUTOMATION_NOT_CONFIGURED',
      503,
      'Custom-domain automation is not configured on the API service.',
    );
  }

  return Object.freeze({
    provider: options.customDomainProvider,
    verifier: options.trackingDomainVerifier,
  });
}

function createProvisioningWriteInput(
  current: TrackingDomainRecord,
  overrides: Partial<TrackingDomainProvisioningWriteInput>,
): TrackingDomainProvisioningWriteInput {
  return Object.freeze({
    provider: overrides.provider ?? current.provider,
    dnsTarget: overrides.dnsTarget === undefined ? current.dnsTarget : overrides.dnsTarget,
    status: overrides.status ?? current.status,
    verifiedAt: overrides.verifiedAt ?? current.verifiedAt,
    isPrimary: overrides.isPrimary ?? current.isPrimary,
    providerCustomDomainId:
      overrides.providerCustomDomainId === undefined
        ? current.providerCustomDomainId
        : overrides.providerCustomDomainId,
    providerVerificationStatus:
      overrides.providerVerificationStatus ?? current.providerVerificationStatus,
    provisioningStatus: overrides.provisioningStatus ?? current.provisioningStatus,
    ownershipVerifiedAt:
      overrides.ownershipVerifiedAt === undefined
        ? current.ownershipVerifiedAt
        : overrides.ownershipVerifiedAt,
    dnsVerifiedAt:
      overrides.dnsVerifiedAt === undefined ? current.dnsVerifiedAt : overrides.dnsVerifiedAt,
    tlsVerifiedAt:
      overrides.tlsVerifiedAt === undefined ? current.tlsVerifiedAt : overrides.tlsVerifiedAt,
    lastCheckedAt:
      overrides.lastCheckedAt === undefined ? current.lastCheckedAt : overrides.lastCheckedAt,
    lastErrorCode:
      overrides.lastErrorCode === undefined ? current.lastErrorCode : overrides.lastErrorCode,
    lastErrorMessage:
      overrides.lastErrorMessage === undefined
        ? current.lastErrorMessage
        : overrides.lastErrorMessage,
    disconnectedAt:
      overrides.disconnectedAt === undefined ? current.disconnectedAt : overrides.disconnectedAt,
  });
}

function sanitizeProvisioningErrorMessage(value: string): string {
  const normalizedValue = value.trim().replace(/\s+/gu, ' ');

  return normalizedValue.length === 0
    ? 'Custom-domain provisioning failed.'
    : normalizedValue.slice(0, 1_000);
}

function readProvisioningError(error: unknown): Readonly<{ code: string; message: string }> {
  if (error instanceof CustomDomainProviderError) {
    return Object.freeze({
      code: error.code,
      message: sanitizeProvisioningErrorMessage(error.message),
    });
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return Object.freeze({
      code: `DOMAIN_${error.code.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}`.slice(0, 120),
      message: sanitizeProvisioningErrorMessage(
        error instanceof Error ? error.message : 'Domain verification failed.',
      ),
    });
  }

  return Object.freeze({
    code: 'CUSTOM_DOMAIN_PROVISIONING_FAILED',
    message: sanitizeProvisioningErrorMessage(
      error instanceof Error ? error.message : 'Custom-domain provisioning failed.',
    ),
  });
}

export function createTrackingNetworksService(
  repository: TrackingNetworksRepository,
  options: TrackingNetworksServiceOptions = {},
): TrackingNetworksService {
  const getNow = options.now ?? (() => new Date());
  const createVerificationToken =
    options.createVerificationToken ?? (() => randomBytes(32).toString('base64url'));

  return Object.freeze<TrackingNetworksService>({
    async createTrackingDomain(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertTrackingDomainManager(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const domain = await repository.createTrackingDomain(context, companyId, {
        hostname: normalizeManagedHostname(input.hostname),
        status: 'pending_verification',
        verificationToken: normalizeVerificationToken(createVerificationToken()),
        verifiedAt: null,
        isPrimary: false,
        provider: 'render',
        providerVerificationStatus: 'unregistered',
        provisioningStatus: 'ownership_pending',
        dnsTarget: requireCustomDomainAutomation(options).provider.dnsTarget,
      });

      if (domain === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_HOSTNAME_CONFLICT',
          409,
          'This tracking hostname or verification token is already registered.',
        );
      }

      return domain;
    },

    async listCompanyTrackingDomains(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listCompanyTrackingDomains(context, companyId);
    },

    async getCompanyTrackingDomain(identity, requestId, companyIdValue, domainIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireTrackingDomain(repository, context, domainId, companyId);
    },

    async updateCompanyTrackingDomain(identity, requestId, companyIdValue, domainIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');

      assertTrackingDomainManager(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireTrackingDomain(repository, context, domainId, companyId);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_ARCHIVED',
          409,
          'An archived tracking domain is immutable.',
        );
      }

      if (
        input.hostname === undefined &&
        input.status === undefined &&
        input.isPrimary === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one tracking-domain field must be provided.',
        );
      }

      let hostname = current.hostname;
      let verificationToken = current.verificationToken;
      let verifiedAt = current.verifiedAt;
      let status: TrackingDomainStatus = current.status;
      let isPrimary = current.isPrimary;

      if (input.hostname !== undefined) {
        hostname = normalizeManagedHostname(input.hostname);

        if (hostname !== current.hostname) {
          if (
            current.provider === 'render' ||
            current.status !== 'pending_verification' ||
            current.ownershipVerifiedAt !== null ||
            current.providerCustomDomainId !== null
          ) {
            throw new ApiHttpError(
              'TRACKING_DOMAIN_HOSTNAME_LOCKED',
              409,
              'A dashboard-managed hostname is immutable. Disconnect an unused incorrect domain and add the correct hostname.',
            );
          }

          verificationToken = normalizeVerificationToken(createVerificationToken());
          verifiedAt = null;
          status = 'pending_verification';
          isPrimary = false;
        }
      }

      if (input.status !== undefined) {
        status = normalizeTenantTrackingDomainStatus(input.status);

        if (current.provider === 'render' && status === 'archived') {
          throw new ApiHttpError(
            'TRACKING_DOMAIN_DISCONNECT_REQUIRED',
            409,
            'A dashboard-managed domain must be disconnected through the provider workflow instead of archived directly.',
          );
        }

        isPrimary = false;
      }

      if (input.isPrimary !== undefined) {
        isPrimary = input.isPrimary;
      }

      if (isPrimary && (status !== 'active' || verifiedAt === null)) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNVERIFIED',
          409,
          'Only an active verified tracking domain can be primary.',
        );
      }

      const next = Object.freeze<TrackingDomainWriteInput>({
        hostname,
        status,
        verificationToken,
        verifiedAt,
        isPrimary,
        provider: current.provider,
        providerVerificationStatus: current.providerVerificationStatus,
        provisioningStatus: current.provisioningStatus,
        dnsTarget: current.dnsTarget,
      });

      if (trackingDomainsAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNCHANGED',
          409,
          'The tracking domain already contains the requested values.',
        );
      }

      const updated = await repository.updateTrackingDomain(
        context,
        current,
        next,
        'tracking_domain.updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UPDATE_CONFLICT',
          409,
          'The tracking domain changed or its hostname conflicted before this request completed.',
        );
      }

      return updated;
    },

    async listPlatformTrackingDomains(identity, requestId, input) {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listPlatformTrackingDomains(createRepositoryContext(identity, requestId), {
        ...(input.companyId !== undefined
          ? {
              companyId: normalizeUuid(input.companyId, 'Company ID'),
            }
          : {}),
        ...(input.status !== undefined
          ? {
              status: normalizeTrackingDomainStatus(input.status),
            }
          : {}),
      });
    },

    async updatePlatformTrackingDomainStatus(identity, requestId, domainIdValue, input) {
      assertPlatformSuperAdmin(identity.subject);

      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');
      const readContext = createRepositoryContext(identity, requestId);
      const current = await requireTrackingDomain(repository, readContext, domainId);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_ARCHIVED',
          409,
          'An archived tracking domain is immutable.',
        );
      }

      if (current.status === input.status) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNCHANGED',
          409,
          'The tracking domain already has the requested status.',
        );
      }

      if (current.provider === 'render' && input.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_DISCONNECT_REQUIRED',
          409,
          'A dashboard-managed domain must be disconnected through the provider workflow instead of archived directly.',
        );
      }

      const now = getNow().toISOString();
      if (
        input.status === 'active' &&
        current.provider === 'render' &&
        current.provisioningStatus !== 'active'
      ) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_NOT_READY',
          409,
          'A managed tracking domain can only activate after ownership, DNS, provider, and TLS verification.',
        );
      }

      const next = Object.freeze<TrackingDomainWriteInput>({
        hostname: current.hostname,
        status: input.status,
        verificationToken: current.verificationToken,
        verifiedAt: input.status === 'active' ? (current.verifiedAt ?? now) : current.verifiedAt,
        isPrimary: input.status === 'active' ? current.isPrimary : false,
        provider: current.provider,
        providerVerificationStatus: current.providerVerificationStatus,
        provisioningStatus: current.provisioningStatus,
        dnsTarget: current.dnsTarget,
      });

      const updated = await repository.updateTrackingDomain(
        createRepositoryContext(identity, requestId, current.companyId),
        current,
        next,
        input.status === 'active' ? 'tracking_domain.verified' : 'tracking_domain.status_updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UPDATE_CONFLICT',
          409,
          'The tracking domain changed before this request completed.',
        );
      }

      return updated;
    },

    async adoptPlatformTrackingDomain(identity, requestId, domainIdValue) {
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');
      const companyId = resolveTrackingDomainProvisioningCompanyId(identity);
      const automation = requireCustomDomainAutomation(options);
      const context = createRepositoryContext(identity, requestId, companyId);

      if (companyId !== undefined) {
        await requireActiveCompany(repository, context, companyId);
      }

      const current = await requireTrackingDomain(
        repository,
        context,
        domainId,
        companyId,
      );      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_ARCHIVED',
          409,
          'An archived tracking domain cannot be adopted for dashboard management.',
        );
      }

      if (current.provider === 'render') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNCHANGED',
          409,
          'This tracking domain is already dashboard managed.',
        );
      }

      const now = getNow().toISOString();
      const updated = await repository.updateTrackingDomainProvisioning(
        createRepositoryContext(identity, requestId, current.companyId),
        current,
        createProvisioningWriteInput(current, {
          provider: 'render',
          dnsTarget: automation.provider.dnsTarget,
          status: current.status === 'pending_verification' ? current.status : 'suspended',
          isPrimary: false,
          providerCustomDomainId: null,
          providerVerificationStatus: 'unregistered',
          provisioningStatus: 'ownership_pending',
          ownershipVerifiedAt: null,
          dnsVerifiedAt: null,
          tlsVerifiedAt: null,
          lastCheckedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          disconnectedAt: null,
        }),
        'tracking_domain.adopted_for_management',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UPDATE_CONFLICT',
          409,
          'The tracking domain changed before dashboard management was enabled.',
        );
      }

      return updated;
    },

    async reconcilePlatformTrackingDomain(identity, requestId, domainIdValue) {
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');
      const companyId = resolveTrackingDomainProvisioningCompanyId(identity);
      const automation = requireCustomDomainAutomation(options);
      const context = createRepositoryContext(identity, requestId, companyId);

      if (companyId !== undefined) {
        await requireActiveCompany(repository, context, companyId);
      }

      let current = await requireTrackingDomain(
        repository,
        context,
        domainId,
        companyId,
      );
      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_ARCHIVED',
          409,
          'An archived tracking domain cannot be provisioned.',
        );
      }

      if (current.provider !== 'render') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_MANUAL_PROVIDER',
          409,
          'This legacy manual domain is not managed by the dashboard provisioning workflow.',
        );
      }

      const now = getNow().toISOString();

      async function persist(
        overrides: Partial<TrackingDomainProvisioningWriteInput>,
        eventName: string,
      ): Promise<TrackingDomainRecord> {
        const updated = await repository.updateTrackingDomainProvisioning(
          createRepositoryContext(identity, requestId, current.companyId),
          current,
          createProvisioningWriteInput(current, overrides),
          eventName,
        );

        if (updated === undefined) {
          throw new ApiHttpError(
            'TRACKING_DOMAIN_UPDATE_CONFLICT',
            409,
            'The tracking domain changed before provisioning completed.',
          );
        }

        current = updated;
        return updated;
      }

      try {
        if (current.ownershipVerifiedAt === null) {
          const ownership = await automation.verifier.verifyOwnership(
            current.hostname,
            current.verificationToken,
          );

          if (!ownership.verified) {
            return await persist(
              {
                provisioningStatus: 'ownership_pending',
                lastCheckedAt: now,
                lastErrorCode: 'OWNERSHIP_TXT_NOT_FOUND',
                lastErrorMessage: `Publish ${current.ownershipRecordName} with the exact TXT value shown in the dashboard.`,
              },
              'tracking_domain.ownership_pending',
            );
          }

          await persist(
            {
              ownershipVerifiedAt: now,
              provisioningStatus: 'ownership_verified',
              lastCheckedAt: now,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
            'tracking_domain.ownership_verified',
          );
        }

        if (current.providerCustomDomainId === null) {
          await persist(
            {
              provisioningStatus: 'provider_pending',
              lastCheckedAt: now,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
            'tracking_domain.provider_pending',
          );

          let providerDomain: CustomDomainProviderRecord;

          try {
            providerDomain = await automation.provider.create(current.hostname);
          } catch (error: unknown) {
            if (error instanceof CustomDomainProviderError && error.statusCode === 409) {
              providerDomain = await automation.provider.retrieve(current.hostname);
            } else {
              throw error;
            }
          }

          await persist(
            {
              providerCustomDomainId: providerDomain.id,
              providerVerificationStatus: providerDomain.verificationStatus,
              provisioningStatus:
                providerDomain.verificationStatus === 'verified' ? 'tls_pending' : 'dns_pending',
              lastCheckedAt: now,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
            'tracking_domain.provider_registered',
          );
        }

        const cname = await automation.verifier.verifyCname(
          current.hostname,
          automation.provider.dnsTarget,
        );

        if (!cname.verified) {
          return await persist(
            {
              providerVerificationStatus: 'unverified',
              provisioningStatus: 'dns_pending',
              dnsVerifiedAt: null,
              tlsVerifiedAt: null,
              lastCheckedAt: now,
              lastErrorCode: 'CNAME_TARGET_MISMATCH',
              lastErrorMessage: `Point ${current.hostname} to ${automation.provider.dnsTarget} with a CNAME record and remove conflicting A, AAAA, or redirect records.`,
            },
            'tracking_domain.dns_pending',
          );
        }

        await persist(
          {
            dnsVerifiedAt: current.dnsVerifiedAt ?? now,
            provisioningStatus: 'tls_pending',
            lastCheckedAt: now,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
          'tracking_domain.dns_verified',
        );

        const providerReference = current.providerCustomDomainId ?? current.hostname;
        let providerDomain: CustomDomainProviderRecord;

        try {
          await automation.provider.verify(providerReference);
          providerDomain = await automation.provider.retrieve(providerReference);
        } catch (error: unknown) {
          if (error instanceof CustomDomainProviderError && error.statusCode === 404) {
            return await persist(
              {
                providerCustomDomainId: null,
                providerVerificationStatus: 'unregistered',
                provisioningStatus: 'provider_pending',
                lastCheckedAt: now,
                lastErrorCode: 'PROVIDER_DOMAIN_NOT_FOUND',
                lastErrorMessage:
                  'The provider registration no longer exists. Run verification again to recreate it.',
              },
              'tracking_domain.provider_registration_missing',
            );
          }

          throw error;
        }

        if (providerDomain.verificationStatus !== 'verified') {
          return await persist(
            {
              providerVerificationStatus: 'unverified',
              provisioningStatus: 'tls_pending',
              lastCheckedAt: now,
              lastErrorCode: 'PROVIDER_VERIFICATION_PENDING',
              lastErrorMessage:
                'Render has not completed custom-domain verification and certificate provisioning yet.',
            },
            'tracking_domain.provider_verification_pending',
          );
        }

        await persist(
          {
            providerVerificationStatus: 'verified',
            provisioningStatus: 'tls_pending',
            lastCheckedAt: now,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
          'tracking_domain.provider_verified',
        );

        const tls = await automation.verifier.verifyTls(current.hostname);

        if (!tls.verified) {
          return await persist(
            {
              tlsVerifiedAt: null,
              provisioningStatus: 'tls_pending',
              lastCheckedAt: now,
              lastErrorCode: tls.errorCode ?? 'TLS_HEALTH_CHECK_PENDING',
              lastErrorMessage:
                tls.statusCode === null
                  ? 'HTTPS and certificate readiness are still pending.'
                  : `The tracking health endpoint returned HTTP ${String(tls.statusCode)}.`,
            },
            'tracking_domain.tls_pending',
          );
        }

        return await persist(
          {
            status: 'active',
            verifiedAt: current.verifiedAt ?? now,
            providerVerificationStatus: 'verified',
            provisioningStatus: 'active',
            dnsVerifiedAt: current.dnsVerifiedAt ?? now,
            tlsVerifiedAt: now,
            lastCheckedAt: now,
            lastErrorCode: null,
            lastErrorMessage: null,
            disconnectedAt: null,
          },
          'tracking_domain.activated',
        );
      } catch (error: unknown) {
        if (error instanceof ApiHttpError && error.code === 'TRACKING_DOMAIN_UPDATE_CONFLICT') {
          throw error;
        }

        const failure = readProvisioningError(error);

        return persist(
          {
            status: current.status === 'active' ? 'suspended' : current.status,
            isPrimary: false,
            provisioningStatus: 'failed',
            lastCheckedAt: now,
            lastErrorCode: failure.code,
            lastErrorMessage: failure.message,
          },
          'tracking_domain.provisioning_failed',
        );
      }
    },

    async disconnectPlatformTrackingDomain(identity, requestId, domainIdValue) {
      const domainId = normalizeUuid(domainIdValue, 'Tracking domain ID');
      const companyId = resolveTrackingDomainProvisioningCompanyId(identity);
      const automation = requireCustomDomainAutomation(options);
      const readContext = createRepositoryContext(
        identity,
        requestId,
        companyId,
      );

      if (companyId !== undefined) {
        await requireActiveCompany(repository, readContext, companyId);
      }

      const current = await requireTrackingDomain(
        repository,
        readContext,
        domainId,
        companyId,
      );      if (current.provider !== 'render') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_MANUAL_PROVIDER',
          409,
          'A legacy manual tracking domain cannot be disconnected through Render automation.',
        );
      }

      if (current.provisioningStatus === 'disconnected') {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UNCHANGED',
          409,
          'The tracking domain is already disconnected.',
        );
      }

      if (current.providerCustomDomainId !== null) {
        try {
          await automation.provider.delete(current.providerCustomDomainId);
        } catch (error: unknown) {
          if (!(error instanceof CustomDomainProviderError) || error.statusCode !== 404) {
            throw error;
          }
        }
      }

      const now = getNow().toISOString();
      const updated = await repository.updateTrackingDomainProvisioning(
        createRepositoryContext(identity, requestId, current.companyId),
        current,
        createProvisioningWriteInput(current, {
          status: 'archived',
          verifiedAt: current.verifiedAt,
          isPrimary: false,
          providerCustomDomainId: null,
          providerVerificationStatus: 'unregistered',
          provisioningStatus: 'disconnected',
          dnsVerifiedAt: null,
          tlsVerifiedAt: null,
          lastCheckedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          disconnectedAt: now,
        }),
        'tracking_domain.disconnected',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'TRACKING_DOMAIN_UPDATE_CONFLICT',
          409,
          'The tracking domain changed before it could be disconnected.',
        );
      }

      return updated;
    },

    async createCompanyNetworkProvider(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const provider = await repository.createNetworkProvider(
        context,
        companyId,
        Object.freeze<NetworkProviderWriteInput>({
          code: normalizeProviderCode(input.code),
          name: normalizeRequiredText(input.name, 'name', 2, 160),
          status: 'active',
          websiteUrl: normalizeOptionalUrl(input.websiteUrl, 'websiteUrl') ?? null,
          documentationUrl:
            normalizeOptionalUrl(input.documentationUrl, 'documentationUrl') ?? null,
          integration: normalizeProviderIntegration(input.integration),
        }),
      );

      if (provider === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_CODE_CONFLICT',
          409,
          'A network provider with this code already exists in this company.',
        );
      }

      return provider;
    },

    async listCompanyNetworkProviders(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listCompanyNetworkProviders(context, companyId);
    },

    async getCompanyNetworkProvider(identity, requestId, companyIdValue, providerIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const providerId = normalizeUuid(providerIdValue, 'Network provider ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireCompanyNetworkProvider(repository, context, companyId, providerId);
    },

    async updateCompanyNetworkProvider(
      identity,
      requestId,
      companyIdValue,
      providerIdValue,
      input,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const providerId = normalizeUuid(providerIdValue, 'Network provider ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireCompanyNetworkProvider(
        repository,
        context,
        companyId,
        providerId,
      );

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_ARCHIVED',
          409,
          'An archived network provider is immutable.',
        );
      }

      if (
        input.name === undefined &&
        input.status === undefined &&
        input.websiteUrl === undefined &&
        input.documentationUrl === undefined &&
        input.integration === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one network-provider field must be provided.',
        );
      }

      const next = Object.freeze<NetworkProviderWriteInput>({
        code: current.code,
        name:
          input.name === undefined
            ? current.name
            : normalizeRequiredText(input.name, 'name', 2, 160),
        status:
          input.status === undefined
            ? current.status
            : normalizeNetworkProviderStatus(input.status, 'INVALID_REQUEST_BODY'),
        websiteUrl:
          input.websiteUrl === undefined
            ? current.websiteUrl
            : (normalizeOptionalUrl(input.websiteUrl, 'websiteUrl') ?? null),
        documentationUrl:
          input.documentationUrl === undefined
            ? current.documentationUrl
            : (normalizeOptionalUrl(input.documentationUrl, 'documentationUrl') ?? null),
        integration: normalizeProviderIntegration(input.integration, current.integration),
      });

      if (providersAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_UNCHANGED',
          409,
          'The network provider already contains the requested values.',
        );
      }

      if (next.status === 'archived') {
        const openAccounts = await repository.countOpenNetworkAccountsForProvider(
          context,
          companyId,
          providerId,
        );

        if (openAccounts > 0) {
          throw new ApiHttpError(
            'NETWORK_PROVIDER_IN_USE',
            409,
            'A network provider with open company accounts cannot be archived.',
          );
        }
      }

      const updated = await repository.updateCompanyNetworkProvider(
        context,
        companyId,
        current,
        next,
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_UPDATE_CONFLICT',
          409,
          'The network provider changed before this request completed.',
        );
      }

      return updated;
    },

    async createNetworkAccount(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const providerId = normalizeUuid(input.providerId, 'Network provider ID');

      await requireActiveCompanyNetworkProvider(repository, context, companyId, providerId);

      const account = await repository.createNetworkAccount(context, companyId, {
        providerId,
        name: normalizeRequiredText(input.name, 'name', 2, 160),
        externalAccountId:
          normalizeOptionalNullableText(input.externalAccountId, 'externalAccountId', 255) ?? null,
        status: 'active',
      });

      if (account === undefined) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_CONFLICT',
          409,
          'A network account with this provider name or external account ID already exists.',
        );
      }

      return account;
    },

    async listCompanyNetworkAccounts(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listCompanyNetworkAccounts(context, companyId);
    },

    async getCompanyNetworkAccount(identity, requestId, companyIdValue, accountIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const accountId = normalizeUuid(accountIdValue, 'Network account ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireCompanyNetworkAccount(repository, context, companyId, accountId);
    },

    async updateCompanyNetworkAccount(identity, requestId, companyIdValue, accountIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const accountId = normalizeUuid(accountIdValue, 'Network account ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireCompanyNetworkAccount(repository, context, companyId, accountId);

      if (
        input.providerId === undefined &&
        input.name === undefined &&
        input.externalAccountId === undefined &&
        input.status === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one network-account field must be provided.',
        );
      }

      const providerId =
        input.providerId === undefined
          ? current.providerId
          : normalizeUuid(input.providerId, 'Network provider ID');

      if (providerId !== current.providerId) {
        await requireActiveCompanyNetworkProvider(repository, context, companyId, providerId);

        const dependencies = await repository.getNetworkAccountDependencySummary(
          context,
          companyId,
          accountId,
        );

        if (dependencies === undefined) {
          throw new ApiHttpError(
            'NETWORK_ACCOUNT_NOT_FOUND',
            404,
            'The network account was not found.',
          );
        }

        if (hasNetworkAccountDependencies(dependencies)) {
          throw new ApiHttpError(
            'NETWORK_ACCOUNT_PROVIDER_CHANGE_BLOCKED',
            409,
            `The Network provider cannot be changed because dependent records exist: ${formatNetworkAccountDependencies(
              dependencies,
            )}. Clone the Network under the target Provider and archive the old Network instead.`,
          );
        }
      }

      const nextStatus =
        input.status === undefined
          ? current.status
          : normalizeNetworkAccountStatus(input.status, 'INVALID_REQUEST_BODY');

      assertNetworkAccountTransition(current.status, nextStatus);

      const next = Object.freeze<NetworkAccountWriteInput>({
        providerId,
        name:
          input.name === undefined
            ? current.name
            : normalizeRequiredText(input.name, 'name', 2, 160),
        externalAccountId:
          input.externalAccountId === undefined
            ? current.externalAccountId
            : (normalizeOptionalNullableText(input.externalAccountId, 'externalAccountId', 255) ??
              null),
        status: nextStatus,
      });

      if (accountsAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UNCHANGED',
          409,
          'The network account already contains the requested values.',
        );
      }

      const updated = await repository.updateNetworkAccount(
        context,
        current,
        next,
        'network_account.updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UPDATE_CONFLICT',
          409,
          'The network account changed or conflicted before this request completed.',
        );
      }

      return updated;
    },
  });
}

export type {
  CreateNetworkAccountInput,
  CreateNetworkProviderInput,
  CreateTrackingDomainInput,
  ListPlatformTrackingDomainsInput,
  NetworkAccountRecord,
  NetworkProviderRecord,
  TrackingDomainRecord,
  UpdateNetworkAccountInput,
  UpdateNetworkProviderInput,
  UpdatePlatformTrackingDomainStatusInput,
  UpdateTrackingDomainInput,
} from './tracking-networks.types.js';
