import { Router } from 'express';
import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readBody(request) {
    const value = request.body;
    if (!isRecord(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'The request body must be a JSON object.');
    }
    return value;
}
function readRouteParameter(request, name) {
    const value = request.params[name];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${name} is required.`);
    }
    return value;
}
function readRequiredString(body, name) {
    const value = body[name];
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a string.`);
    }
    return value;
}
function readNullableString(body, name) {
    const value = body[name];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'string') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a string or null.`);
    }
    return value;
}
function readRequiredBoolean(body, name) {
    const value = body[name];
    if (typeof value !== 'boolean') {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a boolean.`);
    }
    return value;
}
function readNullableNumber(body, name) {
    const value = body[name];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be a number or null.`);
    }
    return value;
}
function readStringArray(body, name) {
    const value = body[name];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be an array of strings.`);
    }
    return value;
}
function readNumberArray(body, name) {
    const value = body[name];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${name} must be an array of numbers.`);
    }
    return value;
}
function readDevices(body) {
    return readStringArray(body, 'devices').map((value) => {
        if (value !== 'desktop' && value !== 'android' && value !== 'ios') {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'devices contains an unsupported value.');
        }
        return value;
    });
}
function readOfferStatus(body, optional = false) {
    const value = body['status'];
    if (optional && value === undefined) {
        return undefined;
    }
    if (value === 'draft' || value === 'active' || value === 'paused' || value === 'archived') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is invalid.');
}
function readNetworkStatus(body) {
    const value = body['status'];
    if (value === 'active' || value === 'suspended' || value === 'archived') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is invalid.');
}
function readRedirectType(body) {
    const value = body['redirectType'];
    if (value === '301' || value === '302') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'redirectType is invalid.');
}
function readReferrerMode(body) {
    const value = body['referrerMode'];
    if (value === 'preserve' || value === 'strip') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'referrerMode is invalid.');
}
function readPayoutType(body) {
    const value = body['payoutType'];
    if (value === 'fixed_member' || value === 'per_offer') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'payoutType is invalid.');
}
function readOfferConfiguration(body) {
    return {
        trackingDomainId: readRequiredString(body, 'trackingDomainId'),
        countries: readStringArray(body, 'countries'),
        devices: readDevices(body),
        desktopUrl: readNullableString(body, 'desktopUrl'),
        androidUrl: readNullableString(body, 'androidUrl'),
        iosUrl: readNullableString(body, 'iosUrl'),
        redirectType: readRedirectType(body),
        referrerMode: readReferrerMode(body),
        defaultPayoutAmountMinor: readNullableNumber(body, 'defaultPayoutAmountMinor'),
        payoutCurrency: readNullableString(body, 'payoutCurrency'),
        timezone: readRequiredString(body, 'timezone'),
        activeDays: readNumberArray(body, 'activeDays'),
        activeStartTime: readNullableString(body, 'activeStartTime'),
        activeEndTime: readNullableString(body, 'activeEndTime'),
        proxyEnabled: readRequiredBoolean(body, 'proxyEnabled'),
        expiresAt: readNullableString(body, 'expiresAt'),
        duplicateAllowed: readRequiredBoolean(body, 'duplicateAllowed'),
        managerMembershipIds: readStringArray(body, 'managerMembershipIds'),
    };
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createCatalogOperationsRouter(options) {
    const router = Router();
    const getSnapshotHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const snapshot = await options.service.getSnapshot(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({ data: snapshot });
    };
    const listPublisherOffersHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const offers = await options.service.listPublisherOffers(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: {
                offers,
            },
        });
    };
    const createOfferHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const status = readOfferStatus(body, true);
        if (status === 'paused' || status === 'archived') {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'A new offer status must be draft or active.');
        }
        const offer = await options.service.createOffer(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            networkAccountId: readRequiredString(body, 'networkAccountId'),
            code: readRequiredString(body, 'code'),
            externalOfferId: readNullableString(body, 'externalOfferId'),
            name: readRequiredString(body, 'name'),
            description: readNullableString(body, 'description'),
            ...(status !== undefined ? { status } : {}),
            ...readOfferConfiguration(body),
        });
        response.status(201).json({ data: offer });
    };
    const updateOfferHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const status = readOfferStatus(body);
        if (status === undefined) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status is required.');
        }
        const offer = await options.service.updateOffer(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'offerId'), {
            externalOfferId: readNullableString(body, 'externalOfferId'),
            name: readRequiredString(body, 'name'),
            description: readNullableString(body, 'description'),
            status,
            ...readOfferConfiguration(body),
        });
        response.status(200).json({ data: offer });
    };
    const createNetworkHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const network = await options.service.createNetwork(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            providerId: readRequiredString(body, 'providerId'),
            name: readRequiredString(body, 'name'),
            externalAccountId: readNullableString(body, 'externalAccountId'),
            trackingParameter: readNullableString(body, 'trackingParameter'),
            postbackUrl: readNullableString(body, 'postbackUrl'),
            duplicateAllowed: readRequiredBoolean(body, 'duplicateAllowed'),
        });
        response.status(201).json({ data: network });
    };
    const updateNetworkHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const network = await options.service.updateNetwork(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'accountId'), {
            name: readRequiredString(body, 'name'),
            externalAccountId: readNullableString(body, 'externalAccountId'),
            status: readNetworkStatus(body),
            trackingParameter: readNullableString(body, 'trackingParameter'),
            postbackUrl: readNullableString(body, 'postbackUrl'),
            duplicateAllowed: readRequiredBoolean(body, 'duplicateAllowed'),
        });
        response.status(200).json({ data: network });
    };
    const updatePublisherHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const publisher = await options.service.updatePublisher(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'membershipId'), {
            timezone: readRequiredString(body, 'timezone'),
            payoutType: readPayoutType(body),
            fixedPayoutAmountMinor: readNullableNumber(body, 'fixedPayoutAmountMinor'),
            payoutCurrency: readNullableString(body, 'payoutCurrency'),
            postbackUrl: readNullableString(body, 'postbackUrl'),
            emailNotificationsEnabled: readRequiredBoolean(body, 'emailNotificationsEnabled'),
            assignedOfferIds: readStringArray(body, 'assignedOfferIds'),
        });
        response.status(200).json({ data: publisher });
    };
    router.get('/companies/:companyId/catalog', getSnapshotHandler);
    router.get('/companies/:companyId/catalog/publisher-offers', listPublisherOffersHandler);
    router.post('/companies/:companyId/catalog/offers', createOfferHandler);
    router.put('/companies/:companyId/catalog/offers/:offerId', updateOfferHandler);
    router.post('/companies/:companyId/catalog/networks', createNetworkHandler);
    router.put('/companies/:companyId/catalog/networks/:accountId', updateNetworkHandler);
    router.put('/companies/:companyId/catalog/publishers/:membershipId', updatePublisherHandler);
    return router;
}
//# sourceMappingURL=catalog-operations.routes.js.map