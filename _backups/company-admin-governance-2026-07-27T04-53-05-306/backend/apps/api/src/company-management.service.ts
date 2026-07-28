import {
  assertCompanyAccess,
  assertCompanyRole,
  assertPlatformSuperAdmin,
  isPlatformSuperAdmin,
} from '@affiliate-tracker/auth';
import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';

import { ApiHttpError } from './api.errors.js';
import type { CompanyManagementRepository } from './company-management.repository.js';
import type {
  CompanyMembershipRecord,
  CompanyRecord,
  CompanyRepositoryContext,
  CreateCompanyInput,
  InviteCompanyMembershipInput,
  UpdateCompanyMembershipInput,
} from './company-management.types.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMPANY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CompanyManagementService {
  createCompany(
    identity: ResolvedApiIdentity,
    requestId: string,
    input: CreateCompanyInput,
  ): Promise<CompanyRecord>;

  listCompanies(
    identity: ResolvedApiIdentity,
    requestId: string,
  ): Promise<readonly CompanyRecord[]>;

  listAvailableCompanies(
    identity: ResolvedApiIdentity,
    requestId: string,
  ): Promise<readonly CompanyRecord[]>;

  getCompany(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<CompanyRecord>;

  listMemberships(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly CompanyMembershipRecord[]>;

  inviteMembership(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: InviteCompanyMembershipInput,
  ): Promise<CompanyMembershipRecord>;

  updateMembership(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    membershipId: string,
    input: UpdateCompanyMembershipInput,
  ): Promise<CompanyMembershipRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeSlug(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 2 ||
    normalizedValue.length > 80 ||
    !COMPANY_SLUG_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Company slug must contain 2 to 80 lowercase letters, numbers, or single hyphens.',
    );
  }

  return normalizedValue;
}

function normalizeName(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length < 2 || normalizedValue.length > 160) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Company name must contain 2 to 160 characters.',
    );
  }

  return normalizedValue;
}

function normalizeTimezone(value: string | undefined): string {
  const trimmedValue = value?.trim();

  const normalizedValue =
    trimmedValue === undefined || trimmedValue.length === 0 ? 'UTC' : trimmedValue;

  if (normalizedValue.length > 100) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Company timezone cannot exceed 100 characters.',
    );
  }

  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: normalizedValue,
    }).format();
  } catch (error: unknown) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Company timezone must be a valid IANA timezone.',
      {
        cause: error,
      },
    );
  }

  return normalizedValue;
}

function normalizeCompanyRole(value: CompanyRole): CompanyRole {
  switch (value) {
    case 'company_admin':
    case 'manager':
    case 'publisher':
      return value;
    default:
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company role is invalid.');
  }
}

function normalizeMembershipStatus(value: CompanyMembershipStatus): CompanyMembershipStatus {
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

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): CompanyRepositoryContext {
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

function assertCompanyRequestContext(identity: ResolvedApiIdentity, companyId: string): void {
  if (identity.requestedCompanyId === undefined) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_REQUIRED',
      400,
      'The x-company-id header is required for this operation.',
    );
  }

  if (identity.requestedCompanyId !== companyId) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_MISMATCH',
      400,
      'The x-company-id header must match the company route parameter.',
    );
  }
}

async function requireCompany(
  repository: CompanyManagementRepository,
  context: CompanyRepositoryContext,
  companyId: string,
): Promise<CompanyRecord> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  return company;
}

