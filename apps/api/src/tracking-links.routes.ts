import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';
import type { TrackingLinksService } from './tracking-links.service.js';
import type { TrackingLinkStatus } from './tracking-links.types.js';

export interface CreateTrackingLinksRouterOptions {
  readonly service: TrackingLinksService;
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

function readRequiredNullableString(
  body: Record<string, unknown>,
  propertyName: string,
): string | null {
  const value = body[propertyName];

  if (value === null) {
    return null;
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

function readRequiredQueryParameters(
  body: Record<string, unknown>,
): Readonly<Record<string, string>> {
  const value = body['queryParameters'];

  if (!isRecord(value)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'queryParameters must be a JSON object.');
  }

  const queryParameters: Record<string, string> = {};

  for (const [key, parameterValue] of Object.entries(value)) {
    if (typeof parameterValue !== 'string') {
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'Every queryParameters value must be a string.',
      );
    }

    queryParameters[key] = parameterValue;
  }

  return Object.freeze(queryParameters);
}

function readOptionalCreateStatus(
  body: Record<string, unknown>,
): Extract<TrackingLinkStatus, 'draft' | 'active'> | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'draft':
    case 'active':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'A new tracking link status must be draft or active.',
      );
  }
}

function readOptionalStatus(
  body: Record<string, unknown>,
): Exclude<TrackingLinkStatus, 'archived'> | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'draft':
    case 'active':
    case 'paused':
      return value;
    case 'archived':
      throw new ApiHttpError(
        'TRACKING_LINK_ARCHIVE_ACTION_REQUIRED',
        400,
        'Use the dedicated tracking-link archive action instead of a generic update.',
      );
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be draft, active, or paused.',
      );
  }
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

function readOptionalStatusQuery(request: Request): TrackingLinkStatus | undefined {
  const value = readOptionalQueryString(request, 'status');

  switch (value) {
    case undefined:
      return undefined;
    case 'draft':
    case 'active':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_QUERY_PARAMETER',
        400,
        'status must be draft, active, paused, or archived.',
      );
  }
}

function resolveRequestInformation(request: Request) {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createTrackingLinksRouter(options: CreateTrackingLinksRouterOptions): Router {
  const router = Router();

  const createHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const status = readOptionalCreateStatus(body);

    const trackingLink = await options.service.createTrackingLink(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        offerId: readRequiredString(body, 'offerId'),
        trackingDomainId: readRequiredString(body, 'trackingDomainId'),
        ...(body['ownerMembershipId'] !== undefined
          ? {
              ownerMembershipId: readRequiredString(body, 'ownerMembershipId'),
            }
          : {}),
        ...(body['customSlug'] !== undefined
          ? {
              customSlug: readRequiredString(body, 'customSlug'),
            }
          : {}),
        ...(body['destinationUrl'] !== undefined
          ? {
              destinationUrl: readRequiredString(body, 'destinationUrl'),
            }
          : {}),
        ...(body['queryParameters'] !== undefined
          ? {
              queryParameters: readRequiredQueryParameters(body),
            }
          : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(201).json({
      data: {
        trackingLink,
      },
    });
  };

  const listHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);
    const offerId = readOptionalQueryString(request, 'offerId');
    const ownerMembershipId = readOptionalQueryString(request, 'ownerMembershipId');
    const status = readOptionalStatusQuery(request);

    const trackingLinks = await options.service.listTrackingLinks(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        ...(offerId !== undefined ? { offerId } : {}),
        ...(ownerMembershipId !== undefined ? { ownerMembershipId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: {
        trackingLinks,
      },
    });
  };

  const getHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const trackingLink = await options.service.getTrackingLink(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'linkId'),
    );

    response.status(200).json({
      data: {
        trackingLink,
      },
    });
  };

  const cloneHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const trackingLink = await options.service.cloneTrackingLink(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'linkId'),
    );

    response.status(201).json({
      data: {
        trackingLink,
      },
    });
  };

  const archiveHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const trackingLink = await options.service.archiveTrackingLink(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'linkId'),
    );

    response.status(200).json({
      data: {
        trackingLink,
      },
    });
  };

  const deleteHandler: RequestHandler = async (request, response) => {
    const requestInformation = resolveRequestInformation(request);

    const result = await options.service.deleteTrackingLink(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'linkId'),
    );

    response.status(200).json({ data: result });
  };

  const updateHandler: RequestHandler = async (request, response) => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const status = readOptionalStatus(body);

    const trackingLink = await options.service.updateTrackingLink(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'linkId'),
      {
        ...(body['trackingDomainId'] !== undefined
          ? {
              trackingDomainId: readRequiredString(body, 'trackingDomainId'),
            }
          : {}),
        ...(body['customSlug'] !== undefined
          ? {
              customSlug: readRequiredNullableString(body, 'customSlug'),
            }
          : {}),
        ...(body['destinationUrl'] !== undefined
          ? {
              destinationUrl: readRequiredString(body, 'destinationUrl'),
            }
          : {}),
        ...(body['queryParameters'] !== undefined
          ? {
              queryParameters: readRequiredQueryParameters(body),
            }
          : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: {
        trackingLink,
      },
    });
  };

  router.post('/companies/:companyId/tracking-links', createHandler);
  router.get('/companies/:companyId/tracking-links', listHandler);
  router.get('/companies/:companyId/tracking-links/:linkId', getHandler);
  router.post('/companies/:companyId/tracking-links/:linkId/clone', cloneHandler);
  router.post('/companies/:companyId/tracking-links/:linkId/archive', archiveHandler);
  router.patch('/companies/:companyId/tracking-links/:linkId', updateHandler);
  router.delete('/companies/:companyId/tracking-links/:linkId', deleteHandler);

  return router;
}
