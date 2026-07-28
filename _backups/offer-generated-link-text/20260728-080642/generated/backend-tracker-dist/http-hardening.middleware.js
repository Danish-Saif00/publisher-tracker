import { getTrackerRequestId } from './request-id.middleware.js';
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
export function createTrackerRateLimitMiddleware(options) {
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
            response.status(429).json({
                error: {
                    code: 'TRACKER_RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests were received. Retry later.',
                    requestId: getTrackerRequestId(response),
                },
            });
            return;
        }
        next();
    };
}
export function createTrackerSecurityHeadersMiddleware(options) {
    return (_request, response, next) => {
        response.setHeader('content-security-policy', [
            "default-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'none'",
        ].join('; '));
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