import { extractBearerToken } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
import { attachResolvedIdentity, getRequestContext } from './request-context.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readRequestedCompanyId(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_COMPANY_ID', 400, 'The x-company-id header must contain one valid UUID.');
    }
    const normalizedValue = value.trim();
    if (!UUID_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_COMPANY_ID', 400, 'The x-company-id header must contain a valid UUID.');
    }
    return normalizedValue;
}
export function createAuthenticationMiddleware(options) {
    return (request, _response, next) => {
        void (async () => {
            const context = getRequestContext(request);
            const accessToken = extractBearerToken(request.headers.authorization);
            const actor = await options.tokenVerifier.verify(accessToken);
            const requestedCompanyId = readRequestedCompanyId(request.headers['x-company-id']);
            const identity = await options.identityResolver.resolve({
                actor,
                requestId: context.requestId,
                ...(requestedCompanyId !== undefined
                    ? {
                        requestedCompanyId,
                    }
                    : {}),
            });
            attachResolvedIdentity(request, identity);
            next();
        })().catch(next);
    };
}
//# sourceMappingURL=authentication.middleware.js.map