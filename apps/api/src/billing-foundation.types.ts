import type { CompanyStatus } from './company-management.types.js';

export type BillingPlanStatus = 'active' | 'archived';

export type BillingInterval = 'monthly' | 'annual';

export type CompanySubscriptionStatus =
  'trialing' | 'active' | 'grace_period' | 'suspended' | 'canceled' | 'expired';

export type BillingAccessReason =
  | 'active'
  | 'trialing'
  | 'grace_period'
  | 'no_subscription'
  | 'subscription_not_started'
  | 'company_inactive'
  | 'trial_expired'
  | 'period_expired'
  | 'grace_expired'
  | 'subscription_suspended'
  | 'subscription_canceled'
  | 'subscription_expired';

export interface BillingPlanEntitlementRecord {
  readonly id: string;
  readonly planId: string;
  readonly key: string;
  readonly enabled: boolean;
  readonly limitValue: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BillingPlanRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: BillingPlanStatus;
  readonly currency: string;
  readonly priceAmountMinor: number;
  readonly billingInterval: BillingInterval;
  readonly trialDays: number;
  readonly gracePeriodDays: number;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entitlements: readonly BillingPlanEntitlementRecord[];
}

export interface BillingCompanyRecord {
  readonly id: string;
  readonly status: CompanyStatus;
}

export interface CompanySubscriptionRecord {
  readonly id: string;
  readonly companyId: string;
  readonly planId: string;
  readonly status: CompanySubscriptionStatus;
  readonly startsAt: string;
  readonly trialEndsAt: string | null;
  readonly currentPeriodStartsAt: string;
  readonly currentPeriodEndsAt: string | null;
  readonly graceEndsAt: string | null;
  readonly canceledAt: string | null;
  readonly endedAt: string | null;
  readonly externalReference: string | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BillingAccessRecord {
  readonly allowed: boolean;
  readonly reason: BillingAccessReason;
  readonly effectiveUntil: string | null;
}

export interface CompanyBillingSnapshot {
  readonly companyId: string;
  readonly companyStatus: CompanyStatus;
  readonly subscription: CompanySubscriptionRecord | null;
  readonly plan: BillingPlanRecord | null;
  readonly access: BillingAccessRecord;
}

export interface BillingEntitlementInput {
  readonly key: string;
  readonly enabled?: boolean;
  readonly limitValue?: number | null;
}

export interface CreateBillingPlanInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly currency: string;
  readonly priceAmountMinor: number;
  readonly billingInterval: BillingInterval;
  readonly trialDays?: number;
  readonly gracePeriodDays?: number;
  readonly entitlements?: readonly BillingEntitlementInput[];
}

export interface UpdateBillingPlanInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly status?: BillingPlanStatus;
  readonly currency?: string;
  readonly priceAmountMinor?: number;
  readonly billingInterval?: BillingInterval;
  readonly trialDays?: number;
  readonly gracePeriodDays?: number;
  readonly entitlements?: readonly BillingEntitlementInput[];
}

export interface ListBillingPlansInput {
  readonly status?: BillingPlanStatus;
}

export interface CreateCompanySubscriptionInput {
  readonly planId: string;
  readonly startsAt?: string;
  readonly currentPeriodEndsAt?: string;
  readonly externalReference?: string;
}

export interface UpdateCompanySubscriptionInput {
  readonly planId?: string;
  readonly status?: CompanySubscriptionStatus;
  readonly currentPeriodEndsAt?: string | null;
  readonly graceEndsAt?: string | null;
  readonly externalReference?: string | null;
}

export interface BillingRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface NormalizedBillingEntitlementInput {
  readonly key: string;
  readonly enabled: boolean;
  readonly limitValue: number | null;
}

export interface BillingPlanWriteInput {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: BillingPlanStatus;
  readonly currency: string;
  readonly priceAmountMinor: number;
  readonly billingInterval: BillingInterval;
  readonly trialDays: number;
  readonly gracePeriodDays: number;
  readonly entitlements: readonly NormalizedBillingEntitlementInput[];
}

export interface BillingPlanUpdateWriteInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly status?: BillingPlanStatus;
  readonly currency?: string;
  readonly priceAmountMinor?: number;
  readonly billingInterval?: BillingInterval;
  readonly trialDays?: number;
  readonly gracePeriodDays?: number;
  readonly entitlements?: readonly NormalizedBillingEntitlementInput[];
  readonly changedFields: readonly string[];
}

export interface CompanySubscriptionWriteInput {
  readonly planId: string;
  readonly status: CompanySubscriptionStatus;
  readonly startsAt: string;
  readonly trialEndsAt: string | null;
  readonly currentPeriodStartsAt: string;
  readonly currentPeriodEndsAt: string | null;
  readonly graceEndsAt: string | null;
  readonly canceledAt: string | null;
  readonly endedAt: string | null;
  readonly externalReference: string | null;
}
