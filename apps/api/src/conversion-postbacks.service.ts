import { createHash, randomBytes } from 'node:crypto';

import { assertTenantCompanyRole } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { ConversionPostbacksRepository } from './conversion-postbacks.repository.js';
import type {
  ConversionPostbackNetworkAccountRecord,
  ConversionPostbacksRepositoryContext,
  ConversionRecord,
  CreateNetworkPostbackEndpointInput,
  ListConversionsInput,
  ListNetworkPostbackEndpointsInput,
  NetworkPostbackEndpointRecord,
  NetworkPostbackEndpointSecretRecord,
  NetworkPostbackEndpointStatus,
  UpdateNetworkPostbackEndpointInput,
} from './conversion-postbacks.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_ENDPOINT_NAME_LENGTH = 160;
const MAX_CONVERSION_RESULT_LIMIT = 200;

const ALLOWED_ENDPOINT_STATUS_TRANSITIONS: Readonly<
  Record<NetworkPostbackEndpointStatus, readonly NetworkPostbackEndpointStatus[]>
> = Object.freeze({
  active: Object.freeze<NetworkPostbackEndpointStatus[]>(['paused', 'archived']),
  paused: Object.freeze<NetworkPostbackEndpointStatus[]>(['active', 'archived']),
  archived: Object.freeze<NetworkPostbackEndpointStatus[]>([]),
});

export interface ConversionPostbacksService {
  createEndpoint(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    networkAccountId: string,
    input: CreateNetworkPostbackEndpointInput,
  ): Promise<NetworkPostbackEndpointSecretRecord>;

  listEndpoints(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    networkAccountId: string,
    input: ListNetworkPostbackEndpointsInput,
  ): Promise<readonly NetworkPostbackEndpointRecord[]>;

  updateEndpoint(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    networkAccountId: string,
    endpointId: string,
    input: UpdateNetworkPostbackEndpointInput,
  ): Promise<NetworkPostbackEndpointRecord>;

  rotateEndpointKey(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    networkAccountId: string,
    endpointId: string,
  ): Promise<NetworkPostbackEndpointSecretRecord>;

  listConversions(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: ListConversionsInput,
  ): Promise<readonly ConversionRecord[]>;

  getConversion(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    conversionId: string,
  ): Promise<ConversionRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeName(value: string): string {
  const normalizedValue = value.trim().replace(/\s+/gu, ' ');

  if (normalizedValue.length < 2 || normalizedValue.length > MAX_ENDPOINT_NAME_LENGTH) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `name must contain 2 to ${String(MAX_ENDPOINT_NAME_LENGTH)} characters.`,
    );
  }

  return normalizedValue;
}

function normalizeLimit(value: number | undefined): number {
  const normalizedValue = value ?? 100;

  if (
    !Number.isInteger(normalizedValue) ||
    normalizedValue < 1 ||
    normalizedValue > MAX_CONVERSION_RESULT_LIMIT
  ) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `limit must be a whole number between 1 and ${String(MAX_CONVERSION_RESULT_LIMIT)}.`,
    );
  }

  return normalizedValue;
}

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId: string,
): ConversionPostbacksRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    companyId,
  };
}

function assertEndpointReadAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
  ]);
}

function assertEndpointWriteAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
  ]);
}

function assertConversionReadAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
    'publisher',
  ]);
}

function createEndpointKey(): string {
  return `pbk_${randomBytes(24).toString('hex')}`;
}

function createEndpointKeyHash(endpointKey: string): string {
  return createHash('sha256').update(endpointKey, 'utf8').digest('hex');
}

function assertEndpointStatusTransition(
  currentStatus: NetworkPostbackEndpointStatus,
  targetStatus: NetworkPostbackEndpointStatus,
): void {
  if (currentStatus === targetStatus) {
    return;
  }

  if (!ALLOWED_ENDPOINT_STATUS_TRANSITIONS[currentStatus].includes(targetStatus)) {
    throw new ApiHttpError(
      'POSTBACK_ENDPOINT_STATUS_TRANSITION_INVALID',
      409,
      `Postback endpoint cannot transition from ${currentStatus} to ${targetStatus}.`,
    );
  }
}

