import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';
import type { TrackingNetworksService } from './tracking-networks.service.js';
import type {
  NetworkAccountStatus,
  NetworkProviderStatus,
  TrackingDomainStatus,
} from './tracking-networks.types.js';

export interface CreateTrackingNetworksRouterOptions {
  readonly service: TrackingNetworksService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(request: Request): Record<string, unknown> {
  const body = request.body as unknown;

  if (!isRecord(body)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'The request body must be a JSON object.');
  }

  return body;
}

function readRequiredString(body: Record<string, unknown>, propertyName: string): string {
  const value = body[propertyName];

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
  }

  return value;
}

function readOptionalString(
  body: Record<string, unknown>,
  propertyName: string,
): string | undefined {
  const value = body[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
  }

  return value;
}

function readOptionalNullableString(
  body: Record<string, unknown>,
  propertyName: string,
): string | null | undefined {
  const value = body[propertyName];

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a string or null.`,
    );
  }

  return value;
}

function readOptionalBoolean(
  body: Record<string, unknown>,
  propertyName: string,
): boolean | undefined {
  const value = body[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a boolean.`);
  }

  return value;
}

function readRouteParameter(request: Request, propertyName: string): string {
  const value = request.params[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${propertyName} is required.`);
  }

  return value;
}

function readOptionalQueryString(request: Request, propertyName: string): string | undefined {
  const value = request.query[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `${propertyName} must be a single string value.`,
    );
  }

  return value;
}

function readTrackingDomainStatusBody(
  body: Record<string, unknown>,
): 'suspended' | 'archived' | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be suspended or archived for a tenant tracking-domain update.',
      );
  }
}

function readPlatformTrackingDomainStatus(
  body: Record<string, unknown>,
): 'active' | 'suspended' | 'archived' {
  const value = body['status'];

  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be active, suspended, or archived.',
      );
  }
}

function readOptionalTrackingDomainStatusQuery(request: Request): TrackingDomainStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be pending_verification, active, suspended, or archived.',
      );
  }
}

function readOptionalNetworkProviderStatusBody(
  body: Record<string, unknown>,
): NetworkProviderStatus | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active or archived.');
  }
}

function readOptionalNetworkProviderStatusQuery(
  request: Request,
): NetworkProviderStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'status must be active or archived.');
  }
}

function readOptionalNetworkAccountStatusBody(
  body: Record<string, unknown>,
): NetworkAccountStatus | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be active, suspended, or archived.',
      );
  }
}

function readRequiredNetworkAccountStatus(body: Record<string, unknown>): NetworkAccountStatus {
  const value = readOptionalNetworkAccountStatusBody(body);

  if (value === undefined) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is required.');
  }

  return value;
}

function readOptionalNetworkAccountStatusQuery(request: Request): NetworkAccountStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be active, suspended, or archived.',
      );
  }
}

function resolveRequestInformation(request: Request) {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createTrackingNetworksRouter(options: CreateTrackingNetworksRouterOptions): Router {
  const router = Router();

  const createTrackingDomainHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const domain = await options.service.createTrackingDomain(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        hostname: readRequiredString(body, 'hostname'),
      },
    );

    response.status(201).json({
      data: domain,
    });
  };

  const listCompanyTrackingDomainsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const domains = await options.service.listCompanyTrackingDomains(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: domains,
    });
  };

  const getCompanyTrackingDomainHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const domain = await options.service.getCompanyTrackingDomain(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'domainId'),
    );

    response.status(200).json({
      data: domain,
    });
  };

  const updateCompanyTrackingDomainHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const hostname = readOptionalString(body, 'hostname');
    const status = readTrackingDomainStatusBody(body);
    const isPrimary = readOptionalBoolean(body, 'isPrimary');

    const domain = await options.service.updateCompanyTrackingDomain(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'domainId'),
      {
        ...(hostname !== undefined ? { hostname } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(isPrimary !== undefined ? { isPrimary } : {}),
      },
    );

    response.status(200).json({
      data: domain,
    });
  };

  const listPlatformTrackingDomainsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const companyId = readOptionalQueryString(request, 'companyId');
    const status = readOptionalTrackingDomainStatusQuery(request);

    const domains = await options.service.listPlatformTrackingDomains(
      requestInformation.identity,
      requestInformation.requestId,
      {
        ...(companyId !== undefined ? { companyId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: domains,
    });
  };

  const updatePlatformTrackingDomainStatusHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const domain = await options.service.updatePlatformTrackingDomainStatus(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'domainId'),
      {
        status: readPlatformTrackingDomainStatus(body),
      },
    );

    response.status(200).json({
      data: domain,
    });
  };

  const createNetworkProviderHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const websiteUrl = readOptionalNullableString(body, 'websiteUrl');
    const documentationUrl = readOptionalNullableString(body, 'documentationUrl');

    const provider = await options.service.createNetworkProvider(
      requestInformation.identity,
      requestInformation.requestId,
      {
        code: readRequiredString(body, 'code'),
        name: readRequiredString(body, 'name'),
        ...(websiteUrl !== undefined ? { websiteUrl } : {}),
        ...(documentationUrl !== undefined ? { documentationUrl } : {}),
      },
    );

    response.status(201).json({
      data: provider,
    });
  };

  const listPlatformNetworkProvidersHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const providers = await options.service.listPlatformNetworkProviders(
      requestInformation.identity,
      requestInformation.requestId,
      readOptionalNetworkProviderStatusQuery(request),
    );

    response.status(200).json({
      data: providers,
    });
  };

  const getPlatformNetworkProviderHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const provider = await options.service.getPlatformNetworkProvider(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'providerId'),
    );

    response.status(200).json({
      data: provider,
    });
  };

  const updateNetworkProviderHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const name = readOptionalString(body, 'name');
    const status = readOptionalNetworkProviderStatusBody(body);
    const websiteUrl = readOptionalNullableString(body, 'websiteUrl');
    const documentationUrl = readOptionalNullableString(body, 'documentationUrl');

    const provider = await options.service.updateNetworkProvider(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'providerId'),
      {
        ...(name !== undefined ? { name } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(websiteUrl !== undefined ? { websiteUrl } : {}),
        ...(documentationUrl !== undefined ? { documentationUrl } : {}),
      },
    );

    response.status(200).json({
      data: provider,
    });
  };

  const listTenantNetworkProvidersHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const providers = await options.service.listTenantNetworkProviders(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: providers,
    });
  };

  const createNetworkAccountHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const externalAccountId = readOptionalNullableString(body, 'externalAccountId');

    const account = await options.service.createNetworkAccount(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        providerId: readRequiredString(body, 'providerId'),
        name: readRequiredString(body, 'name'),
        ...(externalAccountId !== undefined ? { externalAccountId } : {}),
      },
    );

    response.status(201).json({
      data: account,
    });
  };

  const listCompanyNetworkAccountsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const accounts = await options.service.listCompanyNetworkAccounts(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: accounts,
    });
  };

  const getCompanyNetworkAccountHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const account = await options.service.getCompanyNetworkAccount(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
    );

    response.status(200).json({
      data: account,
    });
  };

  const updateCompanyNetworkAccountHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const name = readOptionalString(body, 'name');
    const externalAccountId = readOptionalNullableString(body, 'externalAccountId');
    const status = readOptionalNetworkAccountStatusBody(body);

    const account = await options.service.updateCompanyNetworkAccount(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
      {
        ...(name !== undefined ? { name } : {}),
        ...(externalAccountId !== undefined ? { externalAccountId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: account,
    });
  };

  const listPlatformNetworkAccountsHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const companyId = readOptionalQueryString(request, 'companyId');
    const providerId = readOptionalQueryString(request, 'providerId');
    const status = readOptionalNetworkAccountStatusQuery(request);

    const accounts = await options.service.listPlatformNetworkAccounts(
      requestInformation.identity,
      requestInformation.requestId,
      {
        ...(companyId !== undefined ? { companyId } : {}),
        ...(providerId !== undefined ? { providerId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: accounts,
    });
  };

  const updatePlatformNetworkAccountStatusHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const account = await options.service.updatePlatformNetworkAccountStatus(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'accountId'),
      {
        status: readRequiredNetworkAccountStatus(body),
      },
    );

    response.status(200).json({
      data: account,
    });
  };

  router.post('/companies/:companyId/tracking-domains', createTrackingDomainHandler);
  router.get('/companies/:companyId/tracking-domains', listCompanyTrackingDomainsHandler);
  router.get('/companies/:companyId/tracking-domains/:domainId', getCompanyTrackingDomainHandler);
  router.patch(
    '/companies/:companyId/tracking-domains/:domainId',
    updateCompanyTrackingDomainHandler,
  );

  router.get('/platform/tracking-domains', listPlatformTrackingDomainsHandler);
  router.patch(
    '/platform/tracking-domains/:domainId/status',
    updatePlatformTrackingDomainStatusHandler,
  );

  router.post('/platform/network-providers', createNetworkProviderHandler);
  router.get('/platform/network-providers', listPlatformNetworkProvidersHandler);
  router.get('/platform/network-providers/:providerId', getPlatformNetworkProviderHandler);
  router.patch('/platform/network-providers/:providerId', updateNetworkProviderHandler);

  router.get('/companies/:companyId/network-providers', listTenantNetworkProvidersHandler);

  router.post('/companies/:companyId/network-accounts', createNetworkAccountHandler);
  router.get('/companies/:companyId/network-accounts', listCompanyNetworkAccountsHandler);
  router.get('/companies/:companyId/network-accounts/:accountId', getCompanyNetworkAccountHandler);
  router.patch(
    '/companies/:companyId/network-accounts/:accountId',
    updateCompanyNetworkAccountHandler,
  );

  router.get('/platform/network-accounts', listPlatformNetworkAccountsHandler);
  router.patch(
    '/platform/network-accounts/:accountId/status',
    updatePlatformNetworkAccountStatusHandler,
  );

  return router;
}
