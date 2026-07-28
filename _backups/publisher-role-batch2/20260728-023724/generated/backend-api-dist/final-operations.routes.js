import { Router, } from 'express';
import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity, } from './request-context.js';
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
function readOptionalQueryString(request, propertyName) {
    const value = request.query[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be a string.`);
    }
    return value;
}
function readOptionalQueryInteger(request, propertyName) {
    const value = readOptionalQueryString(request, propertyName);
    if (value === undefined) {
        return undefined;
    }
    if (!/^\d+$/u.test(value)) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be a whole number.`);
    }
    return Number.parseInt(value, 10);
}
function readRequiredString(body, propertyName) {
    const value = body[propertyName];
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
    }
    return value;
}
function readNullableString(body, propertyName) {
    const value = body[propertyName];
    if (value === null || typeof value === 'string') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string or null.`);
}
function readOptionalNullableString(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined || value === null || typeof value === 'string') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string, null, or omitted.`);
}
function readOptionalNullableInteger(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a whole number, null, or omitted.`);
    }
    return value;
}
function readOptionalDevice(request) {
    const value = readOptionalQueryString(request, 'device');
    if (value === undefined ||
        value === 'desktop' ||
        value === 'mobile' ||
        value === 'tablet' ||
        value === 'other') {
        return value;
    }
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'device is unsupported.');
}
function readOptionalReviewStatus(request) {
    const value = readOptionalQueryString(request, 'status');
    if (value === undefined ||
        value === 'approved' ||
        value === 'rejected' ||
        value === 'unchecked') {
        return value;
    }
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'status is unsupported.');
}
function readCommonQuery(request) {
    const from = readOptionalQueryString(request, 'from');
    const to = readOptionalQueryString(request, 'to');
    const search = readOptionalQueryString(request, 'search');
    const offerId = readOptionalQueryString(request, 'offerId');
    const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
    const ownerMembershipId = readOptionalQueryString(request, 'ownerMembershipId');
    const countryCode = readOptionalQueryString(request, 'countryCode');
    const device = readOptionalDevice(request);
    const limit = readOptionalQueryInteger(request, 'limit');
    return Object.freeze({
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(search !== undefined ? { search } : {}),
        ...(offerId !== undefined ? { offerId } : {}),
        ...(networkAccountId !== undefined ? { networkAccountId } : {}),
        ...(ownerMembershipId !== undefined ? { ownerMembershipId } : {}),
        ...(countryCode !== undefined ? { countryCode } : {}),
        ...(device !== undefined ? { device } : {}),
        ...(limit !== undefined ? { limit } : {}),
    });
}
function readManualConversionRequest(body) {
    const revenueAmountMinor = readOptionalNullableInteger(body, 'revenueAmountMinor');
    const revenueCurrency = readOptionalNullableString(body, 'revenueCurrency');
    return Object.freeze({
        publicClickId: readRequiredString(body, 'publicClickId'),
        status: readRequiredString(body, 'status'),
        ...(revenueAmountMinor !== undefined ? { revenueAmountMinor } : {}),
        ...(revenueCurrency !== undefined ? { revenueCurrency } : {}),
    });
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createFinalOperationsRouter(options) {
    const router = Router();
    const reportHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const dimensionStatus = readOptionalQueryString(request, 'dimensionStatus');
        const rows = await options.service.listPerformanceReport(information.identity, information.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'dimension'), {
            ...readCommonQuery(request),
            ...(dimensionStatus !== undefined
                ? {
                    status: dimensionStatus,
                }
                : {}),
        });
        response.status(200).json({
            data: {
                rows,
            },
        });
    };
    const clicksHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const status = readOptionalReviewStatus(request);
        const clicks = await options.service.listClicks(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            ...readCommonQuery(request),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                clicks,
            },
        });
    };
    const conversionsHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const status = readOptionalReviewStatus(request);
        const conversionStatus = readOptionalQueryString(request, 'conversionStatus');
        const conversions = await options.service.listConversions(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            ...readCommonQuery(request),
            ...(status !== undefined ? { status } : {}),
            ...(conversionStatus !== undefined ? { conversionStatus } : {}),
        });
        response.status(200).json({
            data: {
                conversions,
            },
        });
    };
    const manualConversionHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const conversion = await options.service.createManualConversion(information.identity, information.requestId, readRouteParameter(request, 'companyId'), readManualConversionRequest(readBody(request)));
        response.status(201).json({
            data: {
                conversion,
            },
        });
    };
    const sessionsHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const sessions = await options.service.listSessions(information.identity, information.requestId, readRouteParameter(request, 'companyId'), readCommonQuery(request));
        response.status(200).json({
            data: {
                sessions,
            },
        });
    };
    const userAgentsHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const status = readOptionalReviewStatus(request);
        const userAgents = await options.service.listUserAgents(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            ...readCommonQuery(request),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                userAgents,
            },
        });
    };
    const getProfileHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const profile = await options.service.getAccountProfile(information.identity, information.requestId);
        response.status(200).json({
            data: {
                profile,
            },
        });
    };
    const updateProfileHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const body = readBody(request);
        const profile = await options.service.updateAccountProfile(information.identity, information.requestId, {
            displayName: readNullableString(body, 'displayName'),
            timezone: readRequiredString(body, 'timezone'),
        });
        response.status(200).json({
            data: {
                profile,
            },
        });
    };
    const invoicesHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const invoices = await options.service.listBillingInvoices(information.identity, information.requestId, readRouteParameter(request, 'companyId'), readOptionalQueryInteger(request, 'limit'));
        response.status(200).json({
            data: {
                invoices,
            },
        });
    };
    router.get('/companies/:companyId/reports/:dimension', reportHandler);
    router.get('/companies/:companyId/logs/clicks', clicksHandler);
    router.get('/companies/:companyId/logs/conversions', conversionsHandler);
    router.post('/companies/:companyId/logs/conversions/manual', manualConversionHandler);
    router.get('/companies/:companyId/logs/sessions', sessionsHandler);
    router.get('/companies/:companyId/logs/user-agents', userAgentsHandler);
    router.get('/companies/:companyId/billing/invoices', invoicesHandler);
    router.get('/me/profile', getProfileHandler);
    router.put('/me/profile', updateProfileHandler);
    return router;
}
//# sourceMappingURL=final-operations.routes.js.map