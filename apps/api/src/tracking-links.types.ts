import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';

import type { CompanyStatus } from './company-management.types.js';
import type { OfferStatus } from './offers-payout.types.js';
import type { TrackingDomainStatus } from './tracking-networks.types.js';

export type TrackingLinkStatus = 'draft' | 'active' | 'paused' | 'archived';

export type TrackingLinkOwnerRole = Extract<CompanyRole, 'manager' | 'publisher'>;

export type TrackingLinkQueryParameters = Readonly<Record<string, string>>;

export interface TrackingLinkCompanyRecord {
  readonly id: string;
  readonly status: CompanyStatus;
}

export interface TrackingLinkOfferRecord {
  readonly id: string;
  readonly companyId: string;
  readonly code: string;
  readonly name: string;
  readonly destinationUrl: string;
  readonly status: OfferStatus;
}

export interface TrackingLinkDomainRecord {
  readonly id: string;
  readonly companyId: string;
  readonly hostname: string;
  readonly status: TrackingDomainStatus;
}

export interface TrackingLinkOwnerRecord {
  readonly membershipId: string;
  readonly companyId: string;
  readonly userId: string;
  readonly role: TrackingLinkOwnerRole;
  readonly status: CompanyMembershipStatus;
}

export interface TrackingLinkAssignmentRecord {
  readonly id: string;
  readonly companyId: string;
  readonly offerId: string;
  readonly membershipId: string;
  readonly status: 'active' | 'paused' | 'revoked';
}

export interface TrackingLinkRecord {
  readonly id: string;
  readonly companyId: string;
  readonly offerId: string;
  readonly offerCode: string;
  readonly offerName: string;
  readonly trackingDomainId: string;
  readonly hostname: string;
  readonly ownerMembershipId: string;
  readonly ownerUserId: string;
  readonly ownerRole: TrackingLinkOwnerRole;
  readonly ownerMembershipStatus: CompanyMembershipStatus;
  readonly trackingCode: string;
  readonly customSlug: string | null;
  readonly destinationUrl: string;
  readonly queryParameters: TrackingLinkQueryParameters;
  readonly status: TrackingLinkStatus;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateTrackingLinkInput {
  readonly offerId: string;
  readonly trackingDomainId: string;
  readonly ownerMembershipId?: string;
  readonly customSlug?: string;
  readonly destinationUrl?: string;
  readonly queryParameters?: Readonly<Record<string, string>>;
  readonly status?: Extract<TrackingLinkStatus, 'draft' | 'active'>;
}

export interface UpdateTrackingLinkInput {
  readonly trackingDomainId?: string;
  readonly customSlug?: string | null;
  readonly destinationUrl?: string;
  readonly queryParameters?: Readonly<Record<string, string>>;
  readonly status?: TrackingLinkStatus;
}

export interface ListTrackingLinksInput {
  readonly offerId?: string;
  readonly ownerMembershipId?: string;
  readonly status?: TrackingLinkStatus;
}

export interface TrackingLinksRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface TrackingLinkWriteInput {
  readonly offerId: string;
  readonly trackingDomainId: string;
  readonly ownerMembershipId: string;
  readonly trackingCode: string;
  readonly customSlug: string | null;
  readonly destinationUrl: string;
  readonly queryParameters: TrackingLinkQueryParameters;
  readonly status: TrackingLinkStatus;
}
