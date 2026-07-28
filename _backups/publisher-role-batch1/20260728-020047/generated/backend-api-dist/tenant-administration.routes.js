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
function readCompanyStatus(body) {
    const value = body['status'];
    switch (value) {
        case 'active':
        case 'suspended':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active, suspended, or archived.');
    }
}
function readUserStatus(body) {
    const value = body['status'];
    switch (value) {
        case 'active':
        case 'suspended':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active or suspended.');
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
function readOptionalQueryInteger(request, propertyName) {
    const value = readOptionalQueryString(request, propertyName);
    if (value === undefined) {
        return undefined;
    }
    if (!/^\d+$/.test(value)) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be an integer.`);
    }
    return Number(value);
}
function readOptionalCompanyRoleQuery(request) {
    const value = readOptionalQueryString(request, 'role');
    switch (value) {
        case undefined:
            return undefined;
        case 'company_admin':
        case 'manager':
        case 'publisher':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'role must be company_admin, manager, or publisher.');
    }
}
function readOptionalMembershipStatusQuery(request) {
    const value = readOptionalQueryString(request, 'membershipStatus');
    switch (value) {
        case undefined:
            return undefined;
        case 'invited':
        case 'active':
        case 'suspended':
        case 'revoked':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'membershipStatus must be invited, active, suspended, or revoked.');
    }
}
function readOptionalUserStatusQuery(request) {
    const value = readOptionalQueryString(request, 'userStatus');
    switch (value) {
        case undefined:
            return undefined;
        case 'active':
        case 'suspended':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'userStatus must be active or suspended.');
    }
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createTenantAdministrationRouter(options) {
    const router = Router();
    const updateCompanyStatusHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const company = await options.service.updateCompanyStatus(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            status: readCompanyStatus(body),
        });
        response.status(200).json({
            data: company,
        });
    };
    const listCompanyUsersHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const limit = readOptionalQueryInteger(request, 'limit');
        const cursor = readOptionalQueryString(request, 'cursor');
        const role = readOptionalCompanyRoleQuery(request);
        const membershipStatus = readOptionalMembershipStatusQuery(request);
        const userStatus = readOptionalUserStatusQuery(request);
        const search = readOptionalQueryString(request, 'search');
        const page = await options.service.listCompanyUsers(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            ...(limit !== undefined
                ? {
                    limit,
                }
                : {}),
            ...(cursor !== undefined
                ? {
                    cursor,
                }
                : {}),
            ...(role !== undefined
                ? {
                    role,
                }
                : {}),
            ...(membershipStatus !== undefined
                ? {
                    membershipStatus,
                }
                : {}),
            ...(userStatus !== undefined
                ? {
                    userStatus,
                }
                : {}),
            ...(search !== undefined
                ? {
                    search,
                }
                : {}),
        });
        response.status(200).json({
            data: page.items,
            pagination: {
                nextCursor: page.nextCursor,
            },
        });
    };
    const getCompanyUserHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const user = await options.service.getCompanyUser(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'userId'));
        response.status(200).json({
            data: user,
        });
    };
    const updateUserStatusHandler = async (request, response) => {
        const body = readBody(request);
        const requestInformation = resolveRequestInformation(request);
        const user = await options.service.updateUserStatus(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'userId'), {
            status: readUserStatus(body),
        });
        response.status(200).json({
            data: user,
        });
    };
    const listAuditEventsHandler = async (request, response) => {
        const requestInformation = resolveRequestInformation(request);
        const limit = readOptionalQueryInteger(request, 'limit');
        const cursor = readOptionalQueryString(request, 'cursor');
        const eventName = readOptionalQueryString(request, 'eventName');
        const entityType = readOptionalQueryString(request, 'entityType');
        const entityId = readOptionalQueryString(request, 'entityId');
        const actorUserId = readOptionalQueryString(request, 'actorUserId');
        const page = await options.service.listAuditEvents(requestInformation.identity, requestInformation.requestId, readRouteParameter(request, 'companyId'), {
            ...(limit !== undefined
                ? {
                    limit,
                }
                : {}),
            ...(cursor !== undefined
                ? {
                    cursor,
                }
                : {}),
            ...(eventName !== undefined
                ? {
                    eventName,
                }
                : {}),
            ...(entityType !== undefined
                ? {
                    entityType,
                }
                : {}),
            ...(entityId !== undefined
                ? {
                    entityId,
                }
                : {}),
            ...(actorUserId !== undefined
                ? {
                    actorUserId,
                }
                : {}),
        });
        response.status(200).json({
            data: page.items,
            pagination: {
                nextCursor: page.nextCursor,
            },
        });
    };
    router.patch('/platform/companies/:companyId/status', updateCompanyStatusHandler);
    router.patch('/platform/users/:userId/status', updateUserStatusHandler);
    router.get('/companies/:companyId/users', listCompanyUsersHandler);
    router.get('/companies/:companyId/users/:userId', getCompanyUserHandler);
    router.get('/companies/:companyId/audit-events', listAuditEventsHandler);
    return router;
}
//# sourceMappingURL=tenant-administration.routes.js.map