async function assertActiveCompanyAndAccount(
  repository: ConversionPostbacksRepository,
  context: ConversionPostbacksRepositoryContext,
  companyId: string,
  networkAccountId: string,
): Promise<ConversionPostbackNetworkAccountRecord> {
  const company = await repository.getCompany(context, companyId);

  if (company?.status !== 'active') {
    throw new ApiHttpError(
      'POSTBACK_ENDPOINT_COMPANY_INACTIVE',
      409,
      'The company must be active before postback endpoints can be managed.',
    );
  }

  const account = await repository.getNetworkAccount(context, companyId, networkAccountId);

  if (account?.status !== 'active') {
    throw new ApiHttpError(
      'POSTBACK_ENDPOINT_NETWORK_ACCOUNT_INVALID',
      409,
      'The network account must exist in the company and be active.',
    );
  }

  return account;
}

function createEndpointSetup(
  account: ConversionPostbackNetworkAccountRecord,
  endpointKey: string,
): NetworkPostbackEndpointSecretRecord['setup'] {
  const effectiveTrackingParameter =
    account.trackingParameter ?? account.providerDefaultTrackingParameter ?? 'click_id';
  const basePath = `/postbacks/${endpointKey}`;
  const integrationConfigured =
    account.postbackClickIdToken !== null && account.postbackConversionIdToken !== null;
  const templateParts = integrationConfigured
    ? [
        `click_id=${account.postbackClickIdToken}`,
        `conversion_id=${account.postbackConversionIdToken}`,
        `idempotency_key=${account.postbackConversionIdToken}`,
        `status=${account.postbackConversionStatus}`,
        ...(account.postbackRevenueAmountToken !== null &&
        account.postbackRevenueCurrencyToken !== null
          ? [
              `amount_minor=${account.postbackRevenueAmountToken}`,
              `currency=${account.postbackRevenueCurrencyToken}`,
            ]
          : []),
      ]
    : [];

  return Object.freeze({
    providerId: account.providerId,
    providerCode: account.providerCode,
    providerName: account.providerName,
    effectiveTrackingParameter,
    basePath,
    templatePath: templateParts.length === 0 ? null : `${basePath}?${templateParts.join('&')}`,
    integrationConfigured,
  });
}

async function getRequiredEndpoint(
  repository: ConversionPostbacksRepository,
  context: ConversionPostbacksRepositoryContext,
  companyId: string,
  networkAccountId: string,
  endpointId: string,
): Promise<NetworkPostbackEndpointRecord> {
  const endpoint = await repository.getEndpoint(context, companyId, networkAccountId, endpointId);

  if (endpoint === undefined) {
    throw new ApiHttpError(
      'POSTBACK_ENDPOINT_NOT_FOUND',
      404,
      'The network postback endpoint was not found.',
    );
  }

  return endpoint;
}