export function createCompanyManagementService(
  repository: CompanyManagementRepository,
): CompanyManagementService {
  return Object.freeze<CompanyManagementService>({
    async createCompany(identity, requestId, input): Promise<CompanyRecord> {
      assertPlatformSuperAdmin(identity.subject);

      const normalizedInput: Required<CreateCompanyInput> = Object.freeze({
        slug: normalizeSlug(input.slug),
        name: normalizeName(input.name),
        timezone: normalizeTimezone(input.timezone),
      });

      const company = await repository.createCompany(
        createRepositoryContext(identity, requestId),
        normalizedInput,
      );

      if (company === undefined) {
        throw new ApiHttpError(
          'COMPANY_SLUG_CONFLICT',
          409,
          'A company with this slug already exists.',
        );
      }

      return company;
    },

    async listCompanies(identity, requestId): Promise<readonly CompanyRecord[]> {
      assertPlatformSuperAdmin(identity.subject);

      return repository.listCompanies(createRepositoryContext(identity, requestId));
    },

    async listAvailableCompanies(identity, requestId): Promise<readonly CompanyRecord[]> {
      const context = createRepositoryContext(identity, requestId);

      return identity.subject.platformRole === 'platform_super_admin'
        ? repository.listCompanies(context)
        : repository.listAccessibleCompanies(context, identity.actor.userId);
    },

    async getCompany(identity, requestId, companyIdValue): Promise<CompanyRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);

      assertCompanyAccess(identity.subject, identity.companyMembership, companyId);

      return requireCompany(
        repository,
        createRepositoryContext(identity, requestId, companyId),
        companyId,
      );
    },

    async listMemberships(
      identity,
      requestId,
      companyIdValue,
    ): Promise<readonly CompanyMembershipRecord[]> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);

      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireCompany(repository, context, companyId);

      const memberships = await repository.listMemberships(context, companyId);

      return isPlatformSuperAdmin(identity.subject)
        ? memberships.filter((membership) => membership.role === 'company_admin')
        : memberships;
    },

    async inviteMembership(
      identity,
      requestId,
      companyIdValue,
      input,
    ): Promise<CompanyMembershipRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);

      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireCompany(repository, context, companyId);

      const role = normalizeCompanyRole(input.role);

      if (isPlatformSuperAdmin(identity.subject) && role !== 'company_admin') {
        throw new ApiHttpError(
          'PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN',
          403,
          'A Platform Super Admin can only create Company Admin memberships.',
        );
      }

      const membership = await repository.inviteMembership(context, companyId, {
        userId: normalizeUuid(input.userId, 'User ID'),
        role,
      });

      if (membership === undefined) {
        throw new ApiHttpError(
          'MEMBERSHIP_CONFLICT',
          409,
          'This user already has a membership in the company.',
        );
      }

      return membership;
    },

    async updateMembership(
      identity,
      requestId,
      companyIdValue,
      membershipIdValue,
      input,
    ): Promise<CompanyMembershipRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const membershipId = normalizeUuid(membershipIdValue, 'Membership ID');

      assertCompanyRequestContext(identity, companyId);

      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);

      if (input.role === undefined && input.status === undefined) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one membership field must be provided.',
        );
      }

      const context = createRepositoryContext(identity, requestId, companyId);

      const existingMembership = await repository.getMembership(context, companyId, membershipId);

      if (existingMembership === undefined) {
        throw new ApiHttpError(
          'MEMBERSHIP_NOT_FOUND',
          404,
          'The requested company membership was not found.',
        );
      }

      const role = input.role === undefined ? undefined : normalizeCompanyRole(input.role);

      const status =
        input.status === undefined ? undefined : normalizeMembershipStatus(input.status);

      const resultingRole = role ?? existingMembership.role;
      const resultingStatus = status ?? existingMembership.status;

      if (
        isPlatformSuperAdmin(identity.subject) &&
        (existingMembership.role !== 'company_admin' || resultingRole !== 'company_admin')
      ) {
        throw new ApiHttpError(
          'PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN',
          403,
          'A Platform Super Admin can only manage Company Admin memberships.',
        );
      }

      if (
        existingMembership.userId === identity.actor.userId &&
        existingMembership.role === 'company_admin' &&
        (resultingRole !== 'company_admin' || resultingStatus !== 'active')
      ) {
        throw new ApiHttpError(
          'SELF_MEMBERSHIP_CHANGE_FORBIDDEN',
          409,
          'A Company Admin cannot demote, suspend, or revoke their own membership.',
        );
      }

      const membership = await repository.updateMembership(context, companyId, membershipId, {
        ...(role !== undefined
          ? {
              role,
            }
          : {}),
        ...(status !== undefined
          ? {
              status,
            }
          : {}),
      });

      if (membership === undefined) {
        throw new ApiHttpError(
          'MEMBERSHIP_NOT_FOUND',
          404,
          'The requested company membership was not found.',
        );
      }

      return membership;
    },
  });
}

export type {
  CompanyMembershipRecord,
  CompanyRecord,
  CreateCompanyInput,
  InviteCompanyMembershipInput,
  UpdateCompanyMembershipInput,
} from './company-management.types.js';
