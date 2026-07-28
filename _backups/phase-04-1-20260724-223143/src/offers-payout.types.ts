import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';

import type { CompanyStatus } from './company-management.types.js';

export type OfferStatus = 'draft' | 'active' | 'paused' | 'archived';

export type PayoutMode = 'fixed_member' | 'per_offer';

export type OfferAssignmentStatus = 'active' | 'paused' | 'revoked';

export interface OfferCompanyRecord {
  readonly id: string;
  readonly status: CompanyStatus;
}

export interface OfferNetworkAccountRecord {
  readonly id: string;
  readonly companyId: string;
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface PayoutMemberRecord {
  readonly membershipId: string;
  readonly companyId: string;
  readonly userId: string;
  readonly role: Extract<CompanyRole, 'manager' | 'publisher'>;
  readonly status: CompanyMembershipStatus;
}

export interface OfferRecord {
  readonly id: string;
  readonly companyId: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly providerId: string;
  readonly providerCode: string;
  readonly providerName: string;
  readonly code: string;
  readonly externalOfferId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly destinationUrl: string;
  readonly status: OfferStatus;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PayoutProfileRecord {
  readonly id: string;
  readonly companyId: string;
  readonly membershipId: string;
  readonly userId: string;
  readonly role: Extract<CompanyRole, 'manager' | 'publisher'>;
  readonly membershipStatus: CompanyMembershipStatus;
  readonly mode: PayoutMode;
  readonly fixedPayoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OfferAssignmentRecord {
  readonly id: string;
  readonly companyId: string;
  readonly offerId: string;
  readonly offerCode: string;
  readonly offerName: string;
  readonly membershipId: string;
  readonly userId: string;
  readonly role: Extract<CompanyRole, 'manager' | 'publisher'>;
  readonly membershipStatus: CompanyMembershipStatus;
  readonly status: OfferAssignmentStatus;
  readonly manualPayoutAmountMinor: number | null;
  readonly manualPayoutCurrency: string | null;
  readonly payoutMode: PayoutMode;
  readonly resolvedPayoutAmountMinor: number;
  readonly resolvedPayoutCurrency: string;
  readonly assignedBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateOfferInput {
  readonly networkAccountId: string;
  readonly code: string;
  readonly externalOfferId?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly destinationUrl: string;
}

export interface UpdateOfferInput {
  readonly externalOfferId?: string | null;
  readonly name?: string;
  readonly description?: string | null;
  readonly destinationUrl?: string;
  readonly status?: OfferStatus;
}

export interface ListOffersInput {
  readonly networkAccountId?: string;
  readonly status?: OfferStatus;
}

export interface UpsertPayoutProfileInput {
  readonly mode: PayoutMode;
  readonly fixedPayoutAmountMinor?: number | null;
  readonly payoutCurrency?: string | null;
}

export interface CreateOfferAssignmentInput {
  readonly membershipId: string;
  readonly manualPayoutAmountMinor?: number | null;
  readonly manualPayoutCurrency?: string | null;
}

export interface UpdateOfferAssignmentInput {
  readonly status?: OfferAssignmentStatus;
  readonly manualPayoutAmountMinor?: number | null;
  readonly manualPayoutCurrency?: string | null;
}

export interface OffersPayoutRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface OfferWriteInput {
  readonly networkAccountId: string;
  readonly code: string;
  readonly externalOfferId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly destinationUrl: string;
  readonly status: OfferStatus;
}

export interface PayoutProfileWriteInput {
  readonly mode: PayoutMode;
  readonly fixedPayoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
}

export interface OfferAssignmentWriteInput {
  readonly status: OfferAssignmentStatus;
  readonly manualPayoutAmountMinor: number | null;
  readonly manualPayoutCurrency: string | null;
}