export function createConversionPostbacksService(
  repository: ConversionPostbacksRepository,
): ConversionPostbacksService {
  return Object.freeze<ConversionPostbacksService>({
    async createEndpoint(identity, requestId, companyIdValue, networkAccountIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const networkAccountId = normalizeUuid(networkAccountIdValue, 'networkAccountId');

      assertEndpointWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      const account = await assertActiveCompanyAndAccount(
        repository,
        context,
        companyId,
        networkAccountId,
      );

      const endpointKey = createEndpointKey();
      const endpoint = await repository.createEndpoint(context, companyId, networkAccountId, {
        name: normalizeName(input.name),
        endpointKeyHash: createEndpointKeyHash(endpointKey),
        endpointKeyLast4: endpointKey.slice(-4),
        status: input.status ?? 'active',
      });

      if (endpoint === undefined) {
        throw new ApiHttpError(
          'POSTBACK_ENDPOINT_CONFLICT',
          409,
          'A postback endpoint with the same name or key already exists.',
        );
      }

      return Object.freeze({
        endpoint,
        endpointKey,
        setup: createEndpointSetup(account, endpointKey),
      });
    },

    async listEndpoints(identity, requestId, companyIdValue, networkAccountIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const networkAccountId = normalizeUuid(networkAccountIdValue, 'networkAccountId');

      assertEndpointReadAccess(identity, companyId);

      return repository.listEndpoints(
        createRepositoryContext(identity, requestId, companyId),
        companyId,
        networkAccountId,
        input,
      );
    },

    async updateEndpoint(
      identity,
      requestId,
      companyIdValue,
      networkAccountIdValue,
      endpointIdValue,
      input,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const networkAccountId = normalizeUuid(networkAccountIdValue, 'networkAccountId');
      const endpointId = normalizeUuid(endpointIdValue, 'endpointId');

      assertEndpointWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);
      const current = await getRequiredEndpoint(
        repository,
        context,
        companyId,
        networkAccountId,
        endpointId,
      );

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'POSTBACK_ENDPOINT_ARCHIVED',
          409,
          'Archived postback endpoints are immutable.',
        );
      }

      const status = input.status ?? current.status;
      const name = input.name === undefined ? current.name : normalizeName(input.name);

      assertEndpointStatusTransition(current.status, status);

      if (name === current.name && status === current.status) {
        throw new ApiHttpError(
          'POSTBACK_ENDPOINT_UNCHANGED',
          409,
          'The network postback endpoint is unchanged.',
        );
      }

      const endpoint = await repository.updateEndpoint(
        context,
        current,
        {
          name,
          endpointKeyHash: null,
          endpointKeyLast4: null,
          status,
        },
        'network_postback_endpoint.updated',
      );

      if (endpoint === undefined) {
        throw new ApiHttpError(
          'POSTBACK_ENDPOINT_UPDATE_CONFLICT',
          409,
          'The network postback endpoint was modified by another request.',
        );
      }

      return endpoint;
    },

    async rotateEndpointKey(
      identity,
      requestId,
      companyIdValue,
      networkAccountIdValue,
      endpointIdValue,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const networkAccountId = normalizeUuid(networkAccountIdValue, 'networkAccountId');
      const endpointId = normalizeUuid(endpointIdValue, 'endpointId');

      assertEndpointWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);
      const account = await assertActiveCompanyAndAccount(
        repository,
        context,
        companyId,
        networkAccountId,
      );
      const current = await getRequiredEndpoint(
        repository,
        context,
        companyId,
        networkAccountId,
        endpointId,
      );

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'POSTBACK_ENDPOINT_ARCHIVED',
          409,
          'Archived postback endpoint keys cannot be rotated.',
        );
      }

      const endpointKey = createEndpointKey();
      const endpoint = await repository.updateEndpoint(
        context,
        current,
        {
          name: current.name,
          endpointKeyHash: createEndpointKeyHash(endpointKey),
          endpointKeyLast4: endpointKey.slice(-4),
          status: current.status,
        },
        'network_postback_endpoint.key_rotated',
      );

      if (endpoint === undefined) {
        throw new ApiHttpError(
          'POSTBACK_ENDPOINT_UPDATE_CONFLICT',
          409,
          'The network postback endpoint was modified by another request.',
        );
      }

      return Object.freeze({
        endpoint,
        endpointKey,
        setup: createEndpointSetup(account, endpointKey),
      });
    },

    async listConversions(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertConversionReadAccess(identity, companyId);

      const isPublisher = identity.companyMembership?.role === 'publisher';

      return repository.listConversions(
        createRepositoryContext(identity, requestId, companyId),
        companyId,
        {
          ...(input.networkAccountId !== undefined
            ? {
                networkAccountId: normalizeUuid(input.networkAccountId, 'networkAccountId'),
              }
            : {}),
          ...(input.offerId !== undefined
            ? {
                offerId: normalizeUuid(input.offerId, 'offerId'),
              }
            : {}),
          ...(input.ownerMembershipId !== undefined
            ? {
                ownerMembershipId: normalizeUuid(input.ownerMembershipId, 'ownerMembershipId'),
              }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(isPublisher ? { visibleToUserId: identity.actor.userId } : {}),
          limit: normalizeLimit(input.limit),
        },
      );
    },

    async getConversion(identity, requestId, companyIdValue, conversionIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');
      const conversionId = normalizeUuid(conversionIdValue, 'conversionId');

      assertConversionReadAccess(identity, companyId);

      const visibleToUserId =
        identity.companyMembership?.role === 'publisher' ? identity.actor.userId : undefined;

      const conversion = await repository.getConversion(
        createRepositoryContext(identity, requestId, companyId),
        companyId,
        conversionId,
        visibleToUserId,
      );

      if (conversion === undefined) {
        throw new ApiHttpError('CONVERSION_NOT_FOUND', 404, 'The conversion was not found.');
      }

      return conversion;
    },
  });
}
