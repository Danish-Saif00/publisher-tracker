import {
  assertCompanyAccess,
  AuthenticationError,
  AuthorizationError,
  type AccessTokenVerifier,
} from '@affiliate-tracker/auth';
import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
import express from 'express';
import type { ErrorRequestHandler, Express, Request, RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { createAuthenticationMiddleware } from './authentication.middleware.js';
import { createBillingFoundationRouter } from './billing-foundation.routes.js';
import type { BillingFoundationService } from './billing-foundation.service.js';
import { createCompanyManagementRouter } from './company-management.routes.js';
import type { CompanyManagementService } from './company-management.service.js';
import { createTenantAdministrationRouter } from './tenant-administration.routes.js';
import { createTrackingNetworksRouter } from './tracking-networks.routes.js';
import type { TrackingNetworksService } from './tracking-networks.service.js';
import type { TenantAdministrationService } from './tenant-administration.service.js';
import type { ApiRuntimeConfig } from './config.js';
import type { ApiIdentityResolver } from './identity-resolver.js';
import { getRequestId, getResolvedIdentity } from './request-context.js';
import { requestIdMiddleware } from './request-id.middleware.js';

interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

export interface CreateAppOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ObservabilityLogger;
  readonly tokenVerifier: AccessTokenVerifier;
  readonly identityResolver: ApiIdentityResolver;
  readonly billingFoundationService: BillingFoundationService;
  readonly companyManagementService: CompanyManagementService;
  readonly tenantAdministrationService: TenantAdministrationService;
  readonly trackingNetworksService: TrackingNetworksService;
}

function createErrorResponse(code: string, message: string, requestId: string): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
    },
  };
}

function resolveRequestId(request: Request): string {
  return getRequestId(request) ?? 'unavailable';
}

function joinApiPath(basePath: string, routePath: string): string {
  return basePath === '/' ? routePath : `${basePath}${routePath}`;
}

const healthCheckHandler: RequestHandler = (request, response): void => {
  response.status(200).json({
    status: 'ok',
    service: 'api',
    requestId: resolveRequestId(request),
    timestamp: new Date().toISOString(),
  });
};

const authenticatedIdentityHandler: RequestHandler = (request, response): void => {
  const identity = getResolvedIdentity(request);

  if (identity.requestedCompanyId !== undefined) {
    assertCompanyAccess(identity.subject, identity.companyMembership, identity.requestedCompanyId);
  }

  response.status(200).json({
    data: {
      requestId: resolveRequestId(request),
      user: {
        id: identity.actor.userId,
        sessionId: identity.actor.sessionId,
        assuranceLevel: identity.actor.assuranceLevel,
        isAnonymous: identity.actor.isAnonymous,
        ...(identity.actor.email !== undefined
          ? {
              email: identity.actor.email,
            }
          : {}),
        ...(identity.actor.phone !== undefined
          ? {
              phone: identity.actor.phone,
            }
          : {}),
      },
      authorization: {
        platformRole: identity.subject.platformRole ?? null,
        requestedCompanyId: identity.requestedCompanyId ?? null,
        companyMembership: identity.companyMembership ?? null,
      },
    },
  });
};

const notFoundHandler: RequestHandler = (request, response): void => {
  response
    .status(404)
    .json(
      createErrorResponse(
        'RESOURCE_NOT_FOUND',
        'The requested resource was not found.',
        resolveRequestId(request),
      ),
    );
};

function createErrorHandler(logger: ObservabilityLogger): ErrorRequestHandler {
  return (error: unknown, request, response, next): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const requestId = resolveRequestId(request);

    if (error instanceof AuthenticationError) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'API authentication failed.',
      );

      response.setHeader('www-authenticate', 'Bearer');

      response
        .status(error.statusCode)
        .json(createErrorResponse(error.code, error.message, requestId));

      return;
    }

    if (error instanceof AuthorizationError) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'API authorization failed.',
      );

      response
        .status(error.statusCode)
        .json(createErrorResponse(error.code, error.message, requestId));

      return;
    }

    if (error instanceof ApiHttpError) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'API request validation failed.',
      );

      response
        .status(error.statusCode)
        .json(createErrorResponse(error.code, error.message, requestId));

      return;
    }

    logger.error(
      {
        error: serializeError(error),
        requestId,
      },
      'Unhandled API request failure.',
    );

    response
      .status(500)
      .json(
        createErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', requestId),
      );
  };
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const authenticationMiddleware = createAuthenticationMiddleware({
    tokenVerifier: options.tokenVerifier,
    identityResolver: options.identityResolver,
  });

  const authenticatedApiRouter = express.Router();

  app.disable('x-powered-by');

  app.set('trust proxy', options.config.server.trustProxy);

  app.use(requestIdMiddleware);

  app.use(
    express.json({
      limit: options.config.server.requestBodyLimit,
    }),
  );

  app.use(
    express.urlencoded({
      extended: false,
      limit: options.config.server.requestBodyLimit,
    }),
  );

  app.get('/health', healthCheckHandler);

  app.get(
    joinApiPath(options.config.server.basePath, '/auth/me'),
    authenticationMiddleware,
    authenticatedIdentityHandler,
  );

  authenticatedApiRouter.use(
    createCompanyManagementRouter({
      service: options.companyManagementService,
    }),
  );

  authenticatedApiRouter.use(
    createTenantAdministrationRouter({
      service: options.tenantAdministrationService,
    }),
  );

  authenticatedApiRouter.use(
    createBillingFoundationRouter({
      service: options.billingFoundationService,
    }),
  );

  authenticatedApiRouter.use(
    createTrackingNetworksRouter({
      service: options.trackingNetworksService,
    }),
  );

  app.use(options.config.server.basePath, authenticationMiddleware, authenticatedApiRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return app;
}
