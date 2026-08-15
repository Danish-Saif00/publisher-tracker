import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
import express from 'express';
import type { ErrorRequestHandler, Express, Request, RequestHandler, Response } from 'express';

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sendTargetingBlockedResponse(
  response: Response,
  input: Readonly<{
    title: string;
    message: string;
    detailLabel: string;
    detailValue: string;
    code: string;
    accent: string;
    icon: string;
  }>,
): void {
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message);
  const detailLabel = escapeHtml(input.detailLabel);
  const detailValue = escapeHtml(input.detailValue);
  const code = escapeHtml(input.code);
  response
    .status(403)
    .type('html')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#f8fbff 0,#edf4fa 48%,#e5eef7 100%);color:#122033;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(100%,620px);padding:44px 42px;border:1px solid rgba(255,255,255,.72);border-radius:24px;background:rgba(255,255,255,.98);box-shadow:0 28px 80px rgba(0,0,0,.34);text-align:center}.icon{width:92px;height:92px;margin:0 auto 24px;display:grid;place-items:center;border-radius:50%;background:${input.accent}18;color:${input.accent};font-size:44px;font-weight:800}.card h1{margin:0 0 12px;font-size:clamp(28px,5vw,38px);line-height:1.15}.lead{margin:0 auto 26px;max-width:480px;color:#53647a;font-size:17px;line-height:1.65}.detail{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:0 0 26px;padding:16px 18px;border:1px solid #dce5ef;border-radius:14px;background:#f8fafc;color:#53647a}.detail strong{color:${input.accent}}.notice{margin:0;padding:16px 18px;border-radius:14px;background:#eef6ff;color:#174a82;line-height:1.55}.code{display:inline-block;margin-top:24px;padding:9px 13px;border-radius:10px;background:${input.accent}14;color:${input.accent};font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}@media(max-width:560px){.card{padding:34px 22px}}@media(prefers-color-scheme:dark){body{background:radial-gradient(circle at top,#132b46 0,#081728 45%,#06111f 100%);color:#eef5fc}.card{background:#101e2d;border-color:#294057;box-shadow:0 28px 80px rgba(0,0,0,.48)}.lead{color:#a7b7c9}.detail{background:#0b1928;border-color:#294057;color:#a7b7c9}.notice{background:#132b43;color:#bbddff}}</style></head><body><main class="card"><div class="icon" aria-hidden="true">${input.icon}</div><h1>${title}</h1><p class="lead">${message}</p><div class="detail"><span>${detailLabel}:</span><strong>${detailValue}</strong></div><p class="notice">No destination redirect was performed.</p><span class="code">${code}</span></main></body></html>`);
}

function sendCountryUnavailableResponse(response: Response, countryCode: string | null): void {
  sendTargetingBlockedResponse(response, {
    title: 'Country Not Matched',
    message: 'This offer is restricted to selected countries and is not available from your detected location.',
    detailLabel: 'Detected country',
    detailValue: countryCode ?? 'Not found',
    code: 'COUNTRY_NOT_SELECTED',
    accent: '#ef4444',
    icon: '&#8855;',
  });
}

function sendDeviceUnavailableResponse(
  response: Response,
  device: 'desktop' | 'android' | 'ios' | null,
): void {
  sendTargetingBlockedResponse(response, {
    title: 'Device Not Matched',
    message: 'This offer is restricted to selected devices and is not available on your detected device.',
    detailLabel: 'Detected device',
    detailValue: device ?? 'Not found',
    code: 'DEVICE_NOT_SELECTED',
    accent: '#7c3aed',
    icon: '&#9888;',
  });
}

function sendAnonymousTrafficBlockedResponse(response: Response): void {
  sendTargetingBlockedResponse(response, {
    title: 'VPN / Proxy Detected',
    message: 'A VPN, proxy, Tor, or other anonymized connection was detected. Turn it off and try again.',
    detailLabel: 'Connection status',
    detailValue: 'Anonymized traffic detected',
    code: 'ANONYMIZED_TRAFFIC_DETECTED',
    accent: '#f59e0b',
    icon: '&#9888;',
  });
}

function sendOfferDayUnavailableResponse(
  response: Response,
  timezone: string,
): void {
  sendTargetingBlockedResponse(response, {
    title: 'Offer Not Available Today',
    message: 'This offer is not scheduled to run on the current day.',
    detailLabel: 'Schedule timezone',
    detailValue: timezone,
    code: 'OFFER_DAY_NOT_ACTIVE',
    accent: '#0ea5e9',
    icon: '&#128197;',
  });
}

function sendOfferTimeUnavailableResponse(
  response: Response,
  timezone: string,
  localTime: string,
): void {
  sendTargetingBlockedResponse(response, {
    title: 'Offer Not Available at This Time',
    message: 'This offer is outside its configured active time window.',
    detailLabel: 'Current local time',
    detailValue: localTime + ' (' + timezone + ')',
    code: 'OFFER_TIME_NOT_ACTIVE',
    accent: '#0ea5e9',
    icon: '&#128337;',
  });
}

function readRouteParameter(request: Request, propertyName: string): string {
  const value = request.params[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TrackingRedirectNotFoundError();
  }

  return value;
}

function readQueryParameter(request: Request, propertyName: string): string {
  const value = request.query[propertyName];

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

async function resolveReferenceRedirect(
  request: Request,
  response: Response,
  options: CreateTrackerAppOptions,
  publisherPublicId: string,
  offerPublicId: string,
): Promise<void> {
  const userAgent = request.get('user-agent');
  const referrer = request.get('referer') ?? request.get('referrer');
  const cookieHeader = request.headers.cookie;

  const redirect = await options.trackingLinkResolverService.resolveRedirect({
    hostname: request.hostname,
    publisherPublicId,
    offerPublicId,
    ipAddress: request.ip ?? request.socket.remoteAddress ?? 'unknown',
    requestPath: request.path,
    query: request.query,
    ...(userAgent !== undefined ? { userAgent } : {}),
    ...(referrer !== undefined ? { referrer } : {}),
    ...(cookieHeader !== undefined ? { cookieHeader } : {}),
  });

  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('referrer-policy', 'no-referrer');

  if (redirect.setCookieHeader !== null) {
    response.append('set-cookie', redirect.setCookieHeader);
  }

  if (redirect.blocked) {
    if (redirect.blockReason === 'traffic') {
      sendAnonymousTrafficBlockedResponse(response);
      return;
    }
    if (redirect.blockReason === 'country') {
      sendCountryUnavailableResponse(response, redirect.countryCode);
      return;
    }
    if (redirect.blockReason === 'device') {
      sendDeviceUnavailableResponse(response, redirect.device);
      return;
    }
    if (redirect.blockReason === 'day') {
      sendOfferDayUnavailableResponse(
        response,
        redirect.scheduleTimezone,
      );
      return;
    }
    if (redirect.blockReason === 'time') {
      sendOfferTimeUnavailableResponse(
        response,
        redirect.scheduleTimezone,
        redirect.scheduleLocalTime,
      );
      return;
    }
    return;
  }

  response.redirect(302, redirect.location);
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

  app.get('/', async (request, response) => {
    await resolveReferenceRedirect(
      request,
      response,
      options,
      readQueryParameter(request, 'pub_id'),
      readQueryParameter(request, 'offer_id'),
    );
  });

  app.get('/pub_id=:publisherId', async (request, response) => {
    await resolveReferenceRedirect(
      request,
      response,
      options,
      readRouteParameter(request, 'publisherId'),
      readQueryParameter(request, 'offer_id'),
    );
  });

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

    if (redirect.blocked) {
      if (redirect.blockReason === 'traffic') {
        sendAnonymousTrafficBlockedResponse(response);
        return;
      }
      if (redirect.blockReason === 'country') {
        sendCountryUnavailableResponse(response, redirect.countryCode);
        return;
      }
      if (redirect.blockReason === 'device') {
        sendDeviceUnavailableResponse(response, redirect.device);
        return;
      }
      if (redirect.blockReason === 'day') {
        sendOfferDayUnavailableResponse(
          response,
          redirect.scheduleTimezone,
        );
        return;
      }
      if (redirect.blockReason === 'time') {
        sendOfferTimeUnavailableResponse(
          response,
          redirect.scheduleTimezone,
          redirect.scheduleLocalTime,
        );
        return;
      }
      return;
    }
    response.redirect(302, redirect.location);
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));

  return app;
}
