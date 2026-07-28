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
function readRequiredString(body, propertyName) {
    const value = body[propertyName];
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
    }
    return value;
}
function readRequiredNullableString(body, propertyName) {
    const value = body[propertyName];
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string or null.`);
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
function readRequiredNullableNumber(body, propertyName) {
    const value = body[propertyName];
    if (value === null) {
        return null;
    }
    if (typeof value !== 'number') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a number or null.`);
    }
    return value;
}
function readRequiredNumber(body, propertyName) {
    const value = body[propertyName];
    if (typeof value !== 'number') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a number.`);
    }
    return value;
}
function readRequiredLockMode(body) {
    const value = body['lockMode'];
    switch (value) {
        case 'session':
        case 'duration':
        case 'until_date':
        case 'until_offer_expiry':
        case 'permanent':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'lockMode must be session, duration, until_date, until_offer_expiry, or permanent.');
    }
}
function readOptionalLockMode(body) {
    return body['lockMode'] === undefined ? undefined : readRequiredLockMode(body);
}
function readOptionalStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active, paused, or archived.');
    }
}
function readOptionalCreateStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'paused':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'A new duplicate-protection rule status must be active or paused.');
    }
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
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be a single string value.`);
    }
    return value;
}
function readOptionalIntegerQuery(request, propertyName) {
    const value = readOptionalQueryString(request, propertyName);
    if (value === undefined) {
        return undefined;
    }
    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue)) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be a whole number.`);
    }
    return parsedValue;
}
function readOptionalStatusQuery(request) {
    const value = readOptionalQueryString(request, 'status');
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'status must be active, paused, or archived.');
    }
}
function readOptionalDuplicateDecisionQuery(request) {
    const value = readOptionalQueryString(request, 'duplicateDecision');
    switch (value) {
        case undefined:
            return undefined;
        case 'accepted':
        case 'duplicate':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'duplicateDecision must be accepted or duplicate.');
    }
}
function readOptionalFraudRiskQuery(request) {
    const value = readOptionalQueryString(request, 'fraudRiskLevel');
    switch (value) {
        case undefined:
            return undefined;
        case 'low':
        case 'medium':
        case 'high':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'fraudRiskLevel must be low, medium, or high.');
    }
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createDuplicateFraudRouter(options) {
    const router = Router();
    const createRuleHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const status = readOptionalCreateStatus(body);
        const rule = await options.service.createRule(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            networkAccountId: readRequiredString(body, 'networkAccountId'),
            ...(body['offerId'] !== undefined
                ? {
                    offerId: readRequiredNullableString(body, 'offerId'),
                }
                : {}),
            name: readRequiredString(body, 'name'),
            lockMode: readRequiredLockMode(body),
            ...(body['sessionWindowSeconds'] !== undefined
                ? {
                    sessionWindowSeconds: readRequiredNullableNumber(body, 'sessionWindowSeconds'),
                }
                : {}),
            ...(body['lockDurationSeconds'] !== undefined
                ? {
                    lockDurationSeconds: readRequiredNullableNumber(body, 'lockDurationSeconds'),
                }
                : {}),
            ...(body['lockUntil'] !== undefined
                ? {
                    lockUntil: readRequiredNullableString(body, 'lockUntil'),
                }
                : {}),
            ...(body['offerExpiryAt'] !== undefined
                ? {
                    offerExpiryAt: readRequiredNullableString(body, 'offerExpiryAt'),
                }
                : {}),
            ...(body['matchVisitorId'] !== undefined
                ? {
                    matchVisitorId: readRequiredBoolean(body, 'matchVisitorId'),
                }
                : {}),
            ...(body['matchIpAndUserAgent'] !== undefined
                ? {
                    matchIpAndUserAgent: readRequiredBoolean(body, 'matchIpAndUserAgent'),
                }
                : {}),
            ...(body['rapidRepeatWindowSeconds'] !== undefined
                ? {
                    rapidRepeatWindowSeconds: readRequiredNumber(body, 'rapidRepeatWindowSeconds'),
                }
                : {}),
            ...(body['rapidRepeatThreshold'] !== undefined
                ? {
                    rapidRepeatThreshold: readRequiredNumber(body, 'rapidRepeatThreshold'),
                }
                : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(201).json({
            data: {
                rule,
            },
        });
    };
    const listRulesHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
        const offerId = readOptionalQueryString(request, 'offerId');
        const status = readOptionalStatusQuery(request);
        const rules = await options.service.listRules(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            ...(networkAccountId !== undefined ? { networkAccountId } : {}),
            ...(offerId !== undefined ? { offerId } : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                rules,
            },
        });
    };
    const getRuleHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const rule = await options.service.getRule(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'ruleId'));
        response.status(200).json({
            data: {
                rule,
            },
        });
    };
    const updateRuleHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const lockMode = readOptionalLockMode(body);
        const status = readOptionalStatus(body);
        const rule = await options.service.updateRule(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'ruleId'), {
            ...(body['name'] !== undefined ? { name: readRequiredString(body, 'name') } : {}),
            ...(lockMode !== undefined ? { lockMode } : {}),
            ...(body['sessionWindowSeconds'] !== undefined
                ? {
                    sessionWindowSeconds: readRequiredNullableNumber(body, 'sessionWindowSeconds'),
                }
                : {}),
            ...(body['lockDurationSeconds'] !== undefined
                ? {
                    lockDurationSeconds: readRequiredNullableNumber(body, 'lockDurationSeconds'),
                }
                : {}),
            ...(body['lockUntil'] !== undefined
                ? {
                    lockUntil: readRequiredNullableString(body, 'lockUntil'),
                }
                : {}),
            ...(body['offerExpiryAt'] !== undefined
                ? {
                    offerExpiryAt: readRequiredNullableString(body, 'offerExpiryAt'),
                }
                : {}),
            ...(body['matchVisitorId'] !== undefined
                ? {
                    matchVisitorId: readRequiredBoolean(body, 'matchVisitorId'),
                }
                : {}),
            ...(body['matchIpAndUserAgent'] !== undefined
                ? {
                    matchIpAndUserAgent: readRequiredBoolean(body, 'matchIpAndUserAgent'),
                }
                : {}),
            ...(body['rapidRepeatWindowSeconds'] !== undefined
                ? {
                    rapidRepeatWindowSeconds: readRequiredNumber(body, 'rapidRepeatWindowSeconds'),
                }
                : {}),
            ...(body['rapidRepeatThreshold'] !== undefined
                ? {
                    rapidRepeatThreshold: readRequiredNumber(body, 'rapidRepeatThreshold'),
                }
                : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: {
                rule,
            },
        });
    };
    const listFraudClicksHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
        const offerId = readOptionalQueryString(request, 'offerId');
        const duplicateDecision = readOptionalDuplicateDecisionQuery(request);
        const fraudRiskLevel = readOptionalFraudRiskQuery(request);
        const limit = readOptionalIntegerQuery(request, 'limit');
        const clicks = await options.service.listFraudClicks(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            ...(networkAccountId !== undefined ? { networkAccountId } : {}),
            ...(offerId !== undefined ? { offerId } : {}),
            ...(duplicateDecision !== undefined ? { duplicateDecision } : {}),
            ...(fraudRiskLevel !== undefined ? { fraudRiskLevel } : {}),
            ...(limit !== undefined ? { limit } : {}),
        });
        response.status(200).json({
            data: {
                clicks,
            },
        });
    };
    router.post('/companies/:companyId/duplicate-protection-rules', createRuleHandler);
    router.get('/companies/:companyId/duplicate-protection-rules', listRulesHandler);
    router.get('/companies/:companyId/duplicate-protection-rules/:ruleId', getRuleHandler);
    router.patch('/companies/:companyId/duplicate-protection-rules/:ruleId', updateRuleHandler);
    router.get('/companies/:companyId/fraud-clicks', listFraudClicksHandler);
    return router;
}
//# sourceMappingURL=duplicate-fraud.routes.js.map