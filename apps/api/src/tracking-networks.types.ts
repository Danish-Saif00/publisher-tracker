import type { CompanyStatus } from './company-management.types.js';

export type TrackingDomainStatus = 'pending_verification' | 'active' | 'suspended' | 'archived';

export type NetworkProviderStatus = 'active' | 'archived';

export type NetworkAccountStatus = 'active' | 'suspended' | 'archived';

export interface TrackingDomainRecord {
  readonly id: string;
  readonly companyId: string;
  readonly hostname: string;
  readonly status: TrackingDomainStatus;
  readonly verificationToken: string;
  readonly verifiedAt: string | null;
  readonly isPrimary: boolean;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NetworkProviderRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: NetworkProviderStatus;
  readonly websiteUrl: string | null;
  readonly documentationUrl: string | null;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NetworkAccountRecord {
  readonly id: string;
  readonly companyId: string;
  readonly providerId: string;
  readonly providerCode: string;
  readonly providerName: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: NetworkAccountStatus;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrackingNetworkCompanyRecord {
  readonly id: string;
  readonly status: CompanyStatus;
}

export interface CreateTrackingDomainInput {
  readonly hostname: string;
}

export interface UpdateTrackingDomainInput {
  readonly hostname?: string;
  readonly status?: 'suspended' | 'archived';
  readonly isPrimary?: boolean;
}

export interface UpdatePlatformTrackingDomainStatusInput {
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface CreateNetworkProviderInput {
  readonly code: string;
  readonly name: string;
  readonly websiteUrl?: string | null;
  readonly documentationUrl?: string | null;
}

export interface UpdateNetworkProviderInput {
  readonly name?: string;
  readonly status?: NetworkProviderStatus;
  readonly websiteUrl?: string | null;
  readonly documentationUrl?: string | null;
}

export interface CreateNetworkAccountInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId?: string | null;
}

export interface UpdateNetworkAccountInput {
  readonly name?: string;
  readonly externalAccountId?: string | null;
  readonly status?: NetworkAccountStatus;
}

export interface UpdatePlatformNetworkAccountStatusInput {
  readonly status: NetworkAccountStatus;
}

export interface ListPlatformTrackingDomainsInput {
  readonly companyId?: string;
  readonly status?: TrackingDomainStatus;
}

export interface ListPlatformNetworkAccountsInput {
  readonly companyId?: string;
  readonly providerId?: string;
  readonly status?: NetworkAccountStatus;
}

export interface TrackingNetworkRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface TrackingDomainWriteInput {
  readonly hostname: string;
  readonly status: TrackingDomainStatus;
  readonly verificationToken: string;
  readonly verifiedAt: string | null;
  readonly isPrimary: boolean;
}

export interface NetworkProviderWriteInput {
  readonly code: string;
  readonly name: string;
  readonly status: NetworkProviderStatus;
  readonly websiteUrl: string | null;
  readonly documentationUrl: string | null;
}

export interface NetworkAccountWriteInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: NetworkAccountStatus;
}
