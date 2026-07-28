import {
  assertCompanyAccess,
  AuthenticationError,
  AuthorizationError,
  type AccessTokenVerifier,
} from '@affiliate-tracker/auth';
import { DatabaseError } from '@affiliate-tracker/database';
import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import type { ErrorRequestHandler, Express, Request, RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { createAuthenticationMiddleware } from './authentication.middleware.js';
import { createBillingFoundationRouter } from './billing-foundation.routes.js';
import type { BillingFoundationService } from './billing-foundation.service.js';
import { createCatalogOperationsRouter } from './catalog-operations.routes.js';
import type { CatalogOperationsService } from './catalog-operations.service.js';
import { createCompanyManagementRouter } from './company-management.routes.js';
import { createCompanyInvitationsRouter } from './company-invitations.routes.js';
import type { CompanyInvitationsService } from './company-invitations.service.js';
import { createConversionPostbacksRouter } from './conversion-postbacks.routes.js';
import { createCompanyOperationsRouter } from './reporting-customization.routes.js';
import type { CompanyOperationsService } from './reporting-customization.service.js';
import type { ConversionPostbacksService } from './conversion-postbacks.service.js';
import { createDuplicateFraudRouter } from './duplicate-fraud.routes.js';
import { createFinalOperationsRouter } from './final-operations.routes.js';
import type { FinalOperationsService } from './final-operations.service.js';
import type { DuplicateFraudService } from './duplicate-fraud.service.js';
import type { CompanyManagementService } from './company-management.service.js';
import { createOpenApiDocument } from './openapi.document.js';
import { createOffersPayoutRouter } from './offers-payout.routes.js';
import type { OffersPayoutService } from './offers-payout.service.js';
import { createTrackingLinksRouter } from './tracking-links.routes.js';
import type { TrackingLinksService } from './tracking-links.service.js';
import { createTenantAdministrationRouter } from './tenant-administration.routes.js';
import { createTrackingNetworksRouter } from './tracking-networks.routes.js';
import type { TrackingNetworksService } from './tracking-networks.service.js';
import type { TenantAdministrationService } from './tenant-administration.service.js';
import type { ApiRuntimeConfig } from './config.js';
import {
  createApiCorsMiddleware,
  createApiRateLimitMiddleware,
  createApiSecurityHeadersMiddleware,
} from './http-hardening.middleware.js';
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

interface BodyParserFailure {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
}

interface BodyParserErrorLike {
  readonly type?: unknown;
}

export interface CreateAppOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ObservabilityLogger;
  readonly readinessCheck: () => Promise<void>;
  readonly tokenVerifier: AccessTokenVerifier;
  readonly identityResolver: ApiIdentityResolver;
  readonly billingFoundationService: BillingFoundationService;
  readonly catalogOperationsService: CatalogOperationsService;
  readonly companyManagementService: CompanyManagementService;
  readonly companyInvitationsService: CompanyInvitationsService;
  readonly conversionPostbacksService: ConversionPostbacksService;
  readonly companyOperationsService: CompanyOperationsService;
  readonly duplicateFraudService: DuplicateFraudService;
  readonly finalOperationsService: FinalOperationsService;
  readonly offersPayoutService: OffersPayoutService;
  readonly trackingLinksService: TrackingLinksService;
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

function isBodyParserErrorLike(value: unknown): value is BodyParserErrorLike {
  return typeof value === 'object' && value !== null;
}

function readBodyParserFailure(error: unknown): BodyParserFailure | undefined {
  if (!isBodyParserErrorLike(error)) {
    return undefined;
  }

  if (error.type === 'entity.too.large') {
    return {
      code: 'REQUEST_BODY_TOO_LARGE',
      message: 'The request body exceeds the configured size limit.',
      statusCode: 413,
    };
  }

  if (error.type === 'entity.parse.failed') {
    return {
      code: 'REQUEST_BODY_INVALID',
      message: 'The request body could not be parsed.',
      statusCode: 400,
    };
  }

  return undefined;
}

const healthCheckHandler: RequestHandler = (request, response): void => {
  response.status(200).json({
    status: 'ok',
    service: 'api',
    requestId: resolveRequestId(request),
    timestamp: new Date().toISOString(),
  });
};


function createReadinessHandler(
  readinessCheck: () => Promise<void>,
  logger: ObservabilityLogger,
): RequestHandler {
  return async (request, response): Promise<void> => {
    const requestId = resolveRequestId(request);

    try {
      await readinessCheck();

      response.status(200).json({
        status: 'ready',
        service: 'api',
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logger.error(
        {
          error: serializeError(error),
          requestId,
        },
        'API readiness check failed.',
      );

      response
        .status(503)
        .json(
          createErrorResponse(
            'SERVICE_NOT_READY',
            'The API is not ready to serve requests.',
            requestId,
          ),
        );
    }
  };
}

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
    const bodyParserFailure = readBodyParserFailure(error);

    if (bodyParserFailure !== undefined) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'API request-body parsing failed.',
      );

      response
        .status(bodyParserFailure.statusCode)
        .json(createErrorResponse(bodyParserFailure.code, bodyParserFailure.message, requestId));

      return;
    }

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

    if (error instanceof DatabaseError) {
      logger.error(
        {
          error: serializeError(error),
          requestId,
        },
        'API database operation failed.',
      );

      response
        .status(error.retriable ? 503 : 500)
        .json(
          createErrorResponse(
            error.retriable ? 'DATABASE_UNAVAILABLE' : 'DATABASE_OPERATION_FAILED',
            error.retriable
              ? 'The database is temporarily unavailable.'
              : 'A database operation failed.',
            requestId,
          ),
        );

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
  const openApiDocument = createOpenApiDocument(options.config.server.basePath);

  app.disable('x-powered-by');

  app.set('trust proxy', options.config.server.trustProxy);

  app.use(requestIdMiddleware);

  app.use(
    createApiSecurityHeadersMiddleware({
      environment: options.config.application.environment,
      openApiJsonPath: options.config.swagger.openApiJsonPath,
      swaggerDocumentationPath: options.config.swagger.documentationPath,
    }),
  );

  app.use(
    createApiCorsMiddleware({
      allowedOrigins: options.config.cors.allowedOrigins,
    }),
  );

  app.use(
    createApiRateLimitMiddleware({
      maxRequests: options.config.rateLimit.maxRequests,
      skipPaths: ['/health', '/ready'],
      windowMs: options.config.rateLimit.windowMs,
    }),
  );

  if (options.config.swagger.enabled) {
    app.get(options.config.swagger.openApiJsonPath, (_request, response): void => {
      response.status(200).json(openApiDocument);
    });

    app.use(
      options.config.swagger.documentationPath,
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument, {
        customSiteTitle: 'Affiliate Tracker API Documentation',
        swaggerOptions: {
          displayRequestDuration: true,
          persistAuthorization: true,
        },
      }),
    );
  }

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
  app.get('/ready', createReadinessHandler(options.readinessCheck, options.logger));

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
    createCompanyInvitationsRouter({
      service: options.companyInvitationsService,
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
    createCatalogOperationsRouter({
      service: options.catalogOperationsService,
    }),
  );

  authenticatedApiRouter.use(
    createTrackingNetworksRouter({
      service: options.trackingNetworksService,
    }),
  );

  authenticatedApiRouter.use(
    createDuplicateFraudRouter({
      service: options.duplicateFraudService,
    }),
  );

  authenticatedApiRouter.use(
    createConversionPostbacksRouter({
      service: options.conversionPostbacksService,
    }),
  );

  authenticatedApiRouter.use(
    createCompanyOperationsRouter({
      service: options.companyOperationsService,
    }),
  );

  authenticatedApiRouter.use(
    createFinalOperationsRouter({
      service: options.finalOperationsService,
    }),
  );

  authenticatedApiRouter.use(
    createOffersPayoutRouter({
      service: options.offersPayoutService,
    }),
  );

  authenticatedApiRouter.use(
    createTrackingLinksRouter({
      service: options.trackingLinksService,
    }),
  );

  app.use(options.config.server.basePath, authenticationMiddleware, authenticatedApiRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return app;
}
