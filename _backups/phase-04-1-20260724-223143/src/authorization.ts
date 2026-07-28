import type {
  AuthorizationSubject,
  CompanyMembershipIdentity,
  CompanyRole,
} from '@affiliate-tracker/contracts';

import { AuthorizationError } from './auth.errors.js';

export function isPlatformSuperAdmin(subject: AuthorizationSubject): boolean {
  return subject.platformRole === 'platform_super_admin';
}

export function hasCompanyAccess(
  subject: AuthorizationSubject,
  membership: CompanyMembershipIdentity | undefined,
  companyId: string,
): boolean {
  if (isPlatformSuperAdmin(subject)) {
    return true;
  }

  if (membership === undefined) {
    return false;
  }

  return (
    membership.userId === subject.userId &&
    membership.companyId === companyId &&
    membership.status === 'active'
  );
}

export function hasCompanyRole(
  subject: AuthorizationSubject,
  membership: CompanyMembershipIdentity | undefined,
  companyId: string,
  allowedRoles: readonly CompanyRole[],
): boolean {
  if (isPlatformSuperAdmin(subject)) {
    return true;
  }

  return (
    hasCompanyAccess(subject, membership, companyId) &&
    membership !== undefined &&
    allowedRoles.includes(membership.role)
  );
}

export function assertPlatformSuperAdmin(subject: AuthorizationSubject): void {
  if (!isPlatformSuperAdmin(subject)) {
    throw new AuthorizationError(
      'PLATFORM_ROLE_REQUIRED',
      'Platform Super Admin access is required.',
    );
  }
}

export function assertCompanyAccess(
  subject: AuthorizationSubject,
  membership: CompanyMembershipIdentity | undefined,
  companyId: string,
): void {
  if (!hasCompanyAccess(subject, membership, companyId)) {
    throw new AuthorizationError(
      'COMPANY_ACCESS_DENIED',
      'Access to the requested company is denied.',
    );
  }
}

export function assertCompanyRole(
  subject: AuthorizationSubject,
  membership: CompanyMembershipIdentity | undefined,
  companyId: string,
  allowedRoles: readonly CompanyRole[],
): void {
  if (allowedRoles.length === 0) {
    throw new TypeError('At least one allowed company role is required.');
  }

  assertCompanyAccess(subject, membership, companyId);

  if (!hasCompanyRole(subject, membership, companyId, allowedRoles)) {
    throw new AuthorizationError(
      'COMPANY_ROLE_REQUIRED',
      `One of the following company roles is required: ${allowedRoles.join(', ')}.`,
    );
  }
}
