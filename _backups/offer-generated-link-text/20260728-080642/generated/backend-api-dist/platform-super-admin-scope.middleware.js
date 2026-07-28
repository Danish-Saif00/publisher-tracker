import { isPlatformSuperAdmin } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
import { getResolvedIdentity } from './request-context.js';
const UUID_SEGMENT = '[0-9a-fA-F-]+';
const ALLOWED_PLATFORM_OPERATIONS = Object.freeze([
    { method: 'GET', path: /^\/auth\/me$/u },
    { method: 'GET', path: /^\/platform\/companies$/u },
    { method: 'POST', path: /^\/platform\/companies$/u },
    { method: 'GET', path: /^\/me\/companies$/u },
    { method: 'GET', path: new RegExp(`^/companies/${UUID_SEGMENT}$`, 'u') },
    { method: 'PATCH', path: new RegExp(`^/platform/companies/${UUID_SEGMENT}/status$`, 'u') },
    { method: 'GET', path: new RegExp(`^/companies/${UUID_SEGMENT}/invitations$`, 'u') },
    { method: 'POST', path: new RegExp(`^/companies/${UUID_SEGMENT}/invitations$`, 'u') },
    {
        method: 'POST',
        path: new RegExp(`^/companies/${UUID_SEGMENT}/invitations/${UUID_SEGMENT}/resend$`, 'u'),
    },
    {
        method: 'POST',
        path: new RegExp(`^/companies/${UUID_SEGMENT}/invitations/${UUID_SEGMENT}/revoke$`, 'u'),
    },
    { method: 'GET', path: new RegExp(`^/companies/${UUID_SEGMENT}/users$`, 'u') },
    { method: 'GET', path: new RegExp(`^/companies/${UUID_SEGMENT}/users/${UUID_SEGMENT}$`, 'u') },
    { method: 'GET', path: new RegExp(`^/companies/${UUID_SEGMENT}/memberships$`, 'u') },
    {
        method: 'PATCH',
        path: new RegExp(`^/companies/${UUID_SEGMENT}/memberships/${UUID_SEGMENT}$`, 'u'),
    },
    { method: 'PATCH', path: new RegExp(`^/platform/users/${UUID_SEGMENT}/status$`, 'u') },
    { method: 'GET', path: /^\/platform\/billing\/plans$/u },
    { method: 'POST', path: /^\/platform\/billing\/plans$/u },
    { method: 'GET', path: new RegExp(`^/platform/billing/plans/${UUID_SEGMENT}$`, 'u') },
    { method: 'PATCH', path: new RegExp(`^/platform/billing/plans/${UUID_SEGMENT}$`, 'u') },
    {
        method: 'GET',
        path: new RegExp(`^/platform/companies/${UUID_SEGMENT}/subscription$`, 'u'),
    },
    {
        method: 'POST',
        path: new RegExp(`^/platform/companies/${UUID_SEGMENT}/subscription$`, 'u'),
    },
    {
        method: 'PATCH',
        path: new RegExp(`^/platform/companies/${UUID_SEGMENT}/subscription$`, 'u'),
    },
    {
        method: 'GET',
        path: new RegExp(`^/companies/${UUID_SEGMENT}/billing/invoices$`, 'u'),
    },
    { method: 'GET', path: /^\/me\/profile$/u },
    { method: 'PUT', path: /^\/me\/profile$/u },
]);
function isAllowedPlatformOperation(method, path) {
    return ALLOWED_PLATFORM_OPERATIONS.some((operation) => operation.method === method && operation.path.test(path));
}
export function createPlatformSuperAdminScopeMiddleware() {
    return (request, _response, next) => {
        try {
            const identity = getResolvedIdentity(request);
            if (!isPlatformSuperAdmin(identity.subject)) {
                next();
                return;
            }
            if (isAllowedPlatformOperation(request.method, request.path)) {
                next();
                return;
            }
            throw new ApiHttpError('PLATFORM_SUPER_ADMIN_SCOPE_RESTRICTED', 403, 'Platform Super Admin access is limited to companies, company administrators, billing, and profile management.');
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=platform-super-admin-scope.middleware.js.map