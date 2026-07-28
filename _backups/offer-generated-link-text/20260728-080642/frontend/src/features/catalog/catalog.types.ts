export type CatalogOfferStatus = "draft" | "active" | "paused" | "archived";
export type CatalogNetworkStatus = "active" | "suspended" | "archived";
export type CatalogDomainStatus =
  "pending_verification" | "active" | "suspended" | "archived";
export type CatalogDevice = "desktop" | "android" | "ios";
export type CatalogRedirectType = "301" | "302";
export type CatalogReferrerMode = "preserve" | "strip";
export type CatalogPayoutType = "fixed_member" | "per_offer";

export type CatalogProvider = {
  id: string;
  code: string;
  name: string;
  status: "active" | "archived";
};

export type CatalogDomain = {
  id: string;
  hostname: string;
  status: CatalogDomainStatus;
  isPrimary: boolean;
  verifiedAt: string | null;
  offerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogNetwork = {
  id: string;
  companyId: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  name: string;
  externalAccountId: string | null;
  status: CatalogNetworkStatus;
  trackingParameter: string | null;
  postbackUrl: string | null;
  duplicateAllowed: boolean;
  offerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogOffer = {
  id: string;
  publicId: number;
  companyId: string;
  networkAccountId: string;
  networkAccountName: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  trackingDomainId: string | null;
  trackingDomainHostname: string | null;
  code: string;
  externalOfferId: string | null;
  name: string;
  description: string | null;
  destinationUrl: string;
  status: CatalogOfferStatus;
  countries: readonly string[];
  devices: readonly CatalogDevice[];
  desktopUrl: string | null;
  androidUrl: string | null;
  iosUrl: string | null;
  redirectType: CatalogRedirectType;
  referrerMode: CatalogReferrerMode;
  defaultPayoutAmountMinor: number | null;
  payoutCurrency: string | null;
  timezone: string;
  activeDays: readonly number[];
  activeStartTime: string | null;
  activeEndTime: string | null;
  proxyEnabled: boolean;
  expiresAt: string | null;
  duplicateAllowed: boolean;
  managerMembershipIds: readonly string[];
  publisherMembershipIds: readonly string[];
  clicks: number;
  conversions: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogManager = {
  membershipId: string;
  publicId: number;
  companyId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  userStatus: "active" | "suspended";
  membershipStatus: "invited" | "active" | "suspended" | "revoked";
  offerCount: number;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogPublisher = {
  membershipId: string;
  publicId: number;
  companyId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  userStatus: "active" | "suspended";
  membershipStatus: "invited" | "active" | "suspended" | "revoked";
  invitedBy: string | null;
  timezone: string;
  payoutType: CatalogPayoutType;
  fixedPayoutAmountMinor: number | null;
  payoutCurrency: string | null;
  postbackUrl: string | null;
  emailNotificationsEnabled: boolean;
  offerCount: number;
  assignedOfferIds: readonly string[];
  managerMembershipIds: readonly string[];
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoreCatalogSnapshot = {
  companyId: string;
  summary: {
    domains: number;
    networks: number;
    offers: number;
    managers: number;
    publishers: number;
  };
  providers: readonly CatalogProvider[];
  domains: readonly CatalogDomain[];
  networks: readonly CatalogNetwork[];
  offers: readonly CatalogOffer[];
  managers: readonly CatalogManager[];
  publishers: readonly CatalogPublisher[];
};

export type CatalogOfferConfigurationInput = {
  trackingDomainId: string;
  countries: readonly string[];
  devices: readonly CatalogDevice[];
  desktopUrl: string | null;
  androidUrl: string | null;
  iosUrl: string | null;
  redirectType: CatalogRedirectType;
  referrerMode: CatalogReferrerMode;
  defaultPayoutAmountMinor: number | null;
  payoutCurrency: string | null;
  timezone: string;
  activeDays: readonly number[];
  activeStartTime: string | null;
  activeEndTime: string | null;
  proxyEnabled: boolean;
  expiresAt: string | null;
  duplicateAllowed: boolean;
  managerMembershipIds: readonly string[];
};

export type CreateCatalogOfferInput = CatalogOfferConfigurationInput & {
  networkAccountId: string;
  code: string;
  externalOfferId: string | null;
  name: string;
  description: string | null;
  status: Extract<CatalogOfferStatus, "draft" | "active">;
};

export type UpdateCatalogOfferInput = CatalogOfferConfigurationInput & {
  offerId: string;
  externalOfferId: string | null;
  name: string;
  description: string | null;
  status: CatalogOfferStatus;
};

export type CreateCatalogNetworkInput = {
  providerId: string;
  name: string;
  externalAccountId: string | null;
  trackingParameter: string | null;
  postbackUrl: string | null;
  duplicateAllowed: boolean;
};

export type UpdateCatalogNetworkInput = {
  accountId: string;
  name: string;
  externalAccountId: string | null;
  status: CatalogNetworkStatus;
  trackingParameter: string | null;
  postbackUrl: string | null;
  duplicateAllowed: boolean;
};

export type UpdateCatalogPublisherInput = {
  membershipId: string;
  timezone: string;
  payoutType: CatalogPayoutType;
  fixedPayoutAmountMinor: number | null;
  payoutCurrency: string | null;
  postbackUrl: string | null;
  emailNotificationsEnabled: boolean;
  assignedOfferIds: readonly string[];
};
