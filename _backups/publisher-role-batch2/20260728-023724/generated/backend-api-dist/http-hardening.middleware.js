import { getRequestId } from './request-context.js';
function createErrorResponse(code, message, request) {
    return Object.freeze({
        error: Object.freeze({
            code,
            message,
            requestId: getRequestId(request) ?? 'unavailable',
        }),
    });
}
function normalizeAllowedOrigins(origins) {
    return new Set(origins.map((origin) => {
        const parsedOrigin = new URL(origin);
        return parsedOrigin.origin;
    }));
}
function appendVaryHeader(response, value) {
    response.vary(value);
}
function applyCorsResponseHeaders(response, origin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    response.setHeader('access-control-allow-headers', 'authorization,content-type,idempotency-key,x-company-id,x-request-id');
    response.setHeader('access-control-expose-headers', 'ratelimit-limit,ratelimit-remaining,ratelimit-reset,retry-after,x-request-id');
    response.setHeader('access-control-max-age', '600');
}
export function createApiCorsMiddleware(options) {
    const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins);
    return (request, response, next) => {
        const origin = request.get('origin');
        appendVaryHeader(response, 'Origin');
        if (origin === undefined) {
            next();
            return;
        }
        if (!allowedOrigins.has(origin)) {
            response
                .status(403)
                .json(createErrorResponse('CORS_ORIGIN_DENIED', 'The request origin is not allowed.', request));
            return;
        }
        applyCorsResponseHeaders(response, origin);
        if (request.method === 'OPTIONS') {
            response.status(204).end();
            return;
        }
        next();
    };
}
function resolveClientAddress(request) {
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
function pruneExpiredBuckets(buckets, now) {
    for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
            buckets.delete(key);
        }
    }
}
function applyRateLimitHeaders(response, maxRequests, remainingRequests, resetAt) {
    response.setHeader('ratelimit-limit', String(maxRequests));
    response.setHeader('ratelimit-remaining', String(Math.max(0, remainingRequests)));
    response.setHeader('ratelimit-reset', String(Math.ceil(resetAt / 1_000)));
}
export function createApiRateLimitMiddleware(options) {
    const skippedPaths = new Set(options.skipPaths ?? []);
    const buckets = new Map();
    let nextCleanupAt = Date.now() + options.windowMs;
    return (request, response, next) => {
        if (skippedPaths.has(request.path)) {
            next();
            return;
        }
        const now = Date.now();
        if (now >= nextCleanupAt) {
            pruneExpiredBuckets(buckets, now);
            nextCleanupAt = now + options.windowMs;
        }
        const key = resolveClientAddress(request);
        const currentBucket = buckets.get(key);
        const bucket = currentBucket === undefined || currentBucket.resetAt <= now
            ? {
                count: 0,
                resetAt: now + options.windowMs,
            }
            : currentBucket;
        bucket.count += 1;
        buckets.set(key, bucket);
        const remainingRequests = options.maxRequests - bucket.count;
        applyRateLimitHeaders(response, options.maxRequests, remainingRequests, bucket.resetAt);
        if (bucket.count > options.maxRequests) {
            const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
            response.setHeader('retry-after', String(retryAfterSeconds));
            response
                .status(429)
                .json(createErrorResponse('RATE_LIMIT_EXCEEDED', 'Too many requests were received. Retry later.', request));
            return;
        }
        next();
    };
}
function createContentSecurityPolicy(requestPath, options) {
    const isSwaggerRoute = requestPath === options.openApiJsonPath ||
        requestPath === options.swaggerDocumentationPath ||
        requestPath.startsWith(`${options.swaggerDocumentationPath}/`);
    return isSwaggerRoute
        ? [
            "default-src 'self'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'none'",
            "img-src 'self' data:",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
        ].join('; ')
        : [
            "default-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'none'",
        ].join('; ');
}
export function createApiSecurityHeadersMiddleware(options) {
    return (request, response, next) => {
        response.setHeader('content-security-policy', createContentSecurityPolicy(request.path, options));
        response.setHeader('cross-origin-opener-policy', 'same-origin');
        response.setHeader('cross-origin-resource-policy', 'same-site');
        response.setHeader('permissions-policy', 'camera=(), geolocation=(), microphone=()');
        response.setHeader('referrer-policy', 'no-referrer');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-dns-prefetch-control', 'off');
        response.setHeader('x-download-options', 'noopen');
        response.setHeader('x-frame-options', 'DENY');
        response.setHeader('x-permitted-cross-domain-policies', 'none');
        if (options.environment === 'production') {
            response.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
        }
        next();
    };
}
//# sourceMappingURL=http-hardening.middleware.js.map