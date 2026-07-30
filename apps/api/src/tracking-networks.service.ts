import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';

import { assertCompanyRole, assertPlatformSuperAdmin } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { TrackingNetworksRepository } from './tracking-networks.repository.js';
import type {
  CreateNetworkAccountInput,
  CreateNetworkProviderInput,
  CreateTrackingDomainInput,
  ListPlatformNetworkAccountsInput,
  ListPlatformTrackingDomainsInput,
  NetworkAccountRecord,
  NetworkAccountStatus,
  NetworkAccountWriteInput,
  NetworkProviderRecord,
  NetworkProviderStatus,
  NetworkProviderWriteInput,
  TrackingDomainRecord,
  TrackingDomainStatus,
  TrackingDomainWriteInput,
  TrackingNetworkCompanyRecord,
  TrackingNetworkRepositoryContext,
  UpdateNetworkAccountInput,
  UpdateNetworkProviderInput,
  UpdatePlatformNetworkAccountStatusInput,
  UpdatePlatformTrackingDomainStatusInput,
  UpdateTrackingDomainInput,
} from './tracking-networks.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PROVIDER_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export interface TrackingNetworksServiceOptions {
  readonly now?: () => Date;
  readonly createVerificationToken?: () => string;
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

  createCompanyNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  createNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: CreateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  listPlatformNetworkProviders(
    identity: ResolvedApiIdentity,
    requestId: string,
    status?: NetworkProviderStatus,
  ): Promise<readonly NetworkProviderRecord[]>;

  getPlatformNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    providerId: string,
  ): Promise<NetworkProviderRecord>;

  updateNetworkProvider(
    identity: ResolvedApiIdentity,
    requestId: string,
    providerId: string,
    input: UpdateNetworkProviderInput,
  ): Promise<NetworkProviderRecord>;

  listTenantNetworkProviders(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly NetworkProviderRecord[]>;

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

  listPlatformNetworkAccounts(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: ListPlatformNetworkAccountsInput,
  ): Promise<readonly NetworkAccountRecord[]>;

  updatePlatformNetworkAccountStatus(
    identity: ResolvedApiIdentity,
    requestId: string,
    accountId: string,
    input: UpdatePlatformNetworkAccountStatusInput,
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

async function requireCompany(
  repository: TrackingNetworksRepository,
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

async function requireNetworkProvider(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  providerId: string,
): Promise<NetworkProviderRecord> {
  const provider = await repository.getNetworkProvider(context, providerId);

  if (provider === undefined) {
    throw new ApiHttpError(
      'NETWORK_PROVIDER_NOT_FOUND',
      404,
      'The requested network provider was not found.',
    );
  }

  return provider;
}

async function requireActiveNetworkProvider(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  providerId: string,
): Promise<NetworkProviderRecord> {
  const provider = await requireNetworkProvider(repository, context, providerId);

  if (provider.status !== 'active') {
    throw new ApiHttpError(
      'NETWORK_PROVIDER_ARCHIVED',
      409,
      'An archived network provider cannot receive new accounts.',
    );
  }

  return provider;
}

async function requireNetworkAccount(
  repository: TrackingNetworksRepository,
  context: TrackingNetworkRepositoryContext,
  accountId: string,
  companyId?: string,
): Promise<NetworkAccountRecord> {
  const account = await repository.getNetworkAccount(context, accountId, companyId);

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
    current.documentationUrl === next.documentationUrl
  );
}

function accountsAreEquivalent(
  current: NetworkAccountRecord,
  next: NetworkAccountWriteInput,
): boolean {
  return (
    current.name === next.name &&
    current.externalAccountId === next.externalAccountId &&
    current.status === next.status
  );
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

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const domain = await repository.createTrackingDomain(context, companyId, {
        hostname: normalizeHostname(input.hostname),
        status: 'pending_verification',
        verificationToken: normalizeVerificationToken(createVerificationToken()),
        verifiedAt: null,
        isPrimary: false,
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
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
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
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
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

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

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
        hostname = normalizeHostname(input.hostname);

        if (hostname !== current.hostname) {
          if (current.status !== 'pending_verification') {
            throw new ApiHttpError(
              'TRACKING_DOMAIN_HOSTNAME_LOCKED',
              409,
              'A verified or suspended tracking-domain hostname cannot be changed.',
            );
          }

          verificationToken = createVerificationToken();
          verifiedAt = null;
          status = 'pending_verification';
          isPrimary = false;
        }
      }

      if (input.status !== undefined) {
        status = normalizeTenantTrackingDomainStatus(input.status);
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

      const now = getNow().toISOString();
      const next = Object.freeze<TrackingDomainWriteInput>({
        hostname: current.hostname,
        status: input.status,
        verificationToken: current.verificationToken,
        verifiedAt: input.status === 'active' ? (current.verifiedAt ?? now) : current.verifiedAt,
        isPrimary: input.status === 'active' ? current.isPrimary : false,
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

    async createCompanyNetworkProvider(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);
      const company = await repository.getCompany(context, companyId);

      if (company?.status !== 'active') {
        throw new ApiHttpError(
          'TRACKING_NETWORK_COMPANY_INACTIVE',
          409,
          'An active company is required to create a network provider.',
        );
      }

      const provider = await repository.createNetworkProvider(
        context,
        Object.freeze<NetworkProviderWriteInput>({
          code: normalizeProviderCode(input.code),
          name: normalizeRequiredText(input.name, 'name', 2, 160),
          status: 'active',
          websiteUrl: normalizeOptionalUrl(input.websiteUrl, 'websiteUrl') ?? null,
          documentationUrl:
            normalizeOptionalUrl(input.documentationUrl, 'documentationUrl') ?? null,
        }),
      );

      if (provider === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_CODE_CONFLICT',
          409,
          'A network provider with this code already exists.',
        );
      }

      return provider;
    },

    async createNetworkProvider(identity, requestId, input) {
      assertPlatformSuperAdmin(identity.subject);

      const provider = await repository.createNetworkProvider(
        createRepositoryContext(identity, requestId),
        Object.freeze<NetworkProviderWriteInput>({
          code: normalizeProviderCode(input.code),
          name: normalizeRequiredText(input.name, 'name', 2, 160),
          status: 'active',
          websiteUrl: normalizeOptionalUrl(input.websiteUrl, 'websiteUrl') ?? null,
          documentationUrl:
            normalizeOptionalUrl(input.documentationUrl, 'documentationUrl') ?? null,
        }),
      );

      if (provider === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_CODE_CONFLICT',
          409,
          'A network provider with this code already exists.',
        );
      }

      return provider;
    },

    async listPlatformNetworkProviders(identity, requestId, status) {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listNetworkProviders(
        createRepositoryContext(identity, requestId),
        status === undefined
          ? undefined
          : normalizeNetworkProviderStatus(status, 'INVALID_QUERY_PARAMETER'),
      );
    },

    async getPlatformNetworkProvider(identity, requestId, providerIdValue) {
      assertPlatformSuperAdmin(identity.subject);

      return requireNetworkProvider(
        repository,
        createRepositoryContext(identity, requestId),
        normalizeUuid(providerIdValue, 'Network provider ID'),
      );
    },

    async updateNetworkProvider(identity, requestId, providerIdValue, input) {
      assertPlatformSuperAdmin(identity.subject);

      const providerId = normalizeUuid(providerIdValue, 'Network provider ID');
      const context = createRepositoryContext(identity, requestId);
      const current = await requireNetworkProvider(repository, context, providerId);

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
        input.documentationUrl === undefined
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

      const updated = await repository.updateNetworkProvider(context, current, next);

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_PROVIDER_UPDATE_CONFLICT',
          409,
          'The network provider changed before this request completed.',
        );
      }

      return updated;
    },

    async listTenantNetworkProviders(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listNetworkProviders(context, 'active');
    },

    async createNetworkAccount(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const providerId = normalizeUuid(input.providerId, 'Network provider ID');

      await requireActiveNetworkProvider(repository, context, providerId);

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
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
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
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireNetworkAccount(repository, context, accountId, companyId);
    },

    async updateCompanyNetworkAccount(identity, requestId, companyIdValue, accountIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const accountId = normalizeUuid(accountIdValue, 'Network account ID');

      assertCompanyRequestContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireNetworkAccount(repository, context, accountId, companyId);

      if (
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

      const nextStatus =
        input.status === undefined
          ? current.status
          : normalizeNetworkAccountStatus(input.status, 'INVALID_REQUEST_BODY');

      assertNetworkAccountTransition(current.status, nextStatus);

      const next = Object.freeze<NetworkAccountWriteInput>({
        providerId: current.providerId,
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

    async listPlatformNetworkAccounts(identity, requestId, input) {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listPlatformNetworkAccounts(createRepositoryContext(identity, requestId), {
        ...(input.companyId !== undefined
          ? {
              companyId: normalizeUuid(input.companyId, 'Company ID'),
            }
          : {}),
        ...(input.providerId !== undefined
          ? {
              providerId: normalizeUuid(input.providerId, 'Network provider ID'),
            }
          : {}),
        ...(input.status !== undefined
          ? {
              status: normalizeNetworkAccountStatus(input.status, 'INVALID_QUERY_PARAMETER'),
            }
          : {}),
      });
    },

    async updatePlatformNetworkAccountStatus(identity, requestId, accountIdValue, input) {
      assertPlatformSuperAdmin(identity.subject);

      const accountId = normalizeUuid(accountIdValue, 'Network account ID');
      const readContext = createRepositoryContext(identity, requestId);
      const current = await requireNetworkAccount(repository, readContext, accountId);
      const nextStatus = normalizeNetworkAccountStatus(input.status, 'INVALID_REQUEST_BODY');

      assertNetworkAccountTransition(current.status, nextStatus);

      if (current.status === nextStatus) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UNCHANGED',
          409,
          'The network account already has the requested status.',
        );
      }

      const updated = await repository.updateNetworkAccount(
        createRepositoryContext(identity, requestId, current.companyId),
        current,
        {
          providerId: current.providerId,
          name: current.name,
          externalAccountId: current.externalAccountId,
          status: nextStatus,
        },
        'network_account.status_updated',
      );

      if (updated === undefined) {
        throw new ApiHttpError(
          'NETWORK_ACCOUNT_UPDATE_CONFLICT',
          409,
          'The network account changed before this request completed.',
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
  ListPlatformNetworkAccountsInput,
  ListPlatformTrackingDomainsInput,
  NetworkAccountRecord,
  NetworkProviderRecord,
  TrackingDomainRecord,
  UpdateNetworkAccountInput,
  UpdateNetworkProviderInput,
  UpdatePlatformNetworkAccountStatusInput,
  UpdatePlatformTrackingDomainStatusInput,
  UpdateTrackingDomainInput,
} from './tracking-networks.types.js';
