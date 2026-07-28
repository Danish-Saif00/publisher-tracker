import type { CompanyRole } from '../auth/auth.types';

export type ModuleLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

export type OfferStatus = 'draft' | 'active' | 'paused' | 'archived';
export type PayoutMode = 'fixed_member' | 'per_offer';
export type OfferAssignmentStatus = 'active' | 'paused' | 'revoked';

export type Offer = {
  id: string;
  companyId: string;
  networkAccountId: string;
  networkAccountName: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  code: string;
  externalOfferId: string | null;
  name: string;
  description: string | null;
  destinationUrl: string;
  status: OfferStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutProfile = {
  id: string;
  companyId: string;
  membershipId: string;
  userId: string;
  role: Extract<CompanyRole, 'manager' | 'publisher'>;
  membershipStatus: 'invited' | 'active' | 'suspended' | 'revoked';
  mode: PayoutMode;
  fixedPayoutAmountMinor: number | null;
  payoutCurrency: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OfferAssignment = {
  id: string;
  companyId: string;
  offerId: string;
  offerCode: string;
  offerName: string;
  membershipId: string;
  userId: string;
  role: Extract<CompanyRole, 'manager' | 'publisher'>;
  membershipStatus: 'invited' | 'active' | 'suspended' | 'revoked';
  status: OfferAssignmentStatus;
  manualPayoutAmountMinor: number | null;
  manualPayoutCurrency: string | null;
  payoutMode: PayoutMode;
  resolvedPayoutAmountMinor: number;
  resolvedPayoutCurrency: string;
  assignedBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOfferInput = {
  networkAccountId: string;
  code: string;
  externalOfferId?: string | null;
  name: string;
  description?: string | null;
  destinationUrl: string;
};

export type UpdateOfferInput = {
  offerId: string;
  externalOfferId?: string | null;
  name?: string;
  description?: string | null;
  destinationUrl?: string;
  status?: OfferStatus;
};

export type UpsertPayoutProfileInput = {
  membershipId: string;
  mode: PayoutMode;
  fixedPayoutAmountMinor?: number | null;
  payoutCurrency?: string | null;
};

export type CreateOfferAssignmentInput = {
  offerId: string;
  membershipId: string;
  manualPayoutAmountMinor?: number | null;
  manualPayoutCurrency?: string | null;
};

export type UpdateOfferAssignmentInput = {
  offerId: string;
  assignmentId: string;
  status?: OfferAssignmentStatus;
  manualPayoutAmountMinor?: number | null;
  manualPayoutCurrency?: string | null;
};

export type TrackingLinkStatus = 'draft' | 'active' | 'paused' | 'archived';
export type TrackingLinkOwnerRole = Extract<CompanyRole, 'manager' | 'publisher'>;

export type TrackingLink = {
  id: string;
  companyId: string;
  offerId: string;
  offerCode: string;
  offerName: string;
  trackingDomainId: string;
  hostname: string;
  ownerMembershipId: string;
  ownerUserId: string;
  ownerRole: TrackingLinkOwnerRole;
  ownerMembershipStatus: 'invited' | 'active' | 'suspended' | 'revoked';
  trackingCode: string;
  customSlug: string | null;
  destinationUrl: string;
  queryParameters: Readonly<Record<string, string>>;
  status: TrackingLinkStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTrackingLinkInput = {
  offerId: string;
  trackingDomainId: string;
  ownerMembershipId?: string;
  customSlug?: string;
  destinationUrl?: string;
  queryParameters?: Readonly<Record<string, string>>;
  status?: Extract<TrackingLinkStatus, 'draft' | 'active'>;
};

export type UpdateTrackingLinkInput = {
  linkId: string;
  trackingDomainId?: string;
  customSlug?: string | null;
  destinationUrl?: string;
  queryParameters?: Readonly<Record<string, string>>;
  status?: TrackingLinkStatus;
};

export type NetworkPostbackEndpointStatus = 'active' | 'paused' | 'archived';
export type ConversionStatus = 'pending' | 'approved' | 'rejected' | 'reversed';

export type NetworkPostbackEndpoint = {
  id: string;
  companyId: string;
  networkAccountId: string;
  networkAccountName: string;
  name: string;
  endpointKeyLast4: string;
  status: NetworkPostbackEndpointStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NetworkPostbackEndpointSecret = {
  endpoint: NetworkPostbackEndpoint;
  endpointKey: string;
};

export type Conversion = {
  id: string;
  publicConversionId: string;
  companyId: string;
  trackingClickId: string;
  publicClickId: string;
  trackingLinkId: string;
  offerId: string;
  offerCode: string;
  offerName: string;
  networkAccountId: string;
  networkAccountName: string;
  ownerMembershipId: string;
  ownerUserId: string;
  offerAssignmentId: string;
  postbackEndpointId: string;
  postbackEndpointName: string;
  externalConversionId: string;
  source: 'provider_postback';
  status: ConversionStatus;
  revenueAmountMinor: number | null;
  revenueCurrency: string | null;
  payoutMode: PayoutMode;
  payoutAmountMinor: number;
  payoutCurrency: string;
  convertedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DuplicateProtectionRuleStatus = 'active' | 'paused' | 'archived';
export type DuplicateProtectionLockMode =
  | 'session'
  | 'duration'
  | 'until_date'
  | 'until_offer_expiry'
  | 'permanent';
export type FraudRiskLevel = 'low' | 'medium' | 'high';
export type DuplicateDecision = 'accepted' | 'duplicate';

export type DuplicateProtectionRule = {
  id: string;
  companyId: string;
  networkAccountId: string;
  networkAccountName: string;
  offerId: string | null;
  offerCode: string | null;
  offerName: string | null;
  name: string;
  lockMode: DuplicateProtectionLockMode;
  sessionWindowSeconds: number | null;
  lockDurationSeconds: number | null;
  lockUntil: string | null;
  offerExpiryAt: string | null;
  matchVisitorId: boolean;
  matchIpAndUserAgent: boolean;
  rapidRepeatWindowSeconds: number;
  rapidRepeatThreshold: number;
  status: DuplicateProtectionRuleStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FraudClick = {
  id: string;
  publicClickId: string;
  companyId: string;
  trackingLinkId: string;
  offerId: string;
  networkAccountId: string;
  ownerMembershipId: string;
  ownerUserId: string;
  visitorId: string;
  duplicateDecision: DuplicateDecision;
  duplicateReason: string | null;
  duplicateOfClickId: string | null;
  duplicateRuleId: string | null;
  lockExpiresAt: string | null;
  fraudRiskLevel: FraudRiskLevel;
  fraudSignals: readonly string[];
  attributionEligible: boolean;
  capturedAt: string;
};

export type CreateDuplicateProtectionRuleInput = {
  networkAccountId: string;
  offerId?: string | null;
  name: string;
  lockMode: DuplicateProtectionLockMode;
  sessionWindowSeconds?: number | null;
  lockDurationSeconds?: number | null;
  lockUntil?: string | null;
  offerExpiryAt?: string | null;
  matchVisitorId?: boolean;
  matchIpAndUserAgent?: boolean;
  rapidRepeatWindowSeconds?: number;
  rapidRepeatThreshold?: number;
  status?: Extract<DuplicateProtectionRuleStatus, 'active' | 'paused'>;
};

export type UpdateDuplicateProtectionRuleInput = Omit<
  Partial<CreateDuplicateProtectionRuleInput>,
  'networkAccountId' | 'offerId' | 'status'
> & {
  ruleId: string;
  status?: DuplicateProtectionRuleStatus;
};

export type BillingPlanStatus = 'active' | 'archived';
export type BillingInterval = 'monthly' | 'annual';
export type CompanySubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'grace_period'
  | 'suspended'
  | 'canceled'
  | 'expired';

export type BillingPlanEntitlement = {
  id: string;
  planId: string;
  key: string;
  enabled: boolean;
  limitValue: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: BillingPlanStatus;
  currency: string;
  priceAmountMinor: number;
  billingInterval: BillingInterval;
  trialDays: number;
  gracePeriodDays: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  entitlements: readonly BillingPlanEntitlement[];
};

export type CompanySubscription = {
  id: string;
  companyId: string;
  planId: string;
  status: CompanySubscriptionStatus;
  startsAt: string;
  trialEndsAt: string | null;
  currentPeriodStartsAt: string;
  currentPeriodEndsAt: string | null;
  graceEndsAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  externalReference: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyBillingSnapshot = {
  companyId: string;
  companyStatus: 'active' | 'suspended' | 'archived';
  subscription: CompanySubscription | null;
  plan: BillingPlan | null;
  access: {
    allowed: boolean;
    reason: string;
    effectiveUntil: string | null;
  };
};

export type CreateBillingPlanInput = {
  code: string;
  name: string;
  description?: string;
  currency: string;
  priceAmountMinor: number;
  billingInterval: BillingInterval;
  trialDays?: number;
  gracePeriodDays?: number;
  entitlements?: readonly {
    key: string;
    enabled?: boolean;
    limitValue?: number | null;
  }[];
};

export type UpdateBillingPlanInput = Partial<Omit<CreateBillingPlanInput, 'code'>> & {
  planId: string;
  status?: BillingPlanStatus;
};

export type CreateSubscriptionInput = {
  planId: string;
  startsAt?: string;
  currentPeriodEndsAt?: string;
  externalReference?: string;
};

export type UpdateSubscriptionInput = {
  planId?: string;
  status?: CompanySubscriptionStatus;
  currentPeriodEndsAt?: string | null;
  graceEndsAt?: string | null;
  externalReference?: string | null;
};

export type ReportingMonetaryTotal = {
  currency: string;
  revenueAmountMinor: number;
  payoutAmountMinor: number;
};

export type ReportingPerformanceRow = {
  dimensionId: string;
  dimensionName: string;
  clicks: number;
  conversions: number;
  approvedConversions: number;
  monetaryTotals: readonly ReportingMonetaryTotal[];
};

export type ReportingDashboard = {
  companyId: string;
  period: { from: string; to: string };
  totals: {
    clicks: number;
    uniqueVisitors: number;
    duplicateClicks: number;
    highRiskClicks: number;
    conversions: number;
    approvedConversions: number;
    monetaryTotals: readonly ReportingMonetaryTotal[];
  };
  offers: readonly ReportingPerformanceRow[];
  networkAccounts: readonly ReportingPerformanceRow[];
  members: readonly ReportingPerformanceRow[];
};

export type OperationalEvent = {
  id: string;
  companyId: string | null;
  actorUserId: string | null;
  requestId: string | null;
  eventName: string;
  entityType: string;
  entityId: string | null;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
};

export type CompanyLinkIdentifierMode =
  | 'slug_or_code'
  | 'tracking_code';
export type CompanyRestrictedSharePlatform =
  | 'snapchat'
  | 'instagram'
  | 'facebook';
export type CompanyCustomization = {
  id: string;
  companyId: string;
  brandName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  supportEmail: string | null;
  defaultCurrency: string | null;
  defaultTimezone: string | null;
    linkIdentifierMode: CompanyLinkIdentifierMode;
  plainTextSharingEnabled: boolean;
  restrictedSharePlatforms:
    readonly CompanyRestrictedSharePlatform[];
  defaultLinkQueryParameters:
    Readonly<Record<string, string>>;
createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ControlPlanePermissions = {
  platformAdmin: boolean;
  companyRole: CompanyRole | null;
  canRead: boolean;
  canManage: boolean;
  canManagePlatform: boolean;
  canManageOffers: boolean;
  canManageTracking: boolean;
  canViewFinancials: boolean;
  canViewOperations: boolean;
  canCustomize: boolean;
};
