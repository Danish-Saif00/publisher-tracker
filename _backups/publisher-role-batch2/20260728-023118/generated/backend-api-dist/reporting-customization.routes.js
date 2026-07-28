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
function readRequiredInteger(body, propertyName) {
    const value = body[propertyName];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a whole number.`);
    }
    return value;
}
function readRequiredBoolean(body, propertyName) {
    const value = body[propertyName];
    if (typeof value !== 'boolean') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a boolean.`);
    }
    return value;
}
function readOptionalNullableString(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined || value === null || typeof value === 'string') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string or null.`);
}
function readOptionalString(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined || typeof value === 'string') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
}
function readOptionalBoolean(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a boolean.`);
}
function readOptionalLinkIdentifierMode(body) {
    const value = body['linkIdentifierMode'];
    if (value === undefined ||
        value === 'slug_or_code' ||
        value === 'tracking_code') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'linkIdentifierMode must be slug_or_code or tracking_code.');
}
function readOptionalRestrictedSharePlatforms(body) {
    const value = body['restrictedSharePlatforms'];
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'restrictedSharePlatforms must be an array.');
    }
    const platforms = [];
    for (const item of value) {
        if (item !== 'snapchat' &&
            item !== 'instagram' &&
            item !== 'facebook') {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'restrictedSharePlatforms contains an unsupported value.');
        }
        platforms.push(item);
    }
    return Object.freeze(platforms);
}
function readOptionalStringRecord(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be an object.`);
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string') {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} values must be strings.`);
        }
        result[key] = item;
    }
    return Object.freeze(result);
}
function readRequiredStringArray(body, propertyName) {
    const value = body[propertyName];
    if (!Array.isArray(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be an array of strings.`);
    }
    const result = value.map((item) => {
        if (typeof item !== 'string') {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must contain only strings.`);
        }
        return item;
    });
    return Object.freeze(result);
}
function readRequiredProxyProviderCode(body) {
    const value = body['providerCode'];
    if (value === 'ipqualityscore' ||
        value === 'proxycheck') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'providerCode must be ipqualityscore or proxycheck.');
}
function readRequiredProxyStatus(body) {
    const value = body['status'];
    if (value === 'active' ||
        value === 'disabled') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active or disabled.');
}
function readRequiredProxyEnforcementMode(body) {
    const value = body['enforcementMode'];
    if (value === 'monitor' ||
        value === 'enforce') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'enforcementMode must be monitor or enforce.');
}
function readRequiredProxyFailureBehavior(body) {
    const value = body['failureBehavior'];
    if (value === 'allow' ||
        value === 'flag' ||
        value === 'block') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'failureBehavior must be allow, flag, or block.');
}
function readRequiredSecureMode(body) {
    const value = body['secureMode'];
    if (value === 'plain' || value === 'starttls' || value === 'tls') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'secureMode must be plain, starttls, or tls.');
}
function readOptionalSmtpStatus(body) {
    const value = body['status'];
    if (value === undefined || value === 'active' || value === 'disabled') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active or disabled.');
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createCompanyOperationsRouter(options) {
    const router = Router();
    const dashboardHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const from = readOptionalQueryString(request, 'from');
        const to = readOptionalQueryString(request, 'to');
        const offerId = readOptionalQueryString(request, 'offerId');
        const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
        const ownerMembershipId = readOptionalQueryString(request, 'ownerMembershipId');
        const dashboard = await options.service.getReportingDashboard(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
            ...(offerId !== undefined ? { offerId } : {}),
            ...(networkAccountId !== undefined ? { networkAccountId } : {}),
            ...(ownerMembershipId !== undefined ? { ownerMembershipId } : {}),
        });
        response.status(200).json({
            data: {
                dashboard,
            },
        });
    };
    const operationalEventsHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const eventName = readOptionalQueryString(request, 'eventName');
        const entityType = readOptionalQueryString(request, 'entityType');
        const from = readOptionalQueryString(request, 'from');
        const to = readOptionalQueryString(request, 'to');
        const limit = readOptionalQueryInteger(request, 'limit');
        const events = await options.service.listOperationalEvents(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            ...(eventName !== undefined ? { eventName } : {}),
            ...(entityType !== undefined ? { entityType } : {}),
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
            ...(limit !== undefined ? { limit } : {}),
        });
        response.status(200).json({
            data: {
                events,
            },
        });
    };
    const getCustomizationHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const customization = await options.service.getCustomization(information.identity, information.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: {
                customization,
            },
        });
    };
    const updateCustomizationHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const body = readBody(request);
        const brandName = readOptionalNullableString(body, 'brandName');
        const tagline = readOptionalNullableString(body, 'tagline');
        const logoUrl = readOptionalNullableString(body, 'logoUrl');
        const primaryColor = readOptionalNullableString(body, 'primaryColor');
        const secondaryColor = readOptionalNullableString(body, 'secondaryColor');
        const supportEmail = readOptionalNullableString(body, 'supportEmail');
        const defaultCurrency = readOptionalNullableString(body, 'defaultCurrency');
        const defaultTimezone = readOptionalNullableString(body, 'defaultTimezone');
        const linkIdentifierMode = readOptionalLinkIdentifierMode(body);
        const plainTextSharingEnabled = readOptionalBoolean(body, 'plainTextSharingEnabled');
        const restrictedSharePlatforms = readOptionalRestrictedSharePlatforms(body);
        const defaultLinkQueryParameters = readOptionalStringRecord(body, 'defaultLinkQueryParameters');
        const customization = await options.service.updateCustomization(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            ...(brandName !== undefined ? { brandName } : {}),
            ...(tagline !== undefined ? { tagline } : {}),
            ...(logoUrl !== undefined ? { logoUrl } : {}),
            ...(primaryColor !== undefined ? { primaryColor } : {}),
            ...(secondaryColor !== undefined ? { secondaryColor } : {}),
            ...(supportEmail !== undefined ? { supportEmail } : {}),
            ...(defaultCurrency !== undefined
                ? { defaultCurrency }
                : {}),
            ...(defaultTimezone !== undefined
                ? { defaultTimezone }
                : {}),
            ...(linkIdentifierMode !== undefined
                ? { linkIdentifierMode }
                : {}),
            ...(plainTextSharingEnabled !==
                undefined
                ? { plainTextSharingEnabled }
                : {}),
            ...(restrictedSharePlatforms !==
                undefined
                ? { restrictedSharePlatforms }
                : {}),
            ...(defaultLinkQueryParameters !==
                undefined
                ? { defaultLinkQueryParameters }
                : {}),
        });
        response.status(200).json({
            data: {
                customization,
            },
        });
    };
    const getProxyHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const proxyConfiguration = await options.service
            .getProxyConfiguration(information.identity, information.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: {
                proxyConfiguration,
            },
        });
    };
    const updateProxyHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const body = readBody(request);
        const apiKey = readOptionalString(body, 'apiKey');
        const proxyConfiguration = await options.service
            .updateProxyConfiguration(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            providerCode: readRequiredProxyProviderCode(body),
            ...(apiKey !== undefined
                ? { apiKey }
                : {}),
            status: readRequiredProxyStatus(body),
            enforcementMode: readRequiredProxyEnforcementMode(body),
            riskThreshold: readRequiredInteger(body, 'riskThreshold'),
            requestTimeoutMs: readRequiredInteger(body, 'requestTimeoutMs'),
            cacheTtlSeconds: readRequiredInteger(body, 'cacheTtlSeconds'),
            failureBehavior: readRequiredProxyFailureBehavior(body),
            detectProxy: readRequiredBoolean(body, 'detectProxy'),
            detectVpn: readRequiredBoolean(body, 'detectVpn'),
            detectTor: readRequiredBoolean(body, 'detectTor'),
            bypassOwnerMembershipIds: readRequiredStringArray(body, 'bypassOwnerMembershipIds'),
        });
        response.status(200).json({
            data: {
                proxyConfiguration,
            },
        });
    };
    const getSmtpHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const smtpConfiguration = await options.service.getSmtpConfiguration(information.identity, information.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: {
                smtpConfiguration,
            },
        });
    };
    const updateSmtpHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const body = readBody(request);
        const status = readOptionalSmtpStatus(body);
        const password = readOptionalString(body, 'password');
        const replyToEmail = readOptionalNullableString(body, 'replyToEmail');
        const smtpConfiguration = await options.service.updateSmtpConfiguration(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            host: readRequiredString(body, 'host'),
            port: readRequiredInteger(body, 'port'),
            secureMode: readRequiredSecureMode(body),
            username: readRequiredString(body, 'username'),
            ...(password !== undefined ? { password } : {}),
            senderEmail: readRequiredString(body, 'senderEmail'),
            senderName: readRequiredString(body, 'senderName'),
            ...(replyToEmail !== undefined ? { replyToEmail } : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                smtpConfiguration,
            },
        });
    };
    const testSmtpHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const result = await options.service.testSmtpConfiguration(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            recipientEmail: readRequiredString(readBody(request), 'recipientEmail'),
        });
        response.status(200).json({
            data: {
                result,
            },
        });
    };
    router.get('/companies/:companyId/reporting/dashboard', dashboardHandler);
    router.get('/companies/:companyId/operations/events', operationalEventsHandler);
    router.get('/companies/:companyId/customization', getCustomizationHandler);
    router.put('/companies/:companyId/customization', updateCustomizationHandler);
    router.get('/companies/:companyId/proxy', getProxyHandler);
    router.put('/companies/:companyId/proxy', updateProxyHandler);
    router.get('/companies/:companyId/smtp', getSmtpHandler);
    router.put('/companies/:companyId/smtp', updateSmtpHandler);
    router.post('/companies/:companyId/smtp/test', testSmtpHandler);
    return router;
}
//# sourceMappingURL=reporting-customization.routes.js.map