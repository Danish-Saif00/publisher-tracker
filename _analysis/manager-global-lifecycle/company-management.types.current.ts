import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';

export type CompanyStatus = 'active' | 'suspended' | 'archived';

export interface CompanyRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: CompanyStatus;
  readonly timezone: string;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompanyMembershipRecord {
  readonly id: string;
  readonly companyId: string;
  readonly userId: string;
  readonly role: CompanyRole;
  readonly status: CompanyMembershipStatus;
  readonly invitedBy: string | null;
  readonly joinedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCompanyInput {
  readonly slug: string;
  readonly name: string;
  readonly timezone?: string;
}

export interface InviteCompanyMembershipInput {
  readonly userId: string;
  readonly role: CompanyRole;
}

export interface UpdateCompanyMembershipInput {
  readonly role?: CompanyRole;
  readonly status?: CompanyMembershipStatus;
}

export interface CompanyRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}
