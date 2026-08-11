import {
  assertCompanyRole,
  isPlatformSuperAdmin,
  SupabaseManagedUserError,
  type SupabaseManagedUsersGateway,
} from '@affiliate-tracker/auth';
import type { CompanyRole } from '@affiliate-tracker/contracts';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { ManagedUsersRepository } from './managed-users.repository.js';
import type {
  CreateManagedUserInput,
  ManagedUserPasswordResetResult,
  ManagedUserRepositoryContext,
  ManagedUserUpdateResult,
  ResetManagedUserPasswordInput,
  UpdateManagedUserInput,
} from './managed-users.types.js';
import type { TenantAdministrationRepository } from './tenant-administration.repository.js';
import type { CompanyDirectoryUserRecord, CompanyRecord } from './tenant-administration.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MINIMUM_PASSWORD_LENGTH = 6;
const MAXIMUM_PASSWORD_LENGTH = 16;

export interface ManagedUsersService {
  createManagedUser(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateManagedUserInput,
  ): Promise<CompanyDirectoryUserRecord>;

  updateManagedUser(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    userId: string,
    input: UpdateManagedUserInput,
  ): Promise<ManagedUserUpdateResult>;

  resetManagedUserPassword(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    userId: string,
    input: ResetManagedUserPasswordInput,
  ): Promise<ManagedUserPasswordResetResult>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeEmail(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 3 ||
    normalizedValue.length > 320 ||
    !EMAIL_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'email must be a valid email address.');
  }

  return normalizedValue;
}

function normalizePassword(value: string): string {
  if (value.length < MINIMUM_PASSWORD_LENGTH || value.length > MAXIMUM_PASSWORD_LENGTH) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `password must contain ${String(MINIMUM_PASSWORD_LENGTH)} to ${String(
        MAXIMUM_PASSWORD_LENGTH,
      )} characters.`,
    );
  }

  return value;
}

function normalizeDisplayName(value: string): string | null {
  const normalizedValue = value.trim();
  if (normalizedValue.length > 160) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'displayName must contain at most 160 characters.',
    );
  }

  return normalizedValue.length === 0 ? null : normalizedValue;
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

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId: string,
): ManagedUserRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    companyId,
  };
}

async function requireActiveCompany(
  repository: TenantAdministrationRepository,
  context: ManagedUserRepositoryContext,
  companyId: string,
): Promise<CompanyRecord> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  if (company.status !== 'active') {
    throw new ApiHttpError(
      'COMPANY_NOT_ACTIVE',
      409,
      'Managed users can only be provisioned for an active company.',
    );
  }

  return company;
}

function resolveTargetRole(identity: ResolvedApiIdentity, companyId: string): CompanyRole {
  if (isPlatformSuperAdmin(identity.subject)) {
    return 'company_admin';
  }

  assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
  ]);

  switch (identity.companyMembership?.role) {
    case 'company_admin':
      return 'manager';
    case 'manager':
      return 'publisher';
    default:
      throw new ApiHttpError(
        'MANAGED_USER_ROLE_FORBIDDEN',
        403,
        'The authenticated role cannot provision managed users.',
      );
  }
}

function assertTargetRelationship(
  identity: ResolvedApiIdentity,
  target: CompanyDirectoryUserRecord,
): void {
  if (isPlatformSuperAdmin(identity.subject)) {
    if (target.role !== 'company_admin') {
      throw new ApiHttpError(
        'MANAGED_USER_NOT_FOUND',
        404,
        'The requested managed user was not found.',
      );
    }

    return;
  }

  switch (identity.companyMembership?.role) {
    case 'company_admin':
      if (target.role !== 'manager') {
        throw new ApiHttpError(
          'MANAGED_USER_NOT_FOUND',
          404,
          'The requested managed user was not found.',
        );
      }
      return;

    case 'manager':
      if (target.role !== 'publisher' || target.invitedBy !== identity.actor.userId) {
        throw new ApiHttpError(
          'MANAGED_USER_NOT_FOUND',
          404,
          'The requested managed user was not found.',
        );
      }
      return;

    default:
      throw new ApiHttpError(
        'MANAGED_USER_ROLE_FORBIDDEN',
        403,
        'The authenticated role cannot manage credentials.',
      );
  }
}

function mapGatewayError(error: unknown): ApiHttpError {
  if (error instanceof SupabaseManagedUserError) {
    switch (error.code) {
      case 'USER_ALREADY_EXISTS':
        return new ApiHttpError(
          'MANAGED_USER_ALREADY_EXISTS',
          409,
          'A user with this email address already exists.',
        );

      case 'MANAGED_USER_NOT_FOUND':
        return new ApiHttpError(
          'MANAGED_USER_NOT_FOUND',
          404,
          'The requested managed user was not found.',
        );

      case 'MANAGED_USER_OPERATION_FAILED':
        return new ApiHttpError(
          'MANAGED_USER_AUTH_UNAVAILABLE',
          503,
          'The managed authentication service is temporarily unavailable.',
        );
    }
  }

  return new ApiHttpError(
    'MANAGED_USER_AUTH_UNAVAILABLE',
    503,
    'The managed authentication service is temporarily unavailable.',
  );
}

export function createManagedUsersService(
  tenantRepository: TenantAdministrationRepository,
  managedUsersRepository: ManagedUsersRepository,
  managedUsersGateway: SupabaseManagedUsersGateway,
): ManagedUsersService {
  return Object.freeze<ManagedUsersService>({
    async createManagedUser(
      identity,
      requestId,
      companyIdValue,
      input,
    ): Promise<CompanyDirectoryUserRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      assertCompanyRequestContext(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(tenantRepository, context, companyId);

      const targetRole = resolveTargetRole(identity, companyId);
      const email = normalizeEmail(input.email);
      const password = normalizePassword(input.password);

      let authUser: Awaited<ReturnType<SupabaseManagedUsersGateway['createManagedUser']>>;

      try {
        authUser = await managedUsersGateway.createManagedUser({
          email,
          password,
        });
      } catch (error: unknown) {
        throw mapGatewayError(error);
      }

      try {
        const user = await managedUsersRepository.createActiveMembership(context, companyId, {
          userId: authUser.userId,
          role: targetRole,
        });

        if (user === undefined) {
          throw new ApiHttpError(
            'MANAGED_USER_MEMBERSHIP_CONFLICT',
            409,
            'The managed user could not be attached to this company.',
          );
        }

        return user;
      } catch (error: unknown) {
        try {
          await managedUsersGateway.deleteManagedUser(authUser.userId);
        } catch (cleanupError: unknown) {
          throw new AggregateError(
            [error, cleanupError],
            'Managed-user provisioning failed and its authentication rollback also failed.',
            { cause: cleanupError },
          );
        }

        throw error;
      }
    },

    async updateManagedUser(
      identity,
      requestId,
      companyIdValue,
      userIdValue,
      input,
    ): Promise<ManagedUserUpdateResult> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const userId = normalizeUuid(userIdValue, 'User ID');
      assertCompanyRequestContext(identity, companyId);

      if (userId === identity.actor.userId) {
        throw new ApiHttpError(
          'SELF_MANAGED_USER_UPDATE_FORBIDDEN',
          409,
          'Use your own Account settings to change your profile or password.',
        );
      }

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(tenantRepository, context, companyId);
      if (!isPlatformSuperAdmin(identity.subject)) {
        assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
          'company_admin',
          'manager',
        ]);
      }

      const user = await tenantRepository.getCompanyUser(context, companyId, userId);
      if (user === undefined) {
        throw new ApiHttpError(
          'MANAGED_USER_NOT_FOUND',
          404,
          'The requested managed user was not found.',
        );
      }
      assertTargetRelationship(identity, user);

      if (user.membershipStatus === 'revoked') {
        throw new ApiHttpError(
          'MANAGED_USER_DELETED',
          409,
          'Deleted managed users are terminal and cannot be edited or restored.',
        );
      }

      const email = input.email === undefined ? undefined : normalizeEmail(input.email);
      const displayName =
        input.displayName === undefined ? undefined : normalizeDisplayName(input.displayName);
      const password = input.password === undefined ? undefined : normalizePassword(input.password);

      if (email === undefined && displayName === undefined && password === undefined) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one managed-user field must be provided.',
        );
      }

      const emailUpdated =
        email !== undefined && email !== (user.email ?? '').trim().toLowerCase();
      const displayNameUpdated =
        displayName !== undefined && displayName !== user.displayName;
      const passwordUpdated = password !== undefined;

      if (!emailUpdated && !displayNameUpdated && !passwordUpdated) {
        return Object.freeze({
          user,
          passwordUpdated: false,
        });
      }

      if (displayNameUpdated) {
        const updated = await managedUsersRepository.updateManagedUserDisplayName(
          context,
          user,
          displayName ?? null,
        );
        if (!updated) {
          throw new ApiHttpError(
            'MANAGED_USER_NOT_FOUND',
            404,
            'The requested managed user was not found.',
          );
        }
      }

      const authenticationUpdate:
        | Readonly<{
            email?: string;
            password?: string;
          }>
        | undefined =
        emailUpdated
          ? passwordUpdated
            ? { email, password }
            : { email }
          : passwordUpdated
            ? { password }
            : undefined;

      try {
        if (authenticationUpdate !== undefined) {
          await managedUsersGateway.updateManagedUser(userId, authenticationUpdate);
        }
      } catch (error: unknown) {
        if (displayNameUpdated) {
          try {
            await managedUsersRepository.updateManagedUserDisplayName(
              context,
              user,
              user.displayName,
            );
          } catch (rollbackError: unknown) {
            throw new AggregateError(
              [error, rollbackError],
              'Managed-user authentication update failed and the profile rollback also failed.',
              { cause: rollbackError },
            );
          }
        }

        throw mapGatewayError(error);
      }

      await managedUsersRepository.recordManagedUserUpdate(context, user, {
        emailUpdated,
        displayNameUpdated,
        passwordUpdated,
      });

      const updatedUser = await tenantRepository.getCompanyUser(context, companyId, userId);
      if (updatedUser === undefined) {
        throw new ApiHttpError(
          'MANAGED_USER_NOT_FOUND',
          404,
          'The updated managed user could not be reloaded.',
        );
      }

      return Object.freeze({
        user: updatedUser,
        passwordUpdated,
      });
    },

    async resetManagedUserPassword(
      identity,
      requestId,
      companyIdValue,
      userIdValue,
      input,
    ): Promise<ManagedUserPasswordResetResult> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const userId = normalizeUuid(userIdValue, 'User ID');
      assertCompanyRequestContext(identity, companyId);

      if (userId === identity.actor.userId) {
        throw new ApiHttpError(
          'SELF_PASSWORD_RESET_FORBIDDEN',
          409,
          'Use of this endpoint to reset your own password is forbidden.',
        );
      }

      const context = createRepositoryContext(identity, requestId, companyId);
      await requireActiveCompany(tenantRepository, context, companyId);

      if (!isPlatformSuperAdmin(identity.subject)) {
        assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
          'company_admin',
          'manager',
        ]);
      }

      const user = await tenantRepository.getCompanyUser(context, companyId, userId);

      if (user === undefined) {
        throw new ApiHttpError(
          'MANAGED_USER_NOT_FOUND',
          404,
          'The requested managed user was not found.',
        );
      }

      assertTargetRelationship(identity, user);
      const password = normalizePassword(input.password);

      try {
        await managedUsersGateway.updateManagedUserPassword(userId, password);
      } catch (error: unknown) {
        throw mapGatewayError(error);
      }

      await managedUsersRepository.recordPasswordReset(context, user);

      return Object.freeze({
        userId,
        passwordUpdated: true,
      });
    },
  });
}

export type {
  CreateManagedUserInput,
  ManagedUserPasswordResetResult,
  ManagedUserUpdateResult,
  ResetManagedUserPasswordInput,
  UpdateManagedUserInput,
} from './managed-users.types.js';
