import type { CompanyRole } from '@affiliate-tracker/contracts';

import type { CompanyDirectoryUserRecord } from './tenant-administration.types.js';

export interface CreateManagedUserInput {
  readonly email: string;
  readonly password: string;
}

export interface ResetManagedUserPasswordInput {
  readonly password: string;
}

export interface ManagedUserPasswordResetResult {
  readonly userId: string;
  readonly passwordUpdated: true;
}

export interface ManagedUserRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId: string;
}

export interface CreateActiveManagedMembershipInput {
  readonly userId: string;
  readonly role: CompanyRole;
}

export interface ManagedUserCreationResult {
  readonly user: CompanyDirectoryUserRecord;
}

export type { CompanyDirectoryUserRecord };
