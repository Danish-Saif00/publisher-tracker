export type PerformanceReportDimension = 'networks' | 'offers' | 'managers' | 'publishers';

export type OperationalReviewStatus = 'approved' | 'rejected' | 'unchecked';

export type OperationalDevice = 'desktop' | 'mobile' | 'tablet' | 'other';

export interface FinalOperationsRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface FinalOperationsScope {
  readonly ownerUserId?: string;
  readonly managerMembershipId?: string;
}

export interface PerformanceReportInput {
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly status?: string;
  readonly offerId?: string;
  readonly networkAccountId?: string;
  readonly ownerMembershipId?: string;
  readonly countryCode?: string;
  readonly device?: OperationalDevice;
  readonly limit: number;
}

export interface PerformanceReportRow {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly dimensionStatus: string;
  readonly approvedClicks: number;
  readonly rejectedClicks: number;
  readonly uncheckedClicks: number;
  readonly totalClicks: number;
  readonly approvedConversions: number;
  readonly rejectedConversions: number;
  readonly uncheckedConversions: number;
  readonly totalConversions: number;
}

export interface ClickLogInput {
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly status?: OperationalReviewStatus;
  readonly offerId?: string;
  readonly networkAccountId?: string;
  readonly ownerMembershipId?: string;
  readonly countryCode?: string;
  readonly device?: OperationalDevice;
  readonly limit: number;
}

export interface ClickLogRecord {
  readonly id: string;
  readonly publicClickId: string;
  readonly offerId: string;
  readonly offerName: string;
  readonly trackingDomainId: string;
  readonly trackingDomainName: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly ownerMembershipId: string;
  readonly publisherName: string;
  readonly ipHash: string;
  readonly countryCode: string | null;
  readonly device: OperationalDevice;
  readonly browser: string;
  readonly userAgent: string | null;
  readonly status: OperationalReviewStatus;
  readonly duplicateDecision: 'accepted' | 'duplicate';
  readonly fraudRiskLevel: 'low' | 'medium' | 'high';
  readonly proxyDetectionOutcome:
    'not_checked' | 'bypassed' | 'clean' | 'flagged' | 'blocked' | 'provider_failed';
  readonly capturedAt: string;
}

export interface ConversionLogInput extends ClickLogInput {
  readonly conversionStatus?: 'pending' | 'approved' | 'rejected' | 'reversed';
}

export interface ConversionLogRecord {
  readonly id: string;
  readonly publicConversionId: string;
  readonly publicClickId: string;
  readonly offerId: string;
  readonly offerName: string;
  readonly trackingDomainId: string;
  readonly trackingDomainName: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly ownerMembershipId: string;
  readonly publisherName: string;
  readonly countryCode: string | null;
  readonly device: OperationalDevice;
  readonly browser: string;
  readonly source: 'provider_postback' | 'manual';
  readonly status: 'pending' | 'approved' | 'rejected' | 'reversed';
  readonly reviewStatus: OperationalReviewStatus;
  readonly revenueAmountMinor: number | null;
  readonly revenueCurrency: string | null;
  readonly payoutAmountMinor: number;
  readonly payoutCurrency: string;
  readonly convertedAt: string;
}

export interface SessionLogInput {
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly ownerMembershipId?: string;
  readonly countryCode?: string;
  readonly device?: OperationalDevice;
  readonly limit: number;
}

export interface SessionLogRecord {
  readonly visitorId: string;
  readonly ownerMembershipId: string;
  readonly publisherName: string;
  readonly ipHash: string;
  readonly countryCode: string | null;
  readonly device: OperationalDevice;
  readonly browser: string;
  readonly clickCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface UserAgentLogInput {
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly offerId?: string;
  readonly networkAccountId?: string;
  readonly ownerMembershipId?: string;
  readonly countryCode?: string;
  readonly device?: OperationalDevice;
  readonly status?: OperationalReviewStatus;
  readonly limit: number;
}

export interface UserAgentLogRecord {
  readonly userAgentHash: string;
  readonly userAgent: string | null;
  readonly device: OperationalDevice;
  readonly browser: string;
  readonly clickCount: number;
  readonly lastSeenAt: string;
}

export interface AccountProfileRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly timezone: string;
  readonly updatedAt: string;
}

export interface UpdateAccountProfileInput {
  readonly displayName: string | null;
  readonly timezone: string;
}

export interface BillingInvoiceRecord {
  readonly id: string;
  readonly companyId: string;
  readonly subscriptionId: string;
  readonly planId: string;
  readonly planName: string;
  readonly invoiceNumber: string;
  readonly status: 'issued' | 'paid' | 'overdue' | 'void';
  readonly currency: string;
  readonly amountMinor: number;
  readonly periodStartsAt: string;
  readonly periodEndsAt: string | null;
  readonly issuedAt: string;
  readonly dueAt: string | null;
  readonly paidAt: string | null;
  readonly externalReference: string | null;
}

export interface CreateManualConversionRequest {
  readonly publicClickId: string;
  readonly status: string;
  readonly revenueAmountMinor?: number | null;
  readonly revenueCurrency?: string | null;
}

export interface CreateManualConversionInput {
  readonly publicClickId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly revenueAmountMinor?: number | null;
  readonly revenueCurrency?: string | null;
}

export interface ManualConversionRecord {
  readonly id: string;
  readonly publicConversionId: string;
  readonly publicClickId: string;
  readonly source: 'manual';
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly payoutAmountMinor: number;
  readonly payoutCurrency: string;
  readonly convertedAt: string;
}
