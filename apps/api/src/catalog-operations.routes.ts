import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import type { CatalogOperationsService } from './catalog-operations.service.js';
import type {
  CatalogDevice,
  CatalogNetworkStatus,
  CatalogOfferStatus,
  CatalogPayoutType,
  CatalogRedirectType,
  CatalogReferrerMode,
} from './catalog-operations.types.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';

export interface CreateCatalogOperationsRouterOptions {
  readonly service: CatalogOperationsService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(request: Request): Record<string, unknown> {
  const value = request.body as unknown;

  if (!isRecord(value)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'The request body must be a JSON object.');
  }

  return value;
}

function readRouteParameter(request: Request, name: string): string {
  const value = request.params[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${name} is required.`);
  }

  return value;
}

function readRequiredString(body: Record<string, unknown>, name: string): string {
  const value = body[name];

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a string.`);
  }

  return value;
}

function readNullableString(
  body: Record<string, unknown>,
  name: string,
): string | null | undefined {
  const value = body[name];

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a string or null.`);
  }

  return value;
}

function readRequiredBoolean(body: Record<string, unknown>, name: string): boolean {
  const value = body[name];

  if (typeof value !== 'boolean') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a boolean.`);
  }

  return value;
}

function readOptionalString(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a string.`);
  }

  return value;
}

function readOptionalBoolean(body: Record<string, unknown>, name: string): boolean | undefined {
  const value = body[name];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a boolean.`);
  }

  return value;
}

function readNullableNumber(
  body: Record<string, unknown>,
  name: string,
): number | null | undefined {
  const value = body[name];

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a number or null.`);
  }

  return value;
}

function readStringArray(body: Record<string, unknown>, name: string): readonly string[] {
  const value = body[name];

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be an array of strings.`);
  }

  return value as readonly string[];
}

