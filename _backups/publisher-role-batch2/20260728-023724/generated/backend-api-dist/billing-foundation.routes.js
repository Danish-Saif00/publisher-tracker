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
function readOptionalString(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
    }
    return value;
}
function readOptionalNullableString(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string or null.`);
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
function readOptionalNumber(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'number') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a number.`);
    }
    return value;
}
function readOptionalNullableNumber(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'number') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a number or null.`);
    }
    return value;
}
function readOptionalBoolean(body, propertyName) {
    const value = body[propertyName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a boolean.`);
    }
    return value;
}
function readBillingInterval(body, propertyName) {
    const value = body[propertyName];
    switch (value) {
        case 'monthly':
        case 'annual':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be monthly or annual.`);
    }
}
function readOptionalBillingInterval(body, propertyName) {
    const value = body[propertyName];
    switch (value) {
        case undefined:
            return undefined;
        case 'monthly':
        case 'annual':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be monthly or annual.`);
    }
}
function readOptionalPlanStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active or archived.');
    }
}
function readOptionalSubscriptionStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'trialing':
        case 'active':
        case 'grace_period':
        case 'suspended':
        case 'canceled':
        case 'expired':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be trialing, active, grace_period, suspended, canceled, or expired.');
    }
}
function readEntitlements(body) {
    const value = body['entitlements'];
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'entitlements must be an array.');
    }
    const items = value;
    return Object.freeze(items.map((item, index) => {
        if (!isRecord(item)) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `entitlements[${String(index)}] must be an object.`);
        }
        const key = readRequiredString(item, 'key');
        const enabled = readOptionalBoolean(item, 'enabled');
        const limitValue = readOptionalNullableNumber(item, 'limitValue');
        return Object.freeze({
            key,
            ...(enabled !== undefined ? { enabled } : {}),
            ...(limitValue !== undefined ? { limitValue } : {}),
        });
    }));
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
function readOptionalPlanStatusQuery(request) {
    const value = readOptionalQueryString(request, 'status');
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'status must be active or archived.');
    }
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createBillingFoundationRouter(options) {
    const router = Router();
    const createPlanHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const description = readOptionalString(body, 'description');
        const trialDays = readOptionalNumber(body, 'trialDays');
        const gracePeriodDays = readOptionalNumber(body, 'gracePeriodDays');
        const entitlements = readEntitlements(body);
        const input = {
            code: readRequiredString(body, 'code'),
            name: readRequiredString(body, 'name'),
            currency: readRequiredString(body, 'currency'),
            priceAmountMinor: readRequiredNumber(body, 'priceAmountMinor'),
            billingInterval: readBillingInterval(body, 'billingInterval'),
            ...(description !== undefined ? { description } : {}),
            ...(trialDays !== undefined ? { trialDays } : {}),
            ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
            ...(entitlements !== undefined ? { entitlements } : {}),
        };
        const plan = await options.service.createPlan(requestInformation.identity, requestInformation.requestId, input);
        response.status(201).json({
            data: plan,
        });
    };
    const listPlansHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const status = readOptionalPlanStatusQuery(request);
        const plans = await options.service.listPlans(requestInformation.identity, requestInformation.requestId, {
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: plans,
        });
    };
    const getPlanHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const plan = await options.service.getPlan(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'planId'));
        response.status(200).json({
            data: plan,
        });
    };
    const updatePlanHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const name = readOptionalString(body, 'name');
        const description = readOptionalNullableString(body, 'description');
        const status = readOptionalPlanStatus(body);
        const currency = readOptionalString(body, 'currency');
        const priceAmountMinor = readOptionalNumber(body, 'priceAmountMinor');
        const billingInterval = readOptionalBillingInterval(body, 'billingInterval');
        const trialDays = readOptionalNumber(body, 'trialDays');
        const gracePeriodDays = readOptionalNumber(body, 'gracePeriodDays');
        const entitlements = readEntitlements(body);
        const input = {
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(currency !== undefined ? { currency } : {}),
            ...(priceAmountMinor !== undefined ? { priceAmountMinor } : {}),
            ...(billingInterval !== undefined ? { billingInterval } : {}),
            ...(trialDays !== undefined ? { trialDays } : {}),
            ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
            ...(entitlements !== undefined ? { entitlements } : {}),
        };
        const plan = await options.service.updatePlan(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'planId'), input);
        response.status(200).json({
            data: plan,
        });
    };
    const createSubscriptionHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const startsAt = readOptionalString(body, 'startsAt');
        const currentPeriodEndsAt = readOptionalString(body, 'currentPeriodEndsAt');
        const externalReference = readOptionalString(body, 'externalReference');
        const input = {
            planId: readRequiredString(body, 'planId'),
            ...(startsAt !== undefined ? { startsAt } : {}),
            ...(currentPeriodEndsAt !== undefined ? { currentPeriodEndsAt } : {}),
            ...(externalReference !== undefined ? { externalReference } : {}),
        };
        const snapshot = await options.service.createCompanySubscription(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), input);
        response.status(201).json({
            data: snapshot,
        });
    };
    const getPlatformSubscriptionHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const snapshot = await options.service.getPlatformCompanyBilling(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: snapshot,
        });
    };
    const updateSubscriptionHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const planId = readOptionalString(body, 'planId');
        const status = readOptionalSubscriptionStatus(body);
        const currentPeriodEndsAt = readOptionalNullableString(body, 'currentPeriodEndsAt');
        const graceEndsAt = readOptionalNullableString(body, 'graceEndsAt');
        const externalReference = readOptionalNullableString(body, 'externalReference');
        const input = {
            ...(planId !== undefined ? { planId } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(currentPeriodEndsAt !== undefined ? { currentPeriodEndsAt } : {}),
            ...(graceEndsAt !== undefined ? { graceEndsAt } : {}),
            ...(externalReference !== undefined ? { externalReference } : {}),
        };
        const snapshot = await options.service.updateCompanySubscription(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), input);
        response.status(200).json({
            data: snapshot,
        });
    };
    const getTenantSubscriptionHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const snapshot = await options.service.getTenantCompanyBilling(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: snapshot,
        });
    };
    router.post('/platform/billing/plans', createPlanHandler);
    router.get('/platform/billing/plans', listPlansHandler);
    router.get('/platform/billing/plans/:planId', getPlanHandler);
    router.patch('/platform/billing/plans/:planId', updatePlanHandler);
    router.post('/platform/companies/:companyId/subscription', createSubscriptionHandler);
    router.get('/platform/companies/:companyId/subscription', getPlatformSubscriptionHandler);
    router.patch('/platform/companies/:companyId/subscription', updateSubscriptionHandler);
    router.get('/companies/:companyId/billing/subscription', getTenantSubscriptionHandler);
    return router;
}
//# sourceMappingURL=billing-foundation.routes.js.map