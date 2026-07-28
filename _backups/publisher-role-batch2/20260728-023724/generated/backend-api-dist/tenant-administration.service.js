import { Buffer } from 'node:buffer';
import { assertCompanyRole, assertPlatformSuperAdmin, isPlatformSuperAdmin, } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_DIRECTORY_LIMIT = 25;
const DEFAULT_AUDIT_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;
const MAX_SEARCH_LENGTH = 120;
const MAX_EVENT_NAME_LENGTH = 160;
const MAX_ENTITY_TYPE_LENGTH = 120;
const MAX_ENTITY_ID_LENGTH = 255;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeUuid(value, fieldName) {
    const normalizedValue = value.trim();
    if (!UUID_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
    }
    return normalizedValue;
}
function normalizeCompanyStatus(value) {
    switch (value) {
        case 'active':
        case 'suspended':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company status is invalid.');
    }
}
function normalizeCompanyRole(value) {
    switch (value) {
        case 'company_admin':
        case 'manager':
        case 'publisher':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'Company role is invalid.');
    }
}
function normalizeMembershipStatus(value) {
    switch (value) {
        case 'invited':
        case 'active':
        case 'suspended':
        case 'revoked':
            return value;
        default:
            throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'Company membership status is invalid.');
    }
}
function normalizeUserStatus(value) {
    switch (value) {
        case 'active':
        case 'suspended':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'User status is invalid.');
    }
}
function normalizePageLimit(value, defaultValue) {
    if (value === undefined) {
        return defaultValue;
    }
    if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_LIMIT) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `limit must be an integer between 1 and ${String(MAX_PAGE_LIMIT)}.`);
    }
    return value;
}
function normalizeOptionalText(value, fieldName, maximumLength) {
    if (value === undefined) {
        return undefined;
    }
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0 || normalizedValue.length > maximumLength) {
        throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${fieldName} must contain 1 to ${String(maximumLength)} characters.`);
    }
    return normalizedValue;
}
function encodeCursor(cursor) {
    return Buffer.from(JSON.stringify({
        createdAt: cursor.createdAt,
        id: cursor.id,
    }), 'utf8').toString('base64url');
}
function decodeCursor(value) {
    if (value === undefined) {
        return undefined;
    }
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0 || normalizedValue.length > MAX_CURSOR_LENGTH) {
        throw new ApiHttpError('INVALID_CURSOR', 400, 'The pagination cursor is invalid.');
    }
    let decodedValue;
    try {
        decodedValue = JSON.parse(Buffer.from(normalizedValue, 'base64url').toString('utf8'));
    }
    catch (error) {
        throw new ApiHttpError('INVALID_CURSOR', 400, 'The pagination cursor is invalid.', {
            cause: error,
        });
    }
    if (!isRecord(decodedValue)) {
        throw new ApiHttpError('INVALID_CURSOR', 400, 'The pagination cursor is invalid.');
    }
    const createdAt = decodedValue['createdAt'];
    const id = decodedValue['id'];
    if (typeof createdAt !== 'string' ||
        Number.isNaN(new Date(createdAt).getTime()) ||
        typeof id !== 'string' ||
        !UUID_PATTERN.test(id)) {
        throw new ApiHttpError('INVALID_CURSOR', 400, 'The pagination cursor is invalid.');
    }
    return Object.freeze({
        createdAt: new Date(createdAt).toISOString(),
        id,
    });
}
function createApiPage(page) {
    return Object.freeze({
        items: page.items,
        nextCursor: page.nextCursor === undefined ? null : encodeCursor(page.nextCursor),
    });
}
function createRepositoryContext(identity, requestId, companyId) {
    return {
        actorUserId: identity.actor.userId,
        requestId,
        ...(companyId !== undefined
            ? {
                companyId,
            }
            : {}),
    };
}
function assertCompanyRequestContext(identity, companyId) {
    if (identity.requestedCompanyId === undefined) {
        throw new ApiHttpError('COMPANY_CONTEXT_REQUIRED', 400, 'The x-company-id header is required for this operation.');
    }
    if (identity.requestedCompanyId !== companyId) {
        throw new ApiHttpError('COMPANY_CONTEXT_MISMATCH', 400, 'The x-company-id header must match the company route parameter.');
    }
}
async function requireCompany(repository, context, companyId) {
    const company = await repository.getCompany(context, companyId);
    if (company === undefined) {
        throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
    }
    return company;
}
function assertCompanyStatusTransition(currentStatus, status) {
    if (currentStatus === status) {
        throw new ApiHttpError('COMPANY_STATUS_UNCHANGED', 409, 'The company already has the requested status.');
    }
    if (currentStatus === 'archived' && status !== 'suspended') {
        throw new ApiHttpError('COMPANY_STATUS_TRANSITION_INVALID', 409, 'An archived company can only be restored into suspended status.');
    }
}
export function createTenantAdministrationService(repository) {
    return Object.freeze({
        async updateCompanyStatus(identity, requestId, companyIdValue, input) {
            assertPlatformSuperAdmin(identity.subject);
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const status = normalizeCompanyStatus(input.status);
            const readContext = createRepositoryContext(identity, requestId);
            const company = await requireCompany(repository, readContext, companyId);
            assertCompanyStatusTransition(company.status, status);
            const result = await repository.updateCompanyStatus(createRepositoryContext(identity, requestId, companyId), companyId, company.status, status);
            if (result === undefined) {
                throw new ApiHttpError('COMPANY_STATUS_CONFLICT', 409, 'The company status changed before this request could be completed.');
            }
            return result.company;
        },
        async listCompanyUsers(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireCompany(repository, context, companyId);
            const cursor = decodeCursor(input.cursor);
            const search = normalizeOptionalText(input.search, 'search', MAX_SEARCH_LENGTH);
            const platformAdmin = isPlatformSuperAdmin(identity.subject);
            if (platformAdmin && input.role !== undefined && input.role !== 'company_admin') {
                throw new ApiHttpError('PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Platform Super Admin can only view Company Admin accounts.');
            }
            const actorRole = identity.companyMembership?.role;
            const requestedRole = platformAdmin
                ? 'company_admin'
                : actorRole === 'company_admin'
                    ? 'manager'
                    : actorRole === 'manager'
                        ? 'publisher'
                        : input.role === undefined
                            ? undefined
                            : normalizeCompanyRole(input.role);
            if (actorRole === 'company_admin' &&
                input.role !== undefined &&
                input.role !== 'manager') {
                throw new ApiHttpError('COMPANY_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Company Admin can only view Manager accounts.');
            }
            const page = await repository.listCompanyUsers(context, companyId, {
                limit: normalizePageLimit(input.limit, DEFAULT_DIRECTORY_LIMIT),
                ...(cursor !== undefined
                    ? {
                        cursor,
                    }
                    : {}),
                ...(requestedRole !== undefined
                    ? {
                        role: requestedRole,
                    }
                    : {}),
                ...(input.membershipStatus !== undefined
                    ? {
                        membershipStatus: normalizeMembershipStatus(input.membershipStatus),
                    }
                    : {}),
                ...(input.userStatus !== undefined
                    ? {
                        userStatus: normalizeUserStatus(input.userStatus),
                    }
                    : {}),
                ...(search !== undefined
                    ? {
                        search,
                    }
                    : {}),
            });
            return createApiPage(page);
        },
        async getCompanyUser(identity, requestId, companyIdValue, userIdValue) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const userId = normalizeUuid(userIdValue, 'User ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireCompany(repository, context, companyId);
            const user = await repository.getCompanyUser(context, companyId, userId);
            const actorRole = identity.companyMembership?.role;
            if (user === undefined ||
                (isPlatformSuperAdmin(identity.subject) && user.role !== 'company_admin') ||
                (actorRole === 'company_admin' && user.role !== 'manager') ||
                (actorRole === 'manager' && user.role !== 'publisher')) {
                throw new ApiHttpError('USER_NOT_FOUND', 404, 'The requested company user was not found.');
            }
            return user;
        },
        async updateUserStatus(identity, requestId, userIdValue, input) {
            assertPlatformSuperAdmin(identity.subject);
            const userId = normalizeUuid(userIdValue, 'User ID');
            const companyId = identity.requestedCompanyId === undefined
                ? undefined
                : normalizeUuid(identity.requestedCompanyId, 'Company ID');
            if (companyId === undefined) {
                throw new ApiHttpError('COMPANY_CONTEXT_REQUIRED', 400, 'The x-company-id header is required to manage a Company Admin account.');
            }
            const status = normalizeUserStatus(input.status);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireCompany(repository, context, companyId);
            const companyUser = await repository.getCompanyUser(context, companyId, userId);
            if (companyUser?.role !== 'company_admin') {
                throw new ApiHttpError('PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Platform Super Admin can only manage Company Admin accounts.');
            }
            const profile = await repository.getUserProfile(context, userId);
            if (profile === undefined) {
                throw new ApiHttpError('USER_NOT_FOUND', 404, 'The requested user profile was not found.');
            }
            if (userId === identity.actor.userId && status === 'suspended') {
                throw new ApiHttpError('SELF_USER_SUSPENSION_FORBIDDEN', 409, 'A Platform Super Admin cannot suspend their own account.');
            }
            if (profile.status === status) {
                throw new ApiHttpError('USER_STATUS_UNCHANGED', 409, 'The user already has the requested status.');
            }
            const result = await repository.updateUserStatus(context, userId, profile.status, status);
            if (result === undefined) {
                throw new ApiHttpError('USER_STATUS_CONFLICT', 409, 'The user status changed before this request could be completed.');
            }
            return result.profile;
        },
        async listAuditEvents(identity, requestId, companyIdValue, input) {
            if (isPlatformSuperAdmin(identity.subject)) {
                throw new ApiHttpError('PLATFORM_SUPER_ADMIN_SCOPE_RESTRICTED', 403, 'Platform Super Admin access does not include the tenant audit trail.');
            }
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireCompany(repository, context, companyId);
            const cursor = decodeCursor(input.cursor);
            const eventName = normalizeOptionalText(input.eventName, 'eventName', MAX_EVENT_NAME_LENGTH);
            const entityType = normalizeOptionalText(input.entityType, 'entityType', MAX_ENTITY_TYPE_LENGTH);
            const entityId = normalizeOptionalText(input.entityId, 'entityId', MAX_ENTITY_ID_LENGTH);
            const page = await repository.listAuditEvents(context, companyId, {
                limit: normalizePageLimit(input.limit, DEFAULT_AUDIT_LIMIT),
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
                ...(input.actorUserId !== undefined
                    ? {
                        actorUserId: normalizeUuid(input.actorUserId, 'Actor user ID'),
                    }
                    : {}),
            });
            return createApiPage(page);
        },
    });
}
//# sourceMappingURL=tenant-administration.service.js.map