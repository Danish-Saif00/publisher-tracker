import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
import express from 'express';
import type { ErrorRequestHandler, Express, Request, RequestHandler } from 'express';

import type { TrackerRuntimeConfig } from './config.js';
import {
  createTrackerRateLimitMiddleware,
  createTrackerSecurityHeadersMiddleware,
} from './http-hardening.middleware.js';
import { createNetworkPostbackRouter } from './network-postback.routes.js';
import {
  NetworkPostbackHttpError,
  type NetworkPostbackService,
} from './network-postback.service.js';
import { getTrackerRequestId, trackerRequestIdMiddleware } from './request-id.middleware.js';
import {
  TrackingRedirectNotFoundError,
  type TrackingLinkResolverService,
} from './tracking-link-resolver.service.js';

interface TrackerErrorResponse {
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

export interface CreateTrackerAppOptions {
  readonly config: TrackerRuntimeConfig;
  readonly logger: ObservabilityLogger;
  readonly networkPostbackService: NetworkPostbackService;
  readonly readinessCheck: () => Promise<void>;
  readonly trackingLinkResolverService: TrackingLinkResolverService;
}

function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
): TrackerErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
    },
  };
}

function readRouteParameter(request: Request, propertyName: string): string {
  const value = request.params[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TrackingRedirectNotFoundError();
  }

  return value;
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
      code: 'TRACKER_REQUEST_BODY_TOO_LARGE',
      message: 'The request body exceeds the configured size limit.',
      statusCode: 413,
    };
  }

  if (error.type === 'entity.parse.failed') {
    return {
      code: 'TRACKER_REQUEST_BODY_INVALID',
      message: 'The request body could not be parsed.',
      statusCode: 400,
    };
  }

  return undefined;
}

const healthCheckHandler: RequestHandler = (_request, response): void => {
  response.status(200).json({
    status: 'ok',
    service: 'tracker',
    requestId: getTrackerRequestId(response),
    timestamp: new Date().toISOString(),
  });
};

function createReadinessHandler(
  readinessCheck: () => Promise<void>,
  logger: ObservabilityLogger,
): RequestHandler {
  return async (_request, response): Promise<void> => {
    const requestId = getTrackerRequestId(response);

    try {
      await readinessCheck();

      response.status(200).json({
        status: 'ready',
        service: 'tracker',
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logger.error(
        {
          error: serializeError(error),
          requestId,
        },
        'Tracker readiness check failed.',
      );

      response
        .status(503)
        .json(
          createErrorResponse(
            'TRACKER_SERVICE_NOT_READY',
            'The tracker is not ready to serve requests.',
            requestId,
          ),
        );
    }
  };
}

const notFoundHandler: RequestHandler = (_request, response): void => {
  response
    .status(404)
    .json(
      createErrorResponse(
        'TRACKING_ROUTE_NOT_FOUND',
        'The tracking route was not found.',
        getTrackerRequestId(response),
      ),
    );
};

function createErrorHandler(logger: ObservabilityLogger): ErrorRequestHandler {
  return (error: unknown, _request, response, next): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const requestId = getTrackerRequestId(response);
    const bodyParserFailure = readBodyParserFailure(error);

    if (bodyParserFailure !== undefined) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'Tracker request-body parsing failed.',
      );

      response
        .status(bodyParserFailure.statusCode)
        .json(createErrorResponse(bodyParserFailure.code, bodyParserFailure.message, requestId));

      return;
    }

    if (error instanceof NetworkPostbackHttpError) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'Tracker network postback request failed.',
      );

      response
        .status(error.statusCode)
        .json(createErrorResponse(error.code, error.message, requestId));

      return;
    }

    if (error instanceof TrackingRedirectNotFoundError) {
      logger.warn(
        {
          error: serializeError(error),
          requestId,
        },
        'Tracker redirect resolution failed.',
      );

      response
        .status(404)
        .json(
          createErrorResponse(
            'TRACKING_LINK_NOT_FOUND',
            'The requested tracking link is unavailable.',
            requestId,
          ),
        );

      return;
    }

    logger.error(
      {
        error: serializeError(error),
        requestId,
      },
      'Unhandled tracker request failure.',
    );

    response
      .status(500)
      .json(
        createErrorResponse('TRACKER_INTERNAL_ERROR', 'An unexpected error occurred.', requestId),
      );
  };
}

export function createApp(options: CreateTrackerAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.config.server.trustProxy);

  app.use(trackerRequestIdMiddleware);

  app.use(
    createTrackerSecurityHeadersMiddleware({
      environment: options.config.application.environment,
    }),
  );

  app.use(
    createTrackerRateLimitMiddleware({
      maxRequests: options.config.rateLimit.maxRequests,
      skipPaths: ['/health', '/ready'],
      windowMs: options.config.rateLimit.windowMs,
    }),
  );

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

  app.use(
    createNetworkPostbackRouter({
      service: options.networkPostbackService,
    }),
  );

  app.get('/r/:token', async (request, response) => {
    const userAgent = request.get('user-agent');
    const referrer = request.get('referer') ?? request.get('referrer');
    const cookieHeader = request.headers.cookie;

    const redirect = await options.trackingLinkResolverService.resolveRedirect({
      hostname: request.hostname,
      publicToken: readRouteParameter(request, 'token'),
      ipAddress: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      requestPath: request.path,
      query: request.query,
      ...(userAgent !== undefined
        ? {
            userAgent,
          }
        : {}),
      ...(referrer !== undefined
        ? {
            referrer,
          }
        : {}),
      ...(cookieHeader !== undefined
        ? {
            cookieHeader,
          }
        : {}),
    });

    response.setHeader('cache-control', 'no-store, max-age=0');
    response.setHeader('pragma', 'no-cache');
    response.setHeader('referrer-policy', 'no-referrer');

    if (redirect.setCookieHeader !== null) {
      response.append('set-cookie', redirect.setCookieHeader);
    }

    response.redirect(302, redirect.location);
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return app;
}
