export type DuplicateProtectionRuleStatus = 'active' | 'paused' | 'archived';

export type DuplicateProtectionLockMode =
  'session' | 'duration' | 'until_date' | 'until_offer_expiry' | 'permanent';

export type FraudRiskLevel = 'low' | 'medium' | 'high';

export type DuplicateDecision = 'accepted' | 'duplicate';

export interface DuplicateFraudCompanyRecord {
  readonly id: string;
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface DuplicateFraudNetworkAccountRecord {
  readonly id: string;
  readonly companyId: string;
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface DuplicateFraudOfferRecord {
  readonly id: string;
  readonly companyId: string;
  readonly networkAccountId: string;
  readonly status: 'draft' | 'active' | 'paused' | 'archived';
}

export interface DuplicateProtectionRuleRecord {
  readonly id: string;
  readonly companyId: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly offerId: string | null;
  readonly offerCode: string | null;
  readonly offerName: string | null;
  readonly name: string;
  readonly lockMode: DuplicateProtectionLockMode;
  readonly sessionWindowSeconds: number | null;
  readonly lockDurationSeconds: number | null;
  readonly lockUntil: string | null;
  readonly offerExpiryAt: string | null;
  readonly matchVisitorId: boolean;
  readonly matchIpAndUserAgent: boolean;
  readonly rapidRepeatWindowSeconds: number;
  readonly rapidRepeatThreshold: number;
  readonly status: DuplicateProtectionRuleStatus;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FraudClickRecord {
  readonly id: string;
  readonly publicClickId: string;
  readonly companyId: string;
  readonly trackingLinkId: string;
  readonly offerId: string;
  readonly networkAccountId: string;
  readonly ownerMembershipId: string;
  readonly ownerUserId: string;
  readonly visitorId: string;
  readonly duplicateDecision: DuplicateDecision;
  readonly duplicateReason: string | null;
  readonly duplicateOfClickId: string | null;
  readonly duplicateRuleId: string | null;
  readonly lockExpiresAt: string | null;
  readonly fraudRiskLevel: FraudRiskLevel;
  readonly fraudSignals: readonly string[];
  readonly attributionEligible: boolean;
  readonly capturedAt: string;
}

export interface CreateDuplicateProtectionRuleInput {
  readonly networkAccountId: string;
  readonly offerId?: string | null;
  readonly name: string;
  readonly lockMode: DuplicateProtectionLockMode;
  readonly sessionWindowSeconds?: number | null;
  readonly lockDurationSeconds?: number | null;
  readonly lockUntil?: string | null;
  readonly offerExpiryAt?: string | null;
  readonly matchVisitorId?: boolean;
  readonly matchIpAndUserAgent?: boolean;
  readonly rapidRepeatWindowSeconds?: number;
  readonly rapidRepeatThreshold?: number;
  readonly status?: Extract<DuplicateProtectionRuleStatus, 'active' | 'paused'>;
}

export interface UpdateDuplicateProtectionRuleInput {
  readonly name?: string;
  readonly lockMode?: DuplicateProtectionLockMode;
  readonly sessionWindowSeconds?: number | null;
  readonly lockDurationSeconds?: number | null;
  readonly lockUntil?: string | null;
  readonly offerExpiryAt?: string | null;
  readonly matchVisitorId?: boolean;
  readonly matchIpAndUserAgent?: boolean;
  readonly rapidRepeatWindowSeconds?: number;
  readonly rapidRepeatThreshold?: number;
  readonly status?: DuplicateProtectionRuleStatus;
}

export interface ListDuplicateProtectionRulesInput {
  readonly networkAccountId?: string;
  readonly offerId?: string;
  readonly status?: DuplicateProtectionRuleStatus;
}

export interface ListFraudClicksInput {
  readonly networkAccountId?: string;
  readonly offerId?: string;
  readonly duplicateDecision?: DuplicateDecision;
  readonly fraudRiskLevel?: FraudRiskLevel;
  readonly limit?: number;
}

export interface DuplicateFraudRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface DuplicateProtectionRuleWriteInput {
  readonly networkAccountId: string;
  readonly offerId: string | null;
  readonly name: string;
  readonly lockMode: DuplicateProtectionLockMode;
  readonly sessionWindowSeconds: number | null;
  readonly lockDurationSeconds: number | null;
  readonly lockUntil: string | null;
  readonly offerExpiryAt: string | null;
  readonly matchVisitorId: boolean;
  readonly matchIpAndUserAgent: boolean;
  readonly rapidRepeatWindowSeconds: number;
  readonly rapidRepeatThreshold: number;
  readonly status: DuplicateProtectionRuleStatus;
}
