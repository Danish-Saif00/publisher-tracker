const requestContexts = new WeakMap();
export function initializeRequestContext(request, requestId) {
    requestContexts.set(request, Object.freeze({
        requestId,
    }));
}
export function getRequestContext(request) {
    const context = requestContexts.get(request);
    if (context === undefined) {
        throw new Error('API request context has not been initialized.');
    }
    return context;
}
export function getRequestId(request) {
    return requestContexts.get(request)?.requestId;
}
export function attachResolvedIdentity(request, identity) {
    const context = getRequestContext(request);
    requestContexts.set(request, Object.freeze({
        ...context,
        identity,
    }));
}
export function getResolvedIdentity(request) {
    const identity = getRequestContext(request).identity;
    if (identity === undefined) {
        throw new Error('Authenticated API identity is unavailable.');
    }
    return identity;
}
//# sourceMappingURL=request-context.js.map