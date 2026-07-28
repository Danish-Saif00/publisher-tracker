import { Router } from 'express';
import { NetworkPostbackHttpError, } from './network-postback.service.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readScalar(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
        return value[0];
    }
    return undefined;
}
function readInputValue(request, names) {
    const body = isRecord(request.body) ? request.body : {};
    for (const name of names) {
        const bodyValue = readScalar(body[name]);
        if (bodyValue !== undefined) {
            return bodyValue;
        }
        const queryValue = readScalar(request.query[name]);
        if (queryValue !== undefined) {
            return queryValue;
        }
    }
    return undefined;
}
function readRequiredInputValue(request, names, fieldName) {
    const value = readInputValue(request, names);
    if (value === undefined || value.trim().length === 0) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, `${fieldName} is required.`);
    }
    return value;
}
function readEndpointKey(request) {
    const value = request.params['endpointKey'];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new NetworkPostbackHttpError('POSTBACK_UNAVAILABLE', 404, 'The postback endpoint is unavailable.');
    }
    return value;
}
function readStatus(request) {
    const value = readRequiredInputValue(request, ['status'], 'status').trim().toLowerCase();
    switch (value) {
        case 'pending':
        case 'approved':
        case 'rejected':
        case 'reversed':
            return value;
        default:
            throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'status must be pending, approved, rejected, or reversed.');
    }
}
function readRevenueAmountMinor(request) {
    const value = readInputValue(request, ['amount_minor', 'revenueAmountMinor']);
    if (value === undefined || value.trim().length === 0) {
        return null;
    }
    if (!/^\d+$/u.test(value.trim())) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'revenueAmountMinor must be a non-negative whole number.');
    }
    const amount = Number(value);
    if (!Number.isSafeInteger(amount)) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'revenueAmountMinor exceeds the supported range.');
    }
    return amount;
}
function readRevenueCurrency(request) {
    const value = readInputValue(request, ['currency', 'revenueCurrency']);
    return value === undefined || value.trim().length === 0 ? null : value;
}
function readIdempotencyKey(request) {
    const headerValue = request.get('x-idempotency-key');
    if (headerValue !== undefined && headerValue.trim().length > 0) {
        return headerValue;
    }
    return readRequiredInputValue(request, ['idempotency_key', 'idempotencyKey'], 'idempotencyKey');
}
function createProviderPayload(request) {
    const body = isRecord(request.body)
        ? { ...request.body }
        : {};
    const query = {};
    for (const [key, value] of Object.entries(request.query)) {
        if (typeof value === 'string') {
            query[key] = value;
        }
        else if (Array.isArray(value)) {
            query[key] = value.filter((item) => typeof item === 'string');
        }
    }
    return Object.freeze({
        method: request.method,
        body,
        query,
    });
}
export function createNetworkPostbackRouter(options) {
    const router = Router();
    const ingestHandler = async (request, response) => {
        const result = await options.service.ingest({
            endpointKey: readEndpointKey(request),
            publicClickId: readRequiredInputValue(request, ['click_id', 'clickId', 'publicClickId'], 'publicClickId'),
            externalConversionId: readRequiredInputValue(request, ['conversion_id', 'conversionId', 'externalConversionId'], 'externalConversionId'),
            idempotencyKey: readIdempotencyKey(request),
            status: readStatus(request),
            revenueAmountMinor: readRevenueAmountMinor(request),
            revenueCurrency: readRevenueCurrency(request),
            payload: createProviderPayload(request),
        });
        response.setHeader('cache-control', 'no-store, max-age=0');
        response.status(result.wasIdempotent ? 200 : 201).json({
            data: result,
        });
    };
    router.get('/postbacks/:endpointKey', ingestHandler);
    router.post('/postbacks/:endpointKey', ingestHandler);
    return router;
}
//# sourceMappingURL=network-postback.routes.js.map