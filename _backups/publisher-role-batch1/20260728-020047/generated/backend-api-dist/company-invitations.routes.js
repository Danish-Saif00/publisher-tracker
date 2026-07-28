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
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a non-empty string.`);
    }
    return value;
}
function readCompanyRole(body) {
    const value = body['role'];
    if (value === 'company_admin' || value === 'manager' || value === 'publisher') {
        return value;
    }
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'role must be company_admin, manager, or publisher.');
}
function readRouteParameter(request, propertyName) {
    const value = request.params[propertyName];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${propertyName} is required.`);
    }
    return value;
}
function resolveRequestInformation(request) {
    return {
        identity: getResolvedIdentity(request),
        requestId: getRequestContext(request).requestId,
    };
}
export function createCompanyInvitationsRouter(options) {
    const router = Router();
    const createHandler = async (request, response) => {
        const body = readBody(request);
        const information = resolveRequestInformation(request);
        const invitation = await options.service.createInvitation(information.identity, information.requestId, readRouteParameter(request, 'companyId'), {
            email: readRequiredString(body, 'email'),
            role: readCompanyRole(body),
        });
        response.status(201).json({ data: { invitation } });
    };
    const listHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const invitations = await options.service.listInvitations(information.identity, information.requestId, readRouteParameter(request, 'companyId'));
        response.status(200).json({ data: { invitations } });
    };
    const resendHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const invitation = await options.service.resendInvitation(information.identity, information.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'invitationId'));
        response.status(200).json({ data: { invitation } });
    };
    const revokeHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const invitation = await options.service.revokeInvitation(information.identity, information.requestId, readRouteParameter(request, 'companyId'), readRouteParameter(request, 'invitationId'));
        response.status(200).json({ data: { invitation } });
    };
    const previewHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const preview = await options.service.previewInvitation(information.identity, information.requestId, readRequiredString(readBody(request), 'token'));
        response.status(200).json({ data: { preview } });
    };
    const acceptHandler = async (request, response) => {
        const information = resolveRequestInformation(request);
        const result = await options.service.acceptInvitation(information.identity, information.requestId, readRequiredString(readBody(request), 'token'));
        response.status(200).json({ data: { result } });
    };
    router.post('/companies/:companyId/invitations', createHandler);
    router.get('/companies/:companyId/invitations', listHandler);
    router.post('/companies/:companyId/invitations/:invitationId/resend', resendHandler);
    router.post('/companies/:companyId/invitations/:invitationId/revoke', revokeHandler);
    router.post('/invitations/preview', previewHandler);
    router.post('/invitations/accept', acceptHandler);
    return router;
}
//# sourceMappingURL=company-invitations.routes.js.map