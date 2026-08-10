import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import type { FactoryResetService } from './factory-reset.service.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';

export interface CreateFactoryResetRouterOptions {
  readonly service: FactoryResetService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfirmation(request: Request): string {
  const body = request.body as unknown;

  if (!isRecord(body)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'The request body must be a JSON object.',
    );
  }

  const confirmation = body['confirmation'];

  if (typeof confirmation !== 'string' || confirmation.length === 0) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'confirmation must be a non-empty string.',
    );
  }

  return confirmation;
}

function readCompanyId(request: Request): string {
  const value = request.params['companyId'];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, 'companyId is required.');
  }

  return value;
}

export function createFactoryResetRouter(
  options: CreateFactoryResetRouterOptions,
): Router {
  const router = Router();

  const resetTrackerHandler: RequestHandler = async (request, response): Promise<void> => {
    const report = await options.service.resetTracker(
      getResolvedIdentity(request),
      getRequestContext(request).requestId,
      readConfirmation(request),
    );

    response.status(200).json({
      data: report,
    });
  };

  const resetCompanyHandler: RequestHandler = async (request, response): Promise<void> => {
    const report = await options.service.resetCompany(
      getResolvedIdentity(request),
      getRequestContext(request).requestId,
      readCompanyId(request),
      readConfirmation(request),
    );

    response.status(200).json({
      data: report,
    });
  };

  router.post('/platform/factory-reset', resetTrackerHandler);
  router.post('/companies/:companyId/factory-reset', resetCompanyHandler);

  return router;
}
