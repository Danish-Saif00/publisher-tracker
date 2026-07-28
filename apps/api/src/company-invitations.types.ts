import type { CompanyRole } from '@affiliate-tracker/contracts';

import type { CompanyMembershipRecord, CompanyRecord } from './company-management.types.js';

export type CompanyInvitationStatus = 'pending' | 'accepted' | 'revoked';
export type CompanyInvitationDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface CompanyInvitationRecord {
  readonly id: string;
  readonly companyId: string;
  readonly email: string;
  readonly role: CompanyRole;
  readonly status: CompanyInvitationStatus;
  readonly deliveryStatus: CompanyInvitationDeliveryStatus;
  readonly userId: string | null;
  readonly requiresPasswordSetup: boolean;
  readonly invitedBy: string | null;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
  readonly lastSentAt: string | null;
  readonly sendCount: number;
  readonly lastDeliveryErrorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompanyInvitationPreview {
  readonly invitationId: string;
  readonly company: CompanyRecord;
  readonly email: string;
  readonly role: CompanyRole;
  readonly expiresAt: string;
  readonly requiresPasswordSetup: boolean;
}

export interface CompanyInvitationAcceptance {
  readonly invitation: CompanyInvitationRecord;
  readonly membership: CompanyMembershipRecord;
  readonly company: CompanyRecord;
}

export interface InvitationAuthUserRecord {
  readonly userId: string;
  readonly email: string;
}

export interface InvitationRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface CreateCompanyInvitationInput {
  readonly email: string;
  readonly role: CompanyRole;
}

export interface CompanyInvitationWriteInput {
  readonly email: string;
  readonly role: CompanyRole;
  readonly tokenHash: string;
  readonly userId: string | null;
  readonly requiresPasswordSetup: boolean;
  readonly expiresAt: string;
}

export interface InvitationDeliveryUpdateInput {
  readonly deliveryStatus: CompanyInvitationDeliveryStatus;
  readonly userId: string | null;
  readonly errorCode: string | null;
}

export interface InvitationRotationInput {
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly role: CompanyRole;
  readonly userId: string | null;
  readonly requiresPasswordSetup: boolean;
}
