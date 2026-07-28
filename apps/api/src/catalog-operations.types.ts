import type { CompanyMembershipStatus } from '@affiliate-tracker/contracts';

import type { CompanyStatus } from './company-management.types.js';

export type CatalogOfferStatus = 'draft' | 'active' | 'paused' | 'archived';
export type CatalogNetworkStatus = 'active' | 'suspended' | 'archived';
export type CatalogDomainStatus = 'pending_verification' | 'active' | 'suspended' | 'archived';
export type CatalogDevice = 'desktop' | 'android' | 'ios';
export type CatalogRedirectType = '301' | '302';
export type CatalogReferrerMode = 'preserve' | 'strip';
export type CatalogPayoutType = 'fixed_member' | 'per_offer';

export interface CatalogCompanyRecord {
  readonly id: string;
  readonly status: CompanyStatus;
}

export interface CatalogProviderRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
}

export interface CatalogDomainRecord {
  readonly id: string;
  readonly hostname: string;
  readonly status: CatalogDomainStatus;
  readonly isPrimary: boolean;
  readonly verifiedAt: string | null;
  readonly offerCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CatalogNetworkRecord {
  readonly id: string;
  readonly companyId: string;
  readonly providerId: string;
  readonly providerCode: string;
  readonly providerName: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: CatalogNetworkStatus;
  readonly trackingParameter: string | null;
  readonly postbackUrl: string | null;
  readonly duplicateAllowed: boolean;
  readonly offerCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CatalogPublisherOfferRecord {
  readonly id: string;
  readonly publicId: number;
  readonly publisherPublicId: number;
  readonly name: string;
  readonly description: string | null;
  readonly countries: readonly string[];
  readonly devices: readonly CatalogDevice[];
  readonly trackingDomainId: string | null;
  readonly trackingDomainHostname: string | null;
  readonly trackingLink: string | null;
  readonly promotionalText: string | null;
  readonly payoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly timezone: string;
  readonly activeDays: readonly number[];
  readonly activeStartTime: string | null;
  readonly activeEndTime: string | null;
  readonly expiresAt: string | null;
  readonly updatedAt: string;
}

export interface CatalogOfferRecord {
  readonly id: string;
  readonly publicId: number;
  readonly companyId: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly providerId: string;
  readonly providerCode: string;
  readonly providerName: string;
  readonly trackingDomainId: string | null;
  readonly trackingDomainHostname: string | null;
  readonly code: string;
  readonly externalOfferId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly promotionalTextTemplate: string;
  readonly trackingLinkTemplate: string | null;
  readonly destinationUrl: string;
  readonly status: CatalogOfferStatus;
  readonly countries: readonly string[];
  readonly devices: readonly CatalogDevice[];
  readonly desktopUrl: string | null;
  readonly androidUrl: string | null;
  readonly iosUrl: string | null;
  readonly redirectType: CatalogRedirectType;
  readonly referrerMode: CatalogReferrerMode;
  readonly defaultPayoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly timezone: string;
  readonly activeDays: readonly number[];
  readonly activeStartTime: string | null;
  readonly activeEndTime: string | null;
  readonly proxyEnabled: boolean;
  readonly expiresAt: string | null;
  readonly duplicateAllowed: boolean;
  readonly managerMembershipIds: readonly string[];
  readonly publisherMembershipIds: readonly string[];
  readonly clicks: number;
  readonly conversions: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CatalogManagerRecord {
  readonly membershipId: string;
  readonly publicId: number;
  readonly companyId: string;
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly userStatus: 'active' | 'suspended';
  readonly membershipStatus: CompanyMembershipStatus;
  readonly offerCount: number;
  readonly joinedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CatalogPublisherRecord {
  readonly membershipId: string;
  readonly publicId: number;
  readonly companyId: string;
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly userStatus: 'active' | 'suspended';
  readonly membershipStatus: CompanyMembershipStatus;
  readonly invitedBy: string | null;
  readonly timezone: string;
  readonly payoutType: CatalogPayoutType;
  readonly fixedPayoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly postbackUrl: string | null;
  readonly emailNotificationsEnabled: boolean;
  readonly offerCount: number;
  readonly assignedOfferIds: readonly string[];
  readonly managerMembershipIds: readonly string[];
  readonly joinedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CoreCatalogSummary {
  readonly domains: number;
  readonly networks: number;
  readonly offers: number;
  readonly managers: number;
  readonly publishers: number;
}

export interface CoreCatalogSnapshot {
  readonly companyId: string;
  readonly summary: CoreCatalogSummary;
  readonly providers: readonly CatalogProviderRecord[];
  readonly domains: readonly CatalogDomainRecord[];
  readonly networks: readonly CatalogNetworkRecord[];
  readonly offers: readonly CatalogOfferRecord[];
  readonly managers: readonly CatalogManagerRecord[];
  readonly publishers: readonly CatalogPublisherRecord[];
}

export interface CatalogOfferConfigurationInput {
  readonly trackingDomainId: string;
  readonly promotionalTextTemplate: string;
  readonly countries: readonly string[];
  readonly devices: readonly CatalogDevice[];
  readonly desktopUrl?: string | null | undefined;
  readonly androidUrl?: string | null | undefined;
  readonly iosUrl?: string | null | undefined;
  readonly redirectType: CatalogRedirectType;
  readonly referrerMode: CatalogReferrerMode;
  readonly defaultPayoutAmountMinor?: number | null | undefined;
  readonly payoutCurrency?: string | null | undefined;
  readonly timezone: string;
  readonly activeDays: readonly number[];
  readonly activeStartTime?: string | null | undefined;
  readonly activeEndTime?: string | null | undefined;
  readonly proxyEnabled: boolean;
  readonly expiresAt?: string | null | undefined;
  readonly duplicateAllowed: boolean;
  readonly managerMembershipIds: readonly string[];
}

export interface CreateCatalogOfferInput extends CatalogOfferConfigurationInput {
  readonly networkAccountId: string;
  readonly code: string;
  readonly externalOfferId?: string | null | undefined;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly status?: Extract<CatalogOfferStatus, 'draft' | 'active'>;
}

export interface UpdateCatalogOfferInput extends CatalogOfferConfigurationInput {
  readonly externalOfferId?: string | null | undefined;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly status: CatalogOfferStatus;
}

export interface CreateCatalogNetworkInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId?: string | null | undefined;
  readonly trackingParameter?: string | null | undefined;
  readonly postbackUrl?: string | null | undefined;
  readonly duplicateAllowed: boolean;
}

export interface UpdateCatalogNetworkInput {
  readonly name: string;
  readonly externalAccountId?: string | null | undefined;
  readonly status: CatalogNetworkStatus;
  readonly trackingParameter?: string | null | undefined;
  readonly postbackUrl?: string | null | undefined;
  readonly duplicateAllowed: boolean;
}

export interface UpdateCatalogPublisherInput {
  readonly timezone: string;
  readonly payoutType: CatalogPayoutType;
  readonly fixedPayoutAmountMinor?: number | null | undefined;
  readonly payoutCurrency?: string | null | undefined;
  readonly postbackUrl?: string | null | undefined;
  readonly emailNotificationsEnabled: boolean;
  readonly assignedOfferIds: readonly string[];
}

export interface CatalogRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId: string;
}

export interface NormalizedCatalogOfferWriteInput {
  readonly networkAccountId: string;
  readonly trackingDomainId: string;
  readonly code: string;
  readonly externalOfferId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly promotionalTextTemplate: string;
  readonly destinationUrl: string;
  readonly status: CatalogOfferStatus;
  readonly countries: readonly string[];
  readonly devices: readonly CatalogDevice[];
  readonly desktopUrl: string | null;
  readonly androidUrl: string | null;
  readonly iosUrl: string | null;
  readonly redirectType: CatalogRedirectType;
  readonly referrerMode: CatalogReferrerMode;
  readonly defaultPayoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly timezone: string;
  readonly activeDays: readonly number[];
  readonly activeStartTime: string | null;
  readonly activeEndTime: string | null;
  readonly proxyEnabled: boolean;
  readonly expiresAt: string | null;
  readonly duplicateAllowed: boolean;
  readonly managerMembershipIds: readonly string[];
}

export interface NormalizedCatalogNetworkWriteInput {
  readonly providerId: string;
  readonly name: string;
  readonly externalAccountId: string | null;
  readonly status: CatalogNetworkStatus;
  readonly trackingParameter: string | null;
  readonly postbackUrl: string | null;
  readonly duplicateAllowed: boolean;
}

export interface NormalizedCatalogPublisherWriteInput {
  readonly managerMembershipId: string;
  readonly timezone: string;
  readonly payoutType: CatalogPayoutType;
  readonly fixedPayoutAmountMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly postbackUrl: string | null;
  readonly emailNotificationsEnabled: boolean;
  readonly assignedOfferIds: readonly string[];
}
