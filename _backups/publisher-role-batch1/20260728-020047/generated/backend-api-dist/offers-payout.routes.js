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
function readRequiredNullableInteger(body, propertyName) {
    const value = body[propertyName];
    if (value === null) {
        return null;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be an integer or null.`);
    }
    return value;
}
function readRequiredPayoutMode(body) {
    const value = body['mode'];
    switch (value) {
        case 'fixed_member':
        case 'per_offer':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'mode must be fixed_member or per_offer.');
    }
}
function readOptionalOfferStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'draft':
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be draft, active, paused, or archived.');
    }
}
function readOptionalAssignmentStatus(body) {
    const value = body['status'];
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'paused':
        case 'revoked':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active, paused, or revoked.');
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
function readOptionalOfferStatusQuery(request) {
    const value = readOptionalQueryString(request, 'status');
    switch (value) {
        case undefined:
            return undefined;
        case 'draft':
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'status must be draft, active, paused, or archived.');
    }
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createOffersPayoutRouter(options) {
    const router = Router();
    const createOfferHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const offer = await options.service.createOffer(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            networkAccountId: readRequiredString(body, 'networkAccountId'),
            code: readRequiredString(body, 'code'),
            name: readRequiredString(body, 'name'),
            destinationUrl: readRequiredString(body, 'destinationUrl'),
            ...(body['externalOfferId'] !== undefined
                ? {
                    externalOfferId: readRequiredNullableString(body, 'externalOfferId'),
                }
                : {}),
            ...(body['description'] !== undefined
                ? {
                    description: readRequiredNullableString(body, 'description'),
                }
                : {}),
        });
        response.status(201).json({
            data: offer,
        });
    };
    const listOffersHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
        const status = readOptionalOfferStatusQuery(request);
        const offers = await options.service.listOffers(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            ...(networkAccountId !== undefined ? { networkAccountId } : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: offers,
        });
    };
    const getOfferHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const offer = await options.service.getOffer(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'offerId'));
        response.status(200).json({
            data: offer,
        });
    };
    const updateOfferHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const status = readOptionalOfferStatus(body);
        const offer = await options.service.updateOffer(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'offerId'), {
            ...(body['externalOfferId'] !== undefined
                ? {
                    externalOfferId: readRequiredNullableString(body, 'externalOfferId'),
                }
                : {}),
            ...(body['name'] !== undefined ? { name: readRequiredString(body, 'name') } : {}),
            ...(body['description'] !== undefined
                ? {
                    description: readRequiredNullableString(body, 'description'),
                }
                : {}),
            ...(body['destinationUrl'] !== undefined
                ? {
                    destinationUrl: readRequiredString(body, 'destinationUrl'),
                }
                : {}),
            ...(status !== undefined ? { status } : {}),
        });
        response.status(200).json({
            data: offer,
        });
    };
    const upsertPayoutProfileHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const profile = await options.service.upsertPayoutProfile(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'membershipId'), {
            mode: readRequiredPayoutMode(body),
            ...(body['fixedPayoutAmountMinor'] !== undefined
                ? {
                    fixedPayoutAmountMinor: readRequiredNullableInteger(body, 'fixedPayoutAmountMinor'),
                }
                : {}),
            ...(body['payoutCurrency'] !== undefined
                ? {
                    payoutCurrency: readRequiredNullableString(body, 'payoutCurrency'),
                }
                : {}),
        });
        response.status(200).json({
            data: profile,
        });
    };
    const listPayoutProfilesHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const profiles = await options.service.listPayoutProfiles(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: profiles,
        });
    };
    const getOwnPayoutProfileHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const profile = await options.service.getOwnPayoutProfile(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({
            data: profile,
        });
    };
    const createAssignmentHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const assignment = await options.service.createAssignment(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'offerId'), {
            membershipId: readRequiredString(body, 'membershipId'),
            ...(body['manualPayoutAmountMinor'] !== undefined
                ? {
                    manualPayoutAmountMinor: readRequiredNullableInteger(body, 'manualPayoutAmountMinor'),
                }
                : {}),
            ...(body['manualPayoutCurrency'] !== undefined
                ? {
                    manualPayoutCurrency: readRequiredNullableString(body, 'manualPayoutCurrency'),
                }
                : {}),
        });
        response.status(201).json({
            data: assignment,
        });
    };
    const listAssignmentsHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const assignments = await options.service.listOfferAssignments(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'offerId'));
        response.status(200).json({
            data: assignments,
        });
    };
    const updateAssignmentHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const status = readOptionalAssignmentStatus(body);
        const assignment = await options.service.updateAssignment(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'offerId'), readRouteParameter(request, 'assignmentId'), {
            ...(status !== undefined ? { status } : {}),
            ...(body['manualPayoutAmountMinor'] !== undefined
                ? {
                    manualPayoutAmountMinor: readRequiredNullableInteger(body, 'manualPayoutAmountMinor'),
                }
                : {}),
            ...(body['manualPayoutCurrency'] !== undefined
                ? {
                    manualPayoutCurrency: readRequiredNullableString(body, 'manualPayoutCurrency'),
                }
                : {}),
        });
        response.status(200).json({
            data: assignment,
        });
    };
    router.post('/companies/:companyId/offers', createOfferHandler);
    router.get('/companies/:companyId/offers', listOffersHandler);
    router.get('/companies/:companyId/offers/:offerId', getOfferHandler);
    router.patch('/companies/:companyId/offers/:offerId', updateOfferHandler);
    router.put('/companies/:companyId/payout-profiles/:membershipId', upsertPayoutProfileHandler);
    router.get('/companies/:companyId/payout-profiles', listPayoutProfilesHandler);
    router.get('/companies/:companyId/payout-profile', getOwnPayoutProfileHandler);
    router.post('/companies/:companyId/offers/:offerId/assignments', createAssignmentHandler);
    router.get('/companies/:companyId/offers/:offerId/assignments', listAssignmentsHandler);
    router.patch('/companies/:companyId/offers/:offerId/assignments/:assignmentId', updateAssignmentHandler);
    return router;
}
//# sourceMappingURL=offers-payout.routes.js.map