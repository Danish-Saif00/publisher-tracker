import { serializeError } from '@affiliate-tracker/observability';
import express from 'express';
import { createTrackerRateLimitMiddleware, createTrackerSecurityHeadersMiddleware, } from './http-hardening.middleware.js';
import { createNetworkPostbackRouter } from './network-postback.routes.js';
import { NetworkPostbackHttpError, } from './network-postback.service.js';
import { getTrackerRequestId, trackerRequestIdMiddleware } from './request-id.middleware.js';
import { TrackingRedirectNotFoundError, } from './tracking-link-resolver.service.js';
function createErrorResponse(code, message, requestId) {
    return {
        error: {
            code,
            message,
            requestId,
        },
    };
}
function readRouteParameter(request, propertyName) {
    const value = request.params[propertyName];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TrackingRedirectNotFoundError();
    }
    return value;
}
function readQueryParameter(request, propertyName) {
    const value = request.query[propertyName];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TrackingRedirectNotFoundError();
    }
    return value;
}
function isBodyParserErrorLike(value) {
    return typeof value === 'object' && value !== null;
}
function readBodyParserFailure(error) {
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
const healthCheckHandler = (_request, response) => {
    response.status(200).json({
        status: 'ok',
        service: 'tracker',
        requestId: getTrackerRequestId(response),
        timestamp: new Date().toISOString(),
    });
};
function createReadinessHandler(readinessCheck, logger) {
    return async (_request, response) => {
        const requestId = getTrackerRequestId(response);
        try {
            await readinessCheck();
            response.status(200).json({
                status: 'ready',
                service: 'tracker',
                requestId,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            logger.error({
                error: serializeError(error),
                requestId,
            }, 'Tracker readiness check failed.');
            response
                .status(503)
                .json(createErrorResponse('TRACKER_SERVICE_NOT_READY', 'The tracker is not ready to serve requests.', requestId));
        }
    };
}
const notFoundHandler = (_request, response) => {
    response
        .status(404)
        .json(createErrorResponse('TRACKING_ROUTE_NOT_FOUND', 'The tracking route was not found.', getTrackerRequestId(response)));
};
function createErrorHandler(logger) {
    return (error, _request, response, next) => {
        if (response.headersSent) {
            next(error);
            return;
        }
        const requestId = getTrackerRequestId(response);
        const bodyParserFailure = readBodyParserFailure(error);
        if (bodyParserFailure !== undefined) {
            logger.warn({
                error: serializeError(error),
                requestId,
            }, 'Tracker request-body parsing failed.');
            response
                .status(bodyParserFailure.statusCode)
                .json(createErrorResponse(bodyParserFailure.code, bodyParserFailure.message, requestId));
            return;
        }
        if (error instanceof NetworkPostbackHttpError) {
            logger.warn({
                error: serializeError(error),
                requestId,
            }, 'Tracker network postback request failed.');
            response
                .status(error.statusCode)
                .json(createErrorResponse(error.code, error.message, requestId));
            return;
        }
        if (error instanceof TrackingRedirectNotFoundError) {
            logger.warn({
                error: serializeError(error),
                requestId,
            }, 'Tracker redirect resolution failed.');
            response
                .status(404)
                .json(createErrorResponse('TRACKING_LINK_NOT_FOUND', 'The requested tracking link is unavailable.', requestId));
            return;
        }
        logger.error({
            error: serializeError(error),
            requestId,
        }, 'Unhandled tracker request failure.');
        response
            .status(500)
            .json(createErrorResponse('TRACKER_INTERNAL_ERROR', 'An unexpected error occurred.', requestId));
    };
}
export function createApp(options) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', options.config.server.trustProxy);
    app.use(trackerRequestIdMiddleware);
    app.use(createTrackerSecurityHeadersMiddleware({
        environment: options.config.application.environment,
    }));
    app.use(createTrackerRateLimitMiddleware({
        maxRequests: options.config.rateLimit.maxRequests,
        skipPaths: ['/health', '/ready'],
        windowMs: options.config.rateLimit.windowMs,
    }));
    app.use(express.json({
        limit: options.config.server.requestBodyLimit,
    }));
    app.use(express.urlencoded({
        extended: false,
        limit: options.config.server.requestBodyLimit,
    }));
    app.get('/health', healthCheckHandler);
    app.get('/ready', createReadinessHandler(options.readinessCheck, options.logger));
    app.use(createNetworkPostbackRouter({
        service: options.networkPostbackService,
    }));
    app.get('/pub_id=:publisherId', async (request, response) => {
        const userAgent = request.get('user-agent');
        const referrer = request.get('referer') ?? request.get('referrer');
        const cookieHeader = request.headers.cookie;
        const redirect = await options.trackingLinkResolverService.resolveRedirect({
            hostname: request.hostname,
            publisherPublicId: readRouteParameter(request, 'publisherId'),
            offerPublicId: readQueryParameter(request, 'offer_id'),
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
            response
                .status(403)
                .json(createErrorResponse('TRACKING_CLICK_BLOCKED', 'This tracking request was blocked by traffic protection.', getTrackerRequestId(response)));
            return;
        }
        response.redirect(302, redirect.location);
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
            response
                .status(403)
                .json(createErrorResponse('TRACKING_CLICK_BLOCKED', 'This tracking request was blocked by traffic protection.', getTrackerRequestId(response)));
            return;
        }
        response.redirect(302, redirect.location);
    });
    app.use(notFoundHandler);
    app.use(createErrorHandler(options.logger));
    return app;
}
//# sourceMappingURL=app.js.map