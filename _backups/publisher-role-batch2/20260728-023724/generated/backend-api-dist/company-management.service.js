import { assertCompanyAccess, assertCompanyRole, assertPlatformSuperAdmin, isPlatformSuperAdmin, } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function normalizeUuid(value, fieldName) {
    const normalizedValue = value.trim();
    if (!UUID_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
    }
    return normalizedValue;
}
function normalizeSlug(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue.length < 2 ||
        normalizedValue.length > 80 ||
        !COMPANY_SLUG_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company slug must contain 2 to 80 lowercase letters, numbers, or single hyphens.');
    }
    return normalizedValue;
}
function normalizeName(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < 2 || normalizedValue.length > 160) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company name must contain 2 to 160 characters.');
    }
    return normalizedValue;
}
function normalizeTimezone(value) {
    const trimmedValue = value?.trim();
    const normalizedValue = trimmedValue === undefined || trimmedValue.length === 0 ? 'UTC' : trimmedValue;
    if (normalizedValue.length > 100) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company timezone cannot exceed 100 characters.');
    }
    try {
        new Intl.DateTimeFormat('en-US', {
            timeZone: normalizedValue,
        }).format();
    }
    catch (error) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company timezone must be a valid IANA timezone.', {
            cause: error,
        });
    }
    return normalizedValue;
}
function normalizeCompanyRole(value) {
    switch (value) {
        case 'company_admin':
        case 'manager':
        case 'publisher':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company role is invalid.');
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
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company membership status is invalid.');
    }
}
function assertMembershipStatusTransition(currentStatus, status) {
    if (currentStatus === status) {
        throw new ApiHttpError('MEMBERSHIP_CONFLICT', 409, 'The membership already has the requested status.');
    }
    if (currentStatus === 'revoked') {
        if (status !== 'suspended') {
            throw new ApiHttpError('MEMBERSHIP_CONFLICT', 409, 'A revoked membership can only be restored into suspended status.');
        }
        return;
    }
    const transitionAllowed = (currentStatus === 'invited' &&
        (status === 'active' || status === 'suspended' || status === 'revoked')) ||
        (currentStatus === 'active' && (status === 'suspended' || status === 'revoked')) ||
        (currentStatus === 'suspended' && (status === 'active' || status === 'revoked'));
    if (!transitionAllowed) {
        throw new ApiHttpError('MEMBERSHIP_CONFLICT', 409, 'The requested membership status transition is invalid.');
    }
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
export function createCompanyManagementService(repository) {
    return Object.freeze({
        async createCompany(identity, requestId, input) {
            assertPlatformSuperAdmin(identity.subject);
            const normalizedInput = Object.freeze({
                slug: normalizeSlug(input.slug),
                name: normalizeName(input.name),
                timezone: normalizeTimezone(input.timezone),
            });
            const company = await repository.createCompany(createRepositoryContext(identity, requestId), normalizedInput);
            if (company === undefined) {
                throw new ApiHttpError('COMPANY_SLUG_CONFLICT', 409, 'A company with this slug already exists.');
            }
            return company;
        },
        async listCompanies(identity, requestId) {
            assertPlatformSuperAdmin(identity.subject);
            return repository.listCompanies(createRepositoryContext(identity, requestId));
        },
        async listAvailableCompanies(identity, requestId) {
            const context = createRepositoryContext(identity, requestId);
            return identity.subject.platformRole === 'platform_super_admin'
                ? repository.listCompanies(context)
                : repository.listAccessibleCompanies(context, identity.actor.userId);
        },
        async getCompany(identity, requestId, companyIdValue) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyAccess(identity.subject, identity.companyMembership, companyId);
            return requireCompany(repository, createRepositoryContext(identity, requestId, companyId), companyId);
        },
        async listMemberships(identity, requestId, companyIdValue) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireCompany(repository, context, companyId);
            const memberships = await repository.listMemberships(context, companyId);
            if (isPlatformSuperAdmin(identity.subject)) {
                return memberships.filter((membership) => membership.role === 'company_admin');
            }
            return identity.companyMembership?.role === 'company_admin'
                ? memberships.filter((membership) => membership.role === 'manager')
                : memberships.filter((membership) => membership.role === 'publisher');
        },
        async inviteMembership(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireCompany(repository, context, companyId);
            const role = normalizeCompanyRole(input.role);
            if (isPlatformSuperAdmin(identity.subject) && role !== 'company_admin') {
                throw new ApiHttpError('PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Platform Super Admin can only create Company Admin memberships.');
            }
            if (!isPlatformSuperAdmin(identity.subject) && role !== 'manager') {
                throw new ApiHttpError('COMPANY_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Company Admin can only create Manager memberships.');
            }
            const membership = await repository.inviteMembership(context, companyId, {
                userId: normalizeUuid(input.userId, 'User ID'),
                role,
            });
            if (membership === undefined) {
                throw new ApiHttpError('MEMBERSHIP_CONFLICT', 409, 'This user already has a membership in the company.');
            }
            return membership;
        },
        async updateMembership(identity, requestId, companyIdValue, membershipIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const membershipId = normalizeUuid(membershipIdValue, 'Membership ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
            ]);
            if (input.status === undefined) {
                throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Membership status is required. Membership roles are immutable.');
            }
            const context = createRepositoryContext(identity, requestId, companyId);
            const existingMembership = await repository.getMembership(context, companyId, membershipId);
            if (existingMembership === undefined) {
                throw new ApiHttpError('MEMBERSHIP_NOT_FOUND', 404, 'The requested company membership was not found.');
            }
            const role = input.role === undefined ? undefined : normalizeCompanyRole(input.role);
            const status = normalizeMembershipStatus(input.status);
            const actorRole = identity.companyMembership?.role;
            if (role !== undefined && role !== existingMembership.role) {
                throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Membership roles are immutable after creation.');
            }
            if (isPlatformSuperAdmin(identity.subject) && existingMembership.role !== 'company_admin') {
                throw new ApiHttpError('PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Platform Super Admin can only manage Company Admin memberships.');
            }
            if (actorRole === 'company_admin' && existingMembership.role !== 'manager') {
                throw new ApiHttpError('COMPANY_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Company Admin can only manage Manager memberships.');
            }
            if (actorRole === 'manager' && existingMembership.role !== 'publisher') {
                throw new ApiHttpError('COMPANY_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN', 403, 'A Manager can only manage Publisher memberships within their own scope.');
            }
            if (existingMembership.userId === identity.actor.userId &&
                existingMembership.role === 'company_admin' &&
                status !== 'active') {
                throw new ApiHttpError('SELF_MEMBERSHIP_CHANGE_FORBIDDEN', 409, 'A Company Admin cannot suspend or revoke their own membership.');
            }
            assertMembershipStatusTransition(existingMembership.status, status);
            const membership = await repository.updateMembership(context, companyId, membershipId, {
                status,
            });
            if (membership === undefined) {
                throw new ApiHttpError('MEMBERSHIP_NOT_FOUND', 404, 'The requested company membership was not found.');
            }
            return membership;
        },
    });
}
//# sourceMappingURL=company-management.service.js.map