import { randomUUID } from 'node:crypto';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RESPONSE_REQUEST_IDS = new WeakMap();
function resolveRequestId(value) {
    if (typeof value !== 'string') {
        return randomUUID();
    }
    const normalizedValue = value.trim();
    return REQUEST_ID_PATTERN.test(normalizedValue) ? normalizedValue : randomUUID();
}
export const trackerRequestIdMiddleware = (request, response, next) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    RESPONSE_REQUEST_IDS.set(response, requestId);
    response.setHeader('x-request-id', requestId);
    next();
};
export function getTrackerRequestId(response) {
    return RESPONSE_REQUEST_IDS.get(response) ?? 'unavailable';
}
//# sourceMappingURL=request-id.middleware.js.map