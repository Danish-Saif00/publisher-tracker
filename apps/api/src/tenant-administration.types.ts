import type {
  CompanyMembershipStatus,
  CompanyRole,
  PlatformRole,
} from '@affiliate-tracker/contracts';

import type {
  CompanyRecord,
  CompanyRepositoryContext,
  CompanyStatus,
} from './company-management.types.js';

export type UserStatus = 'active' | 'suspended';

export interface CompanyDirectoryUserRecord {
  readonly membershipId: string;
  readonly companyId: string;
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarPath: string | null;
  readonly userStatus: UserStatus;
  readonly role: CompanyRole;
  readonly membershipStatus: CompanyMembershipStatus;
  readonly joinedAt: string | null;
  readonly membershipCreatedAt: string;
  readonly membershipUpdatedAt: string;
  readonly profileUpdatedAt: string;
}

export interface UserProfileRecord {
  readonly userId: string;
  readonly displayName: string | null;
  readonly avatarPath: string | null;
  readonly platformRole: PlatformRole | null;
  readonly status: UserStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly companyId: string | null;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
  readonly eventName: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface PaginationCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface RepositoryPage<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor?: PaginationCursor;
}

export interface ApiPage<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor: string | null;
}

export interface UpdateCompanyStatusInput {
  readonly status: CompanyStatus;
}

export interface UpdateUserStatusInput {
  readonly status: UserStatus;
}

export interface ListCompanyUsersInput {
  readonly limit?: number;
  readonly cursor?: string;
  readonly role?: CompanyRole;
  readonly membershipStatus?: CompanyMembershipStatus;
  readonly userStatus?: UserStatus;
  readonly search?: string;
}

export interface ListAuditEventsInput {
  readonly limit?: number;
  readonly cursor?: string;
  readonly eventName?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly actorUserId?: string;
}

export interface ListCompanyUsersRepositoryQuery {
  readonly limit: number;
  readonly cursor?: PaginationCursor;
  readonly role?: CompanyRole;
  readonly membershipStatus?: CompanyMembershipStatus;
  readonly userStatus?: UserStatus;
  readonly search?: string;
}

export interface ListAuditEventsRepositoryQuery {
  readonly limit: number;
  readonly cursor?: PaginationCursor;
  readonly eventName?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly actorUserId?: string;
}

export interface CompanyStatusUpdateResult {
  readonly previousStatus: CompanyStatus;
  readonly company: CompanyRecord;
}

export interface UserStatusUpdateResult {
  readonly previousStatus: UserStatus;
  readonly profile: UserProfileRecord;
}

export type { CompanyRecord, CompanyRepositoryContext, CompanyStatus };
