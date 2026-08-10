import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import type { ManagedUsersService } from './managed-users.service.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';

export interface CreateManagedUsersRouterOptions {
  readonly service: ManagedUsersService;
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

  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a non-empty string.`,
    );
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
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a string when provided.`,
    );
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

function resolveRequestInformation(request: Request) {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createManagedUsersRouter(options: CreateManagedUsersRouterOptions): Router {
  const router = Router();

  const createHandler: RequestHandler = async (request, response): Promise<void> => {
    const body = readBody(request);
    const information = resolveRequestInformation(request);

    const user = await options.service.createManagedUser(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      {
        email: readRequiredString(body, 'email'),
        password: readRequiredString(body, 'password'),
      },
    );

    response.status(201).json({
      data: {
        user,
      },
    });
  };

  const updateHandler: RequestHandler = async (request, response): Promise<void> => {
    const body = readBody(request);
    const information = resolveRequestInformation(request);
    const email = readOptionalString(body, 'email');
    const displayName = readOptionalString(body, 'displayName');
    const password = readOptionalString(body, 'password');

    const result = await options.service.updateManagedUser(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'userId'),
      {
        ...(email !== undefined ? { email } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(password !== undefined ? { password } : {}),
      },
    );

    response.status(200).json({
      data: result,
    });
  };

  const resetPasswordHandler: RequestHandler = async (request, response): Promise<void> => {
    const body = readBody(request);
    const information = resolveRequestInformation(request);

    const result = await options.service.resetManagedUserPassword(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'userId'),
      {
        password: readRequiredString(body, 'password'),
      },
    );

    response.status(200).json({
      data: result,
    });
  };  router.post('/companies/:companyId/managed-users', createHandler);
  router.patch('/companies/:companyId/managed-users/:userId', updateHandler);
  router.patch('/companies/:companyId/managed-users/:userId/password', resetPasswordHandler);

  return router;
}
