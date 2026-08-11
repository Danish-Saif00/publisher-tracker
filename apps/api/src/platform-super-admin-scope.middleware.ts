import { isPlatformSuperAdmin } from '@affiliate-tracker/auth';
import type { RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { getResolvedIdentity } from './request-context.js';

type AllowedPlatformOperation = Readonly<{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  path: RegExp;
}>;

const UUID_SEGMENT = '[0-9a-fA-F-]+';

const ALLOWED_PLATFORM_OPERATIONS: readonly AllowedPlatformOperation[] = Object.freeze([
  { method: 'GET', path: /^\/auth\/me$/u },
  { method: 'GET', path: /^\/platform\/companies$/u },
  { method: 'POST', path: /^\/platform\/companies$/u },
  { method: 'POST', path: /^\/platform\/factory-reset$/u },
  { method: 'GET', path: /^\/me\/companies$/u },
  { method: 'GET', path: new RegExp(`^/companies/${UUID_SEGMENT}$`, 'u') },
  { method: 'PATCH', path: new RegExp(`^/platform/companies/${UUID_SEGMENT}/status$`, 'u') },
  {
    method: 'POST',
    path: new RegExp(`^/companies/${UUID_SEGMENT}/managed-users$`, 'u'),
  },
  {
    method: 'PATCH',
    path: new RegExp(`^/companies/${UUID_SEGMENT}/managed-users/${UUID_SEGMENT}/password$`, 'u'),
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

function isAllowedPlatformOperation(method: string, path: string): boolean {
  return ALLOWED_PLATFORM_OPERATIONS.some(
    (operation) => operation.method === method && operation.path.test(path),
  );
}

export function createPlatformSuperAdminScopeMiddleware(): RequestHandler {
  return (request, _response, next): void => {
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

      const platformTrackingDomainStatusPath =
        /^\/platform\/tracking-domains\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/status$/iu;
      const platformTrackingDomainActionPath =
        /^\/platform\/tracking-domains\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:adopt|reconcile|disconnect)$/iu;

      if (
        (request.method === 'GET' && request.path === '/platform/tracking-domains') ||
        (request.method === 'PATCH' && platformTrackingDomainStatusPath.test(request.path)) ||
        (request.method === 'POST' && platformTrackingDomainActionPath.test(request.path))
      ) {
        next();
        return;
      }

      throw new ApiHttpError(
        'PLATFORM_SUPER_ADMIN_SCOPE_RESTRICTED',
        403,
        'Platform Super Admin access is limited to companies, company administrators, domain approvals, billing, and profile management.',
      );
    } catch (error: unknown) {
      next(error);
    }
  };
}
