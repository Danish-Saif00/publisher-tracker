export type PerformanceReportDimension =
  | 'networks'
  | 'offers'
  | 'publishers';

export type OperationalReviewStatus =
  | 'approved'
  | 'rejected'
  | 'unchecked';

export type OperationalDevice =
  | 'desktop'
  | 'mobile'
  | 'tablet'
  | 'other';

export type FinalOperationsLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'forbidden';

export type CommonOperationalFilters = {
  from?: string;
  to?: string;
  search?: string;
  offerId?: string;
  networkAccountId?: string;
  ownerMembershipId?: string;
  countryCode?: string;
  device?: OperationalDevice;
  limit?: number;
};

export type PerformanceReportFilters = CommonOperationalFilters & {
  dimensionStatus?: string;
};

export type ClickLogFilters = CommonOperationalFilters & {
  status?: OperationalReviewStatus;
};

export type ConversionLogFilters = ClickLogFilters & {
  conversionStatus?: 'pending' | 'approved' | 'rejected' | 'reversed';
};

export type SessionLogFilters = Pick<
  CommonOperationalFilters,
  | 'from'
  | 'to'
  | 'search'
  | 'ownerMembershipId'
  | 'countryCode'
  | 'device'
  | 'limit'
>;

export type UserAgentLogFilters = CommonOperationalFilters & {
  status?: OperationalReviewStatus;
};

export type PerformanceReportRow = {
  dimensionId: string;
  dimensionName: string;
  dimensionStatus: string;
  approvedClicks: number;
  rejectedClicks: number;
  uncheckedClicks: number;
  totalClicks: number;
  approvedConversions: number;
  rejectedConversions: number;
  uncheckedConversions: number;
  totalConversions: number;
};

export type ClickLogRecord = {
  id: string;
  publicClickId: string;
  offerId: string;
  offerName: string;
  trackingDomainId: string;
  trackingDomainName: string;
  networkAccountId: string;
  networkAccountName: string;
  ownerMembershipId: string;
  publisherName: string;
  ipHash: string;
  countryCode: string | null;
  device: OperationalDevice;
  browser: string;
  userAgent: string | null;
  status: OperationalReviewStatus;
  duplicateDecision: 'accepted' | 'duplicate';
  fraudRiskLevel: 'low' | 'medium' | 'high';
  proxyDetectionOutcome:
    | 'not_checked'
    | 'bypassed'
    | 'clean'
    | 'flagged'
    | 'blocked'
    | 'provider_failed';
  capturedAt: string;
};

export type ConversionLogRecord = {
  id: string;
  publicConversionId: string;
  publicClickId: string;
  offerId: string;
  offerName: string;
  trackingDomainId: string;
  trackingDomainName: string;
  networkAccountId: string;
  networkAccountName: string;
  ownerMembershipId: string;
  publisherName: string;
  countryCode: string | null;
  device: OperationalDevice;
  browser: string;
  source: 'provider_postback' | 'manual';
  status: 'pending' | 'approved' | 'rejected' | 'reversed';
  reviewStatus: OperationalReviewStatus;
  revenueAmountMinor: number | null;
  revenueCurrency: string | null;
  payoutAmountMinor: number;
  payoutCurrency: string;
  convertedAt: string;
};

export type SessionLogRecord = {
  visitorId: string;
  ownerMembershipId: string;
  publisherName: string;
  ipHash: string;
  countryCode: string | null;
  device: OperationalDevice;
  browser: string;
  clickCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type UserAgentLogRecord = {
  userAgentHash: string;
  userAgent: string | null;
  device: OperationalDevice;
  browser: string;
  clickCount: number;
  lastSeenAt: string;
};

export type AccountProfile = {
  userId: string;
  email: string;
  displayName: string | null;
  timezone: string;
  updatedAt: string;
};

export type UpdateAccountProfileInput = {
  displayName: string | null;
  timezone: string;
};

export type BillingInvoice = {
  id: string;
  companyId: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  invoiceNumber: string;
  status: 'issued' | 'paid' | 'overdue' | 'void';
  currency: string;
  amountMinor: number;
  periodStartsAt: string;
  periodEndsAt: string | null;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  externalReference: string | null;
};

export type CreateManualConversionInput = {
  publicClickId: string;
  status: 'pending' | 'approved' | 'rejected';
  revenueAmountMinor?: number | null;
  revenueCurrency?: string | null;
};

export type ManualConversion = {
  id: string;
  publicConversionId: string;
  publicClickId: string;
  source: 'manual';
  status: 'pending' | 'approved' | 'rejected';
  payoutAmountMinor: number;
  payoutCurrency: string;
  convertedAt: string;
};
