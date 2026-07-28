import { Router } from 'express';
import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readBody(request) {
    const body = request.body;
    if (!isRecord(body)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'The request body must be a JSON object.');
    }
    return body;
}
function readRouteParameter(request, propertyName) {
    const value = request.params[propertyName];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${propertyName} is required.`);
    }
    return value;
}
function readRequiredString(body, propertyName) {
    const value = body[propertyName];
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
    }
    return value;
}
function readOptionalEndpointStatus(value, errorCode) {
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError(errorCode, 400, 'status must be active, paused, or archived.');
    }
}
function readOptionalCreateEndpointStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'paused':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'A new postback endpoint status must be active or paused.');
    }
}
function readOptionalConversionStatus(value) {
    switch (value) {
        case undefined:
            return undefined;
        case 'pending':
        case 'approved':
        case 'rejected':
        case 'reversed':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'status must be pending, approved, rejected, or reversed.');
    }
}
function readOptionalQueryString(request, propertyName) {
    const value = request.query[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be a non-empty string.`);
    }
    return value;
}
function readOptionalLimit(request) {
    const value = readOptionalQueryString(request, 'limit');
    if (value === undefined) {
        return undefined;
    }
    if (!/^\d+$/u.test(value)) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'limit must be a whole number.');
    }
    return Number(value);
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createConversionPostbacksRouter(options) {
    const router = Router();
    const createEndpointHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const createStatus = readOptionalCreateEndpointStatus(body);
        const result = await options.service.createEndpoint(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'networkAccountId'), {
            name: readRequiredString(body, 'name'),
            ...(createStatus !== undefined ? { status: createStatus } : {}),
        });
        response.status(201).json({
            data: result,
        });
    };
    const listEndpointsHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const status = readOptionalEndpointStatus(request.query['status'], 'INVALID_QUERY_PARAMETER');
        const endpoints = await options.service.listEndpoints(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'networkAccountId'), {
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                endpoints,
            },
        });
    };
    const updateEndpointHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const status = readOptionalEndpointStatus(body['status'], 'INVALID_REQUEST_BODY');
        const endpoint = await options.service.updateEndpoint(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'networkAccountId'), readRouteParameter(request, 'endpointId'), {
            ...(body['name'] !== undefined ? { name: readRequiredString(body, 'name') } : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                endpoint,
            },
        });
    };
    const rotateEndpointKeyHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const result = await options.service.rotateEndpointKey(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'networkAccountId'), readRouteParameter(request, 'endpointId'));
        response.status(200).json({
            data: result,
        });
    };
    const listConversionsHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
        const offerId = readOptionalQueryString(request, 'offerId');
        const ownerMembershipId = readOptionalQueryString(request, 'ownerMembershipId');
        const status = readOptionalConversionStatus(request.query['status']);
        const limit = readOptionalLimit(request);
        const conversions = await options.service.listConversions(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            ...(networkAccountId !== undefined ? { networkAccountId } : {}),
            ...(offerId !== undefined ? { offerId } : {}),
            ...(ownerMembershipId !== undefined ? { ownerMembershipId } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(limit !== undefined ? { limit } : {}),
        });
        response.status(200).json({
            data: {
                conversions,
            },
        });
    };
    const getConversionHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const conversion = await options.service.getConversion(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'conversionId'));
        response.status(200).json({
            data: {
                conversion,
            },
        });
    };
    router.post('/companies/:companyId/network-accounts/:networkAccountId/postback-endpoints', createEndpointHandler);
    router.get('/companies/:companyId/network-accounts/:networkAccountId/postback-endpoints', listEndpointsHandler);
    router.patch('/companies/:companyId/network-accounts/:networkAccountId/postback-endpoints/:endpointId', updateEndpointHandler);
    router.post('/companies/:companyId/network-accounts/:networkAccountId/postback-endpoints/:endpointId/rotate-key', rotateEndpointKeyHandler);
    router.get('/companies/:companyId/conversions', listConversionsHandler);
    router.get('/companies/:companyId/conversions/:conversionId', getConversionHandler);
    return router;
}
//# sourceMappingURL=conversion-postbacks.routes.js.map