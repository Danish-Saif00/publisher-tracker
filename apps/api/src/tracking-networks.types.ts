import type { CompanyStatus } from './company-management.types.js';

export type TrackingDomainStatus = 'pending_verification' | 'active' | 'suspended' | 'archived';

export type NetworkProviderStatus = 'active' | 'archived';

export type ProviderPostbackConversionStatus = 'pending' | 'approved';

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

export interface NetworkProviderIntegrationRecord {
  readonly defaultTrackingParameter: string | null;
  readonly postbackClickIdToken: string | null;
  readonly postbackConversionIdToken: string | null;
  readonly postbackRevenueAmountToken: string | null;
  readonly postbackRevenueCurrencyToken: string | null;
  readonly postbackConversionStatus: ProviderPostbackConversionStatus;
  readonly configured: boolean;
}

export interface NetworkProviderRecord {
  readonly id: string;
  readonly companyId: string;
  readonly code: string;
  readonly name: string;
  readonly status: NetworkProviderStatus;
  readonly websiteUrl: string | null;
  readonly documentationUrl: string | null;
  readonly integration: NetworkProviderIntegrationRecord;
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
  readonly status?: 'active' | 'suspended' | 'archived';
  readonly isPrimary?: boolean;
}

export interface UpdatePlatformTrackingDomainStatusInput {
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface NetworkProviderIntegrationInput {
  readonly defaultTrackingParameter: string | null;
  readonly postbackClickIdToken: string | null;
  readonly postbackConversionIdToken: string | null;
  readonly postbackRevenueAmountToken: string | null;
  readonly postbackRevenueCurrencyToken: string | null;
  readonly postbackConversionStatus: ProviderPostbackConversionStatus;
}

export interface CreateNetworkProviderInput {
  readonly code: string;
  readonly name: string;
  readonly websiteUrl?: string | null;
  readonly documentationUrl?: string | null;
  readonly integration?: NetworkProviderIntegrationInput;
}

export interface UpdateNetworkProviderInput {
  readonly name?: string;
  readonly status?: NetworkProviderStatus;
  readonly websiteUrl?: string | null;
  readonly documentationUrl?: string | null;
  readonly integration?: NetworkProviderIntegrationInput;
}

export interface CreateNetworkAccountInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId?: string | null;
}

export interface UpdateNetworkAccountInput {
  readonly providerId?: string;
  readonly name?: string;
  readonly externalAccountId?: string | null;
  readonly status?: NetworkAccountStatus;
}

export interface NetworkAccountDependencySummary {
  readonly offers: number;
  readonly postbackEndpoints: number;
  readonly trackingClicks: number;
  readonly conversions: number;
  readonly duplicateProtectionRules: number;
}

export interface ListPlatformTrackingDomainsInput {
  readonly companyId?: string;
  readonly status?: TrackingDomainStatus;
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
  readonly integration: NetworkProviderIntegrationInput;
}

export interface NetworkAccountWriteInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: NetworkAccountStatus;
}