function readNumberArray(body: Record<string, unknown>, name: string): readonly number[] {
  const value = body[name];

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be an array of numbers.`);
  }

  return value as readonly number[];
}

function readDevices(body: Record<string, unknown>): readonly CatalogDevice[] {
  return readStringArray(body, 'devices').map((value) => {
    if (value !== 'desktop' && value !== 'android' && value !== 'ios') {
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'devices contains an unsupported value.');
    }

    return value;
  });
}

function readOfferStatus(
  body: Record<string, unknown>,
  optional = false,
): CatalogOfferStatus | undefined {
  const value = body['status'];

  if (optional && value === undefined) {
    return undefined;
  }

  if (value === 'draft' || value === 'active' || value === 'paused' || value === 'archived') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is invalid.');
}

function readNetworkStatus(body: Record<string, unknown>): CatalogNetworkStatus {
  const value = body['status'];

  if (value === 'active' || value === 'suspended' || value === 'archived') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is invalid.');
}

function readRedirectType(body: Record<string, unknown>): CatalogRedirectType {
  const value = body['redirectType'];

  if (value === '301' || value === '302') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'redirectType is invalid.');
}

function readReferrerMode(body: Record<string, unknown>): CatalogReferrerMode {
  const value = body['referrerMode'];

  if (value === 'preserve' || value === 'strip') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'referrerMode is invalid.');
}

function readPayoutType(body: Record<string, unknown>): CatalogPayoutType {
  const value = body['payoutType'];

  if (value === 'fixed_member' || value === 'per_offer') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'payoutType is invalid.');
}

function readOfferConfiguration(body: Record<string, unknown>) {
  return {
    trackingDomainId: readRequiredString(body, 'trackingDomainId'),
    promotionalTextTemplate: readRequiredString(body, 'promotionalTextTemplate'),
    countries: readStringArray(body, 'countries'),
    devices: readDevices(body),
    desktopUrl: readNullableString(body, 'desktopUrl'),
    androidUrl: readNullableString(body, 'androidUrl'),
    iosUrl: readNullableString(body, 'iosUrl'),
    redirectType: readRedirectType(body),
    referrerMode: readReferrerMode(body),
    defaultPayoutAmountMinor: readNullableNumber(body, 'defaultPayoutAmountMinor'),
    payoutCurrency: readNullableString(body, 'payoutCurrency'),
    timezone: readRequiredString(body, 'timezone'),
    activeDays: readNumberArray(body, 'activeDays'),
    activeStartTime: readNullableString(body, 'activeStartTime'),
    activeEndTime: readNullableString(body, 'activeEndTime'),
    proxyEnabled: readRequiredBoolean(body, 'proxyEnabled'),
    expiresAt: readNullableString(body, 'expiresAt'),
    duplicateAllowed: readRequiredBoolean(body, 'duplicateAllowed'),
    managerMembershipIds: readStringArray(body, 'managerMembershipIds'),
  };
}

function resolveRequestInformation(request: Request) {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createCatalogOperationsRouter(
  options: CreateCatalogOperationsRouterOptions,
): Router {
  const router = Router();

  const getSnapshotHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const snapshot = await options.service.getSnapshot(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({ data: snapshot });
  };

  const listPublisherOffersHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const offers = await options.service.listPublisherOffers(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: {
        offers,
      },
    });
  };

  const createOfferHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const status = readOfferStatus(body, true);

    if (status === 'paused' || status === 'archived') {
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'A new offer status must be draft or active.',
      );
    }

    const offer = await options.service.createOffer(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        networkAccountId: readRequiredString(body, 'networkAccountId'),
        code: readRequiredString(body, 'code'),
        externalOfferId: readNullableString(body, 'externalOfferId'),
        name: readRequiredString(body, 'name'),
        description: readNullableString(body, 'description'),
        socialPreviewTitle: readNullableString(body, 'socialPreviewTitle'),
        socialPreviewDescription: readNullableString(body, 'socialPreviewDescription'),
        socialPreviewImageUrl: readNullableString(body, 'socialPreviewImageUrl'),
        ...(status !== undefined ? { status } : {}),
        ...readOfferConfiguration(body),
      },
    );

    response.status(201).json({ data: offer });
  };

  const cloneOfferHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const offer = await options.service.cloneOffer(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'offerId'),
      {
        networkAccountId: readRequiredString(body, 'networkAccountId'),
        code: readRequiredString(body, 'code'),
        externalOfferId: readNullableString(body, 'externalOfferId'),
        name: readRequiredString(body, 'name'),
        description: readNullableString(body, 'description'),
        socialPreviewTitle: readNullableString(body, 'socialPreviewTitle'),
        socialPreviewDescription: readNullableString(body, 'socialPreviewDescription'),
        socialPreviewImageUrl: readNullableString(body, 'socialPreviewImageUrl'),
        ...readOfferConfiguration(body),
      },
    );

    response.status(201).json({ data: offer });
  };

  const updateOfferHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const status = readOfferStatus(body);

    if (status === undefined) {
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is required.');
    }

    const offer = await options.service.updateOffer(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'offerId'),
      {
        networkAccountId: readRequiredString(body, 'networkAccountId'),
        externalOfferId: readNullableString(body, 'externalOfferId'),
        name: readRequiredString(body, 'name'),
        description: readNullableString(body, 'description'),
        socialPreviewTitle: readNullableString(body, 'socialPreviewTitle'),
        socialPreviewDescription: readNullableString(body, 'socialPreviewDescription'),
        socialPreviewImageUrl: readNullableString(body, 'socialPreviewImageUrl'),
        status,
        ...readOfferConfiguration(body),
      },
    );

    response.status(200).json({ data: offer });
  };

  const deleteOfferHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const result = await options.service.deleteOffer(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'offerId'),
    );

    response.status(200).json({ data: result });
  };

  const createNetworkHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const network = await options.service.createNetwork(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        providerId: readRequiredString(body, 'providerId'),
        name: readRequiredString(body, 'name'),
        externalAccountId: readNullableString(body, 'externalAccountId'),
        trackingParameter: readNullableString(body, 'trackingParameter'),
        postbackUrl: readNullableString(body, 'postbackUrl'),
        duplicateAllowed: readRequiredBoolean(body, 'duplicateAllowed'),
      },
    );

    response.status(201).json({ data: network });
  };

  const cloneNetworkHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const providerId = readOptionalString(body, 'providerId');
    const externalAccountId = readNullableString(body, 'externalAccountId');
    const trackingParameter = readNullableString(body, 'trackingParameter');
    const postbackUrl = readNullableString(body, 'postbackUrl');
    const duplicateAllowed = readOptionalBoolean(body, 'duplicateAllowed');
    const network = await options.service.cloneNetwork(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
      {
        name: readRequiredString(body, 'name'),
        ...(providerId !== undefined ? { providerId } : {}),
        ...(externalAccountId !== undefined ? { externalAccountId } : {}),
        ...(trackingParameter !== undefined ? { trackingParameter } : {}),
        ...(postbackUrl !== undefined ? { postbackUrl } : {}),
        ...(duplicateAllowed !== undefined ? { duplicateAllowed } : {}),
      },
    );

    response.status(201).json({ data: network });
  };

  const updateNetworkHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const network = await options.service.updateNetwork(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
      {
        providerId: readRequiredString(body, 'providerId'),
        name: readRequiredString(body, 'name'),
        externalAccountId: readNullableString(body, 'externalAccountId'),
        status: readNetworkStatus(body),
        trackingParameter: readNullableString(body, 'trackingParameter'),
        postbackUrl: readNullableString(body, 'postbackUrl'),
        duplicateAllowed: readRequiredBoolean(body, 'duplicateAllowed'),
      },
    );

    response.status(200).json({ data: network });
  };

  const deleteNetworkHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const result = await options.service.deleteNetwork(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'accountId'),
    );

    response.status(200).json({ data: result });
  };

  const updatePublisherHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const publisher = await options.service.updatePublisher(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'membershipId'),
      {
        timezone: readRequiredString(body, 'timezone'),
        payoutType: readPayoutType(body),
        fixedPayoutAmountMinor: readNullableNumber(body, 'fixedPayoutAmountMinor'),
        payoutCurrency: readNullableString(body, 'payoutCurrency'),
        postbackUrl: readNullableString(body, 'postbackUrl'),
        emailNotificationsEnabled: readRequiredBoolean(body, 'emailNotificationsEnabled'),
        assignedOfferIds: readStringArray(body, 'assignedOfferIds'),
      },
    );

    response.status(200).json({ data: publisher });
  };

  router.get('/companies/:companyId/catalog', getSnapshotHandler);
  router.get('/companies/:companyId/catalog/publisher-offers', listPublisherOffersHandler);
  router.post('/companies/:companyId/catalog/offers', createOfferHandler);
  router.post('/companies/:companyId/catalog/offers/:offerId/clone', cloneOfferHandler);
  router.put('/companies/:companyId/catalog/offers/:offerId', updateOfferHandler);
  router.delete('/companies/:companyId/catalog/offers/:offerId', deleteOfferHandler);
  router.post('/companies/:companyId/catalog/networks', createNetworkHandler);
  router.post('/companies/:companyId/catalog/networks/:accountId/clone', cloneNetworkHandler);
  router.put('/companies/:companyId/catalog/networks/:accountId', updateNetworkHandler);
  router.delete('/companies/:companyId/catalog/networks/:accountId', deleteNetworkHandler);
  router.put('/companies/:companyId/catalog/publishers/:membershipId', updatePublisherHandler);

  return router;
}
