import {
  authenticatedApiRequest,
  isRecord,
  readNullableString,
  readRequiredNumber,
  readRequiredString,
} from '../../lib/api-client';
import type {
  BillingPlan,
  BillingPlanEntitlement,
  CompanyBillingSnapshot,
  CompanyCustomization,
  Conversion,
  CreateBillingPlanInput,
  CreateDuplicateProtectionRuleInput,
  CreateOfferAssignmentInput,
  CreateOfferInput,
  CreateSubscriptionInput,
  CreateTrackingLinkInput,
  DuplicateProtectionRule,
  FraudClick,
  NetworkPostbackEndpoint,
  NetworkPostbackEndpointSecret,
  Offer,
  OfferAssignment,
  OperationalEvent,
  PayoutProfile,
  ReportingDashboard,
  ReportingMonetaryTotal,
  ReportingPerformanceRow,
  TrackingLink,
  UpdateBillingPlanInput,
  UpdateDuplicateProtectionRuleInput,
  UpdateOfferAssignmentInput,
  UpdateOfferInput,
  UpdateSubscriptionInput,
  UpdateTrackingLinkInput,
  UpsertPayoutProfileInput,
} from './control-plane.types';

function readData(payload: unknown): unknown {
  if (!isRecord(payload)) {
    throw new Error('The API returned an invalid response envelope.');
  }

  return payload.data;
}

function readNestedData(payload: unknown, key: string): unknown {
  const data = readData(payload);

  if (!isRecord(data)) {
    throw new Error('The API returned an invalid response payload.');
  }

  return data[key];
}

function readArray(value: unknown, fieldName: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function readOptionalNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return readRequiredNumber(value, fieldName);
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    throw new Error('The API returned invalid query parameters.');
  }

  const result: Record<string, string> = {};

  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') {
      throw new Error('The API returned invalid query parameters.');
    }

    result[key] = item;
  }

  return result;
}

function parseOffer(value: unknown): Offer {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid offer.');
  }

  const status = readRequiredString(value.status, 'offer status');

  if (!['draft', 'active', 'paused', 'archived'].includes(status)) {
    throw new Error('The API returned an unsupported offer status.');
  }

  return {
    id: readRequiredString(value.id, 'offer id'),
    companyId: readRequiredString(value.companyId, 'offer company id'),
    networkAccountId: readRequiredString(value.networkAccountId, 'offer network account id'),
    networkAccountName: readRequiredString(value.networkAccountName, 'offer network account name'),
    providerId: readRequiredString(value.providerId, 'offer provider id'),
    providerCode: readRequiredString(value.providerCode, 'offer provider code'),
    providerName: readRequiredString(value.providerName, 'offer provider name'),
    code: readRequiredString(value.code, 'offer code'),
    externalOfferId: readNullableString(value.externalOfferId, 'external offer id'),
    name: readRequiredString(value.name, 'offer name'),
    description: readNullableString(value.description, 'offer description'),
    destinationUrl: readRequiredString(value.destinationUrl, 'offer destination URL'),
    status: status as Offer['status'],
    createdBy: readNullableString(value.createdBy, 'offer creator'),
    updatedBy: readNullableString(value.updatedBy, 'offer updater'),
    createdAt: readRequiredString(value.createdAt, 'offer creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'offer update time'),
  };
}

function parsePayoutProfile(value: unknown): PayoutProfile {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid payout profile.');
  }

  const role = readRequiredString(value.role, 'payout profile role');
  const membershipStatus = readRequiredString(
    value.membershipStatus,
    'payout profile membership status',
  );
  const mode = readRequiredString(value.mode, 'payout mode');

  if (!['manager', 'publisher'].includes(role)) {
    throw new Error('The API returned an unsupported payout profile role.');
  }

  if (!['invited', 'active', 'suspended', 'revoked'].includes(membershipStatus)) {
    throw new Error('The API returned an unsupported membership status.');
  }

  if (!['fixed_member', 'per_offer'].includes(mode)) {
    throw new Error('The API returned an unsupported payout mode.');
  }

  return {
    id: readRequiredString(value.id, 'payout profile id'),
    companyId: readRequiredString(value.companyId, 'payout profile company id'),
    membershipId: readRequiredString(value.membershipId, 'payout profile membership id'),
    userId: readRequiredString(value.userId, 'payout profile user id'),
    role: role as PayoutProfile['role'],
    membershipStatus: membershipStatus as PayoutProfile['membershipStatus'],
    mode: mode as PayoutProfile['mode'],
    fixedPayoutAmountMinor: readOptionalNumber(
      value.fixedPayoutAmountMinor,
      'fixed payout amount',
    ),
    payoutCurrency: readNullableString(value.payoutCurrency, 'payout currency'),
    createdBy: readNullableString(value.createdBy, 'payout profile creator'),
    updatedBy: readNullableString(value.updatedBy, 'payout profile updater'),
    createdAt: readRequiredString(value.createdAt, 'payout profile creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'payout profile update time'),
  };
}

function parseOfferAssignment(value: unknown): OfferAssignment {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid offer assignment.');
  }

  const role = readRequiredString(value.role, 'assignment role');
  const membershipStatus = readRequiredString(value.membershipStatus, 'assignment membership status');
  const status = readRequiredString(value.status, 'assignment status');
  const payoutMode = readRequiredString(value.payoutMode, 'assignment payout mode');

  if (!['manager', 'publisher'].includes(role)) {
    throw new Error('The API returned an unsupported assignment role.');
  }

  if (!['invited', 'active', 'suspended', 'revoked'].includes(membershipStatus)) {
    throw new Error('The API returned an unsupported assignment membership status.');
  }

  if (!['active', 'paused', 'revoked'].includes(status)) {
    throw new Error('The API returned an unsupported assignment status.');
  }

  if (!['fixed_member', 'per_offer'].includes(payoutMode)) {
    throw new Error('The API returned an unsupported assignment payout mode.');
  }

  return {
    id: readRequiredString(value.id, 'assignment id'),
    companyId: readRequiredString(value.companyId, 'assignment company id'),
    offerId: readRequiredString(value.offerId, 'assignment offer id'),
    offerCode: readRequiredString(value.offerCode, 'assignment offer code'),
    offerName: readRequiredString(value.offerName, 'assignment offer name'),
    membershipId: readRequiredString(value.membershipId, 'assignment membership id'),
    userId: readRequiredString(value.userId, 'assignment user id'),
    role: role as OfferAssignment['role'],
    membershipStatus: membershipStatus as OfferAssignment['membershipStatus'],
    status: status as OfferAssignment['status'],
    manualPayoutAmountMinor: readOptionalNumber(
      value.manualPayoutAmountMinor,
      'manual payout amount',
    ),
    manualPayoutCurrency: readNullableString(
      value.manualPayoutCurrency,
      'manual payout currency',
    ),
    payoutMode: payoutMode as OfferAssignment['payoutMode'],
    resolvedPayoutAmountMinor: readRequiredNumber(
      value.resolvedPayoutAmountMinor,
      'resolved payout amount',
    ),
    resolvedPayoutCurrency: readRequiredString(
      value.resolvedPayoutCurrency,
      'resolved payout currency',
    ),
    assignedBy: readNullableString(value.assignedBy, 'assignment creator'),
    updatedBy: readNullableString(value.updatedBy, 'assignment updater'),
    createdAt: readRequiredString(value.createdAt, 'assignment creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'assignment update time'),
  };
}

function parseTrackingLink(value: unknown): TrackingLink {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid tracking link.');
  }

  const ownerRole = readRequiredString(value.ownerRole, 'tracking link owner role');
  const ownerMembershipStatus = readRequiredString(
    value.ownerMembershipStatus,
    'tracking link owner membership status',
  );
  const status = readRequiredString(value.status, 'tracking link status');

  if (!['manager', 'publisher'].includes(ownerRole)) {
    throw new Error('The API returned an unsupported tracking-link owner role.');
  }

  if (!['invited', 'active', 'suspended', 'revoked'].includes(ownerMembershipStatus)) {
    throw new Error('The API returned an unsupported tracking-link membership status.');
  }

  if (!['draft', 'active', 'paused', 'archived'].includes(status)) {
    throw new Error('The API returned an unsupported tracking-link status.');
  }

  return {
    id: readRequiredString(value.id, 'tracking link id'),
    companyId: readRequiredString(value.companyId, 'tracking link company id'),
    offerId: readRequiredString(value.offerId, 'tracking link offer id'),
    offerCode: readRequiredString(value.offerCode, 'tracking link offer code'),
    offerName: readRequiredString(value.offerName, 'tracking link offer name'),
    trackingDomainId: readRequiredString(value.trackingDomainId, 'tracking link domain id'),
    hostname: readRequiredString(value.hostname, 'tracking link hostname'),
    ownerMembershipId: readRequiredString(value.ownerMembershipId, 'tracking link owner membership id'),
    ownerUserId: readRequiredString(value.ownerUserId, 'tracking link owner user id'),
    ownerRole: ownerRole as TrackingLink['ownerRole'],
    ownerMembershipStatus: ownerMembershipStatus as TrackingLink['ownerMembershipStatus'],
    trackingCode: readRequiredString(value.trackingCode, 'tracking code'),
    customSlug: readNullableString(value.customSlug, 'tracking link custom slug'),
    destinationUrl: readRequiredString(value.destinationUrl, 'tracking link destination URL'),
    queryParameters: readStringRecord(value.queryParameters),
    status: status as TrackingLink['status'],
    createdBy: readNullableString(value.createdBy, 'tracking link creator'),
    updatedBy: readNullableString(value.updatedBy, 'tracking link updater'),
    createdAt: readRequiredString(value.createdAt, 'tracking link creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'tracking link update time'),
  };
}

function parsePostbackEndpoint(value: unknown): NetworkPostbackEndpoint {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid postback endpoint.');
  }

  const status = readRequiredString(value.status, 'postback endpoint status');

  if (!['active', 'paused', 'archived'].includes(status)) {
    throw new Error('The API returned an unsupported postback endpoint status.');
  }

  return {
    id: readRequiredString(value.id, 'postback endpoint id'),
    companyId: readRequiredString(value.companyId, 'postback endpoint company id'),
    networkAccountId: readRequiredString(value.networkAccountId, 'postback network account id'),
    networkAccountName: readRequiredString(value.networkAccountName, 'postback network account name'),
    name: readRequiredString(value.name, 'postback endpoint name'),
    endpointKeyLast4: readRequiredString(value.endpointKeyLast4, 'postback endpoint key suffix'),
    status: status as NetworkPostbackEndpoint['status'],
    createdBy: readNullableString(value.createdBy, 'postback endpoint creator'),
    updatedBy: readNullableString(value.updatedBy, 'postback endpoint updater'),
    createdAt: readRequiredString(value.createdAt, 'postback endpoint creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'postback endpoint update time'),
  };
}

function parsePostbackEndpointSecret(value: unknown): NetworkPostbackEndpointSecret {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid postback endpoint secret.');
  }

  return {
    endpoint: parsePostbackEndpoint(value.endpoint),
    endpointKey: readRequiredString(value.endpointKey, 'postback endpoint key'),
  };
}

function parseConversion(value: unknown): Conversion {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid conversion.');
  }

  const status = readRequiredString(value.status, 'conversion status');
  const payoutMode = readRequiredString(value.payoutMode, 'conversion payout mode');

  if (!['pending', 'approved', 'rejected', 'reversed'].includes(status)) {
    throw new Error('The API returned an unsupported conversion status.');
  }

  if (!['fixed_member', 'per_offer'].includes(payoutMode)) {
    throw new Error('The API returned an unsupported conversion payout mode.');
  }

  return {
    id: readRequiredString(value.id, 'conversion id'),
    publicConversionId: readRequiredString(value.publicConversionId, 'public conversion id'),
    companyId: readRequiredString(value.companyId, 'conversion company id'),
    trackingClickId: readRequiredString(value.trackingClickId, 'tracking click id'),
    publicClickId: readRequiredString(value.publicClickId, 'public click id'),
    trackingLinkId: readRequiredString(value.trackingLinkId, 'conversion tracking link id'),
    offerId: readRequiredString(value.offerId, 'conversion offer id'),
    offerCode: readRequiredString(value.offerCode, 'conversion offer code'),
    offerName: readRequiredString(value.offerName, 'conversion offer name'),
    networkAccountId: readRequiredString(value.networkAccountId, 'conversion network account id'),
    networkAccountName: readRequiredString(value.networkAccountName, 'conversion network account name'),
    ownerMembershipId: readRequiredString(value.ownerMembershipId, 'conversion owner membership id'),
    ownerUserId: readRequiredString(value.ownerUserId, 'conversion owner user id'),
    offerAssignmentId: readRequiredString(value.offerAssignmentId, 'conversion assignment id'),
    postbackEndpointId: readRequiredString(value.postbackEndpointId, 'conversion endpoint id'),
    postbackEndpointName: readRequiredString(value.postbackEndpointName, 'conversion endpoint name'),
    externalConversionId: readRequiredString(value.externalConversionId, 'external conversion id'),
    source: 'provider_postback',
    status: status as Conversion['status'],
    revenueAmountMinor: readOptionalNumber(value.revenueAmountMinor, 'conversion revenue amount'),
    revenueCurrency: readNullableString(value.revenueCurrency, 'conversion revenue currency'),
    payoutMode: payoutMode as Conversion['payoutMode'],
    payoutAmountMinor: readRequiredNumber(value.payoutAmountMinor, 'conversion payout amount'),
    payoutCurrency: readRequiredString(value.payoutCurrency, 'conversion payout currency'),
    convertedAt: readRequiredString(value.convertedAt, 'conversion time'),
    createdAt: readRequiredString(value.createdAt, 'conversion creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'conversion update time'),
  };
}

function parseDuplicateRule(value: unknown): DuplicateProtectionRule {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid duplicate-protection rule.');
  }

  const lockMode = readRequiredString(value.lockMode, 'duplicate lock mode');
  const status = readRequiredString(value.status, 'duplicate rule status');

  if (!['session', 'duration', 'until_date', 'until_offer_expiry', 'permanent'].includes(lockMode)) {
    throw new Error('The API returned an unsupported duplicate lock mode.');
  }

  if (!['active', 'paused', 'archived'].includes(status)) {
    throw new Error('The API returned an unsupported duplicate rule status.');
  }

  return {
    id: readRequiredString(value.id, 'duplicate rule id'),
    companyId: readRequiredString(value.companyId, 'duplicate rule company id'),
    networkAccountId: readRequiredString(value.networkAccountId, 'duplicate rule network account id'),
    networkAccountName: readRequiredString(value.networkAccountName, 'duplicate rule network account name'),
    offerId: readNullableString(value.offerId, 'duplicate rule offer id'),
    offerCode: readNullableString(value.offerCode, 'duplicate rule offer code'),
    offerName: readNullableString(value.offerName, 'duplicate rule offer name'),
    name: readRequiredString(value.name, 'duplicate rule name'),
    lockMode: lockMode as DuplicateProtectionRule['lockMode'],
    sessionWindowSeconds: readOptionalNumber(value.sessionWindowSeconds, 'session window'),
    lockDurationSeconds: readOptionalNumber(value.lockDurationSeconds, 'lock duration'),
    lockUntil: readNullableString(value.lockUntil, 'lock expiration'),
    offerExpiryAt: readNullableString(value.offerExpiryAt, 'offer expiration'),
    matchVisitorId: readBoolean(value.matchVisitorId, 'visitor matching flag'),
    matchIpAndUserAgent: readBoolean(value.matchIpAndUserAgent, 'IP and user-agent matching flag'),
    rapidRepeatWindowSeconds: readRequiredNumber(value.rapidRepeatWindowSeconds, 'rapid-repeat window'),
    rapidRepeatThreshold: readRequiredNumber(value.rapidRepeatThreshold, 'rapid-repeat threshold'),
    status: status as DuplicateProtectionRule['status'],
    createdBy: readNullableString(value.createdBy, 'duplicate rule creator'),
    updatedBy: readNullableString(value.updatedBy, 'duplicate rule updater'),
    createdAt: readRequiredString(value.createdAt, 'duplicate rule creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'duplicate rule update time'),
  };
}

function parseFraudClick(value: unknown): FraudClick {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid fraud click.');
  }

  const duplicateDecision = readRequiredString(value.duplicateDecision, 'duplicate decision');
  const fraudRiskLevel = readRequiredString(value.fraudRiskLevel, 'fraud risk level');

  if (!['accepted', 'duplicate'].includes(duplicateDecision)) {
    throw new Error('The API returned an unsupported duplicate decision.');
  }

  if (!['low', 'medium', 'high'].includes(fraudRiskLevel)) {
    throw new Error('The API returned an unsupported fraud risk level.');
  }

  return {
    id: readRequiredString(value.id, 'fraud click id'),
    publicClickId: readRequiredString(value.publicClickId, 'public click id'),
    companyId: readRequiredString(value.companyId, 'fraud click company id'),
    trackingLinkId: readRequiredString(value.trackingLinkId, 'fraud click tracking link id'),
    offerId: readRequiredString(value.offerId, 'fraud click offer id'),
    networkAccountId: readRequiredString(value.networkAccountId, 'fraud click network account id'),
    ownerMembershipId: readRequiredString(value.ownerMembershipId, 'fraud click owner membership id'),
    ownerUserId: readRequiredString(value.ownerUserId, 'fraud click owner user id'),
    visitorId: readRequiredString(value.visitorId, 'fraud click visitor id'),
    duplicateDecision: duplicateDecision as FraudClick['duplicateDecision'],
    duplicateReason: readNullableString(value.duplicateReason, 'duplicate reason'),
    duplicateOfClickId: readNullableString(value.duplicateOfClickId, 'original click id'),
    duplicateRuleId: readNullableString(value.duplicateRuleId, 'duplicate rule id'),
    lockExpiresAt: readNullableString(value.lockExpiresAt, 'duplicate lock expiration'),
    fraudRiskLevel: fraudRiskLevel as FraudClick['fraudRiskLevel'],
    fraudSignals: readArray(value.fraudSignals, 'fraud signals').map((item) =>
      readRequiredString(item, 'fraud signal'),
    ),
    attributionEligible: readBoolean(value.attributionEligible, 'attribution eligibility'),
    capturedAt: readRequiredString(value.capturedAt, 'fraud click capture time'),
  };
}

function parseBillingEntitlement(value: unknown): BillingPlanEntitlement {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid billing entitlement.');
  }

  return {
    id: readRequiredString(value.id, 'billing entitlement id'),
    planId: readRequiredString(value.planId, 'billing entitlement plan id'),
    key: readRequiredString(value.key, 'billing entitlement key'),
    enabled: readBoolean(value.enabled, 'billing entitlement enabled flag'),
    limitValue: readOptionalNumber(value.limitValue, 'billing entitlement limit'),
    createdAt: readRequiredString(value.createdAt, 'billing entitlement creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'billing entitlement update time'),
  };
}

function parseBillingPlan(value: unknown): BillingPlan {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid billing plan.');
  }

  const status = readRequiredString(value.status, 'billing plan status');
  const billingInterval = readRequiredString(value.billingInterval, 'billing interval');

  if (!['active', 'archived'].includes(status)) {
    throw new Error('The API returned an unsupported billing plan status.');
  }

  if (!['monthly', 'annual'].includes(billingInterval)) {
    throw new Error('The API returned an unsupported billing interval.');
  }

  return {
    id: readRequiredString(value.id, 'billing plan id'),
    code: readRequiredString(value.code, 'billing plan code'),
    name: readRequiredString(value.name, 'billing plan name'),
    description: readNullableString(value.description, 'billing plan description'),
    status: status as BillingPlan['status'],
    currency: readRequiredString(value.currency, 'billing plan currency'),
    priceAmountMinor: readRequiredNumber(value.priceAmountMinor, 'billing plan price'),
    billingInterval: billingInterval as BillingPlan['billingInterval'],
    trialDays: readRequiredNumber(value.trialDays, 'billing plan trial days'),
    gracePeriodDays: readRequiredNumber(value.gracePeriodDays, 'billing plan grace days'),
    createdBy: readNullableString(value.createdBy, 'billing plan creator'),
    createdAt: readRequiredString(value.createdAt, 'billing plan creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'billing plan update time'),
    entitlements: readArray(value.entitlements, 'billing entitlements').map(parseBillingEntitlement),
  };
}

function parseBillingSnapshot(value: unknown): CompanyBillingSnapshot {
  if (!isRecord(value) || !isRecord(value.access)) {
    throw new Error('The API returned an invalid billing snapshot.');
  }

  const companyStatus = readRequiredString(value.companyStatus, 'billing company status');

  if (!['active', 'suspended', 'archived'].includes(companyStatus)) {
    throw new Error('The API returned an unsupported billing company status.');
  }

  const subscriptionValue = value.subscription;
  let subscription: CompanyBillingSnapshot['subscription'] = null;

  if (subscriptionValue !== null) {
    if (!isRecord(subscriptionValue)) {
      throw new Error('The API returned an invalid company subscription.');
    }

    const status = readRequiredString(subscriptionValue.status, 'subscription status');

    if (!['trialing', 'active', 'grace_period', 'suspended', 'canceled', 'expired'].includes(status)) {
      throw new Error('The API returned an unsupported subscription status.');
    }

    subscription = {
      id: readRequiredString(subscriptionValue.id, 'subscription id'),
      companyId: readRequiredString(subscriptionValue.companyId, 'subscription company id'),
      planId: readRequiredString(subscriptionValue.planId, 'subscription plan id'),
      status: status as NonNullable<CompanyBillingSnapshot['subscription']>['status'],
      startsAt: readRequiredString(subscriptionValue.startsAt, 'subscription start'),
      trialEndsAt: readNullableString(subscriptionValue.trialEndsAt, 'subscription trial end'),
      currentPeriodStartsAt: readRequiredString(
        subscriptionValue.currentPeriodStartsAt,
        'subscription period start',
      ),
      currentPeriodEndsAt: readNullableString(
        subscriptionValue.currentPeriodEndsAt,
        'subscription period end',
      ),
      graceEndsAt: readNullableString(subscriptionValue.graceEndsAt, 'subscription grace end'),
      canceledAt: readNullableString(subscriptionValue.canceledAt, 'subscription cancellation time'),
      endedAt: readNullableString(subscriptionValue.endedAt, 'subscription end time'),
      externalReference: readNullableString(
        subscriptionValue.externalReference,
        'subscription external reference',
      ),
      createdBy: readNullableString(subscriptionValue.createdBy, 'subscription creator'),
      updatedBy: readNullableString(subscriptionValue.updatedBy, 'subscription updater'),
      createdAt: readRequiredString(subscriptionValue.createdAt, 'subscription creation time'),
      updatedAt: readRequiredString(subscriptionValue.updatedAt, 'subscription update time'),
    };
  }

  return {
    companyId: readRequiredString(value.companyId, 'billing snapshot company id'),
    companyStatus: companyStatus as CompanyBillingSnapshot['companyStatus'],
    subscription,
    plan: value.plan === null ? null : parseBillingPlan(value.plan),
    access: {
      allowed: readBoolean(value.access.allowed, 'billing access flag'),
      reason: readRequiredString(value.access.reason, 'billing access reason'),
      effectiveUntil: readNullableString(value.access.effectiveUntil, 'billing access expiration'),
    },
  };
}

function parseMonetaryTotal(value: unknown): ReportingMonetaryTotal {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid monetary total.');
  }

  return {
    currency: readRequiredString(value.currency, 'reporting currency'),
    revenueAmountMinor: readRequiredNumber(value.revenueAmountMinor, 'reporting revenue'),
    payoutAmountMinor: readRequiredNumber(value.payoutAmountMinor, 'reporting payout'),
  };
}

function parsePerformanceRow(value: unknown): ReportingPerformanceRow {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid reporting row.');
  }

  return {
    dimensionId: readRequiredString(value.dimensionId, 'reporting dimension id'),
    dimensionName: readRequiredString(value.dimensionName, 'reporting dimension name'),
    clicks: readRequiredNumber(value.clicks, 'reporting click count'),
    conversions: readRequiredNumber(value.conversions, 'reporting conversion count'),
    approvedConversions: readRequiredNumber(
      value.approvedConversions,
      'reporting approved conversion count',
    ),
    monetaryTotals: readArray(value.monetaryTotals, 'reporting monetary totals').map(
      parseMonetaryTotal,
    ),
  };
}

function parseReportingDashboard(value: unknown): ReportingDashboard {
  if (!isRecord(value) || !isRecord(value.period) || !isRecord(value.totals)) {
    throw new Error('The API returned an invalid reporting dashboard.');
  }

  return {
    companyId: readRequiredString(value.companyId, 'reporting company id'),
    period: {
      from: readRequiredString(value.period.from, 'reporting period start'),
      to: readRequiredString(value.period.to, 'reporting period end'),
    },
    totals: {
      clicks: readRequiredNumber(value.totals.clicks, 'reporting total clicks'),
      uniqueVisitors: readRequiredNumber(value.totals.uniqueVisitors, 'reporting unique visitors'),
      duplicateClicks: readRequiredNumber(value.totals.duplicateClicks, 'reporting duplicate clicks'),
      highRiskClicks: readRequiredNumber(value.totals.highRiskClicks, 'reporting high-risk clicks'),
      conversions: readRequiredNumber(value.totals.conversions, 'reporting total conversions'),
      approvedConversions: readRequiredNumber(
        value.totals.approvedConversions,
        'reporting approved conversions',
      ),
      monetaryTotals: readArray(
        value.totals.monetaryTotals,
        'reporting monetary totals',
      ).map(parseMonetaryTotal),
    },
    offers: readArray(value.offers, 'offer performance').map(parsePerformanceRow),
    networkAccounts: readArray(value.networkAccounts, 'network account performance').map(
      parsePerformanceRow,
    ),
    members: readArray(value.members, 'member performance').map(parsePerformanceRow),
  };
}

function parseOperationalEvent(value: unknown): OperationalEvent {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid operational event.');
  }

  return {
    id: readRequiredString(value.id, 'operational event id'),
    companyId: readNullableString(value.companyId, 'operational event company id'),
    actorUserId: readNullableString(value.actorUserId, 'operational event actor id'),
    requestId: readNullableString(value.requestId, 'operational event request id'),
    eventName: readRequiredString(value.eventName, 'operational event name'),
    entityType: readRequiredString(value.entityType, 'operational entity type'),
    entityId: readNullableString(value.entityId, 'operational entity id'),
    metadata: isRecord(value.metadata) ? value.metadata : {},
    createdAt: readRequiredString(value.createdAt, 'operational event creation time'),
  };
}

function parseCustomization(value: unknown): CompanyCustomization {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid company customization.');
  }

    const linkIdentifierMode =
    readRequiredString(
      value.linkIdentifierMode,
      'custom link identifier mode',
    );
  if (
    linkIdentifierMode !== 'slug_or_code' &&
    linkIdentifierMode !== 'tracking_code'
  ) {
    throw new Error(
      'The API returned an unsupported link identifier mode.',
    );
  }
  const restrictedSharePlatforms =
    readArray(
      value.restrictedSharePlatforms,
      'restricted share platforms',
    ).map((item) => {
      const platform =
        readRequiredString(
          item,
          'restricted share platform',
        );
      if (
        platform !== 'snapchat' &&
        platform !== 'instagram' &&
        platform !== 'facebook'
      ) {
        throw new Error(
          'The API returned an unsupported restricted share platform.',
        );
      }
      return platform as
        CompanyCustomization[
          'restrictedSharePlatforms'
        ][number];
    });
return {
    id: readRequiredString(value.id, 'customization id'),
    companyId: readRequiredString(value.companyId, 'customization company id'),
    brandName: readNullableString(
      value.brandName,
      'custom brand name',
    ),
    tagline: readNullableString(
      value.tagline,
      'custom tagline',
    ),
    logoUrl: readNullableString(
      value.logoUrl,
      'custom logo URL',
    ),
    primaryColor: readNullableString(
      value.primaryColor,
      'custom primary color',
    ),
    secondaryColor: readNullableString(
      value.secondaryColor,
      'custom secondary color',
    ),
    supportEmail: readNullableString(
      value.supportEmail,
      'custom support email',
    ),
    defaultCurrency: readNullableString(
      value.defaultCurrency,
      'custom default currency',
    ),
    defaultTimezone: readNullableString(
      value.defaultTimezone,
      'custom default timezone',
    ),
        linkIdentifierMode:
      linkIdentifierMode as
        CompanyCustomization['linkIdentifierMode'],
    plainTextSharingEnabled:
      readBoolean(
        value.plainTextSharingEnabled,
        'plain-text sharing flag',
      ),
    restrictedSharePlatforms,
    defaultLinkQueryParameters:
      readStringRecord(
        value.defaultLinkQueryParameters,
      ),
createdBy: readNullableString(
      value.createdBy,
      'customization creator',
    ),
    updatedBy: readNullableString(value.updatedBy, 'customization updater'),
    createdAt: readRequiredString(value.createdAt, 'customization creation time'),
    updatedAt: readRequiredString(value.updatedAt, 'customization update time'),
  };
}
function parseNullableCompanyCustomization(
  value: unknown,
): CompanyCustomization | null {
  return value === null
    ? null
    : parseCustomization(value);
}


function queryString(values: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).length > 0) {
      search.set(key, String(value));
    }
  }

  const serialized = search.toString();
  return serialized.length === 0 ? '' : `?${serialized}`;
}

export async function fetchOffers(
  accessToken: string,
  companyId: string,
  filters: { networkAccountId?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<readonly Offer[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/offers${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readData(payload), 'offers').map(parseOffer);
}

export async function createOffer(
  accessToken: string,
  companyId: string,
  input: CreateOfferInput,
): Promise<Offer> {
  const payload = await authenticatedApiRequest(accessToken, `/companies/${companyId}/offers`, {
    method: 'POST',
    companyId,
    body: {
      networkAccountId: input.networkAccountId,
      code: input.code.trim().toLowerCase(),
      name: input.name.trim(),
      destinationUrl: input.destinationUrl.trim(),
      externalOfferId: input.externalOfferId?.trim() || null,
      description: input.description?.trim() || null,
    },
  });

  return parseOffer(readData(payload));
}

export async function updateOffer(
  accessToken: string,
  companyId: string,
  input: UpdateOfferInput,
): Promise<Offer> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/offers/${input.offerId}`,
    {
      method: 'PATCH',
      companyId,
      body: {
        ...(input.externalOfferId !== undefined
          ? { externalOfferId: input.externalOfferId?.trim() || null }
          : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.destinationUrl !== undefined
          ? { destinationUrl: input.destinationUrl.trim() }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    },
  );

  return parseOffer(readData(payload));
}

export async function fetchPayoutProfiles(
  accessToken: string,
  companyId: string,
  ownOnly: boolean,
  signal?: AbortSignal,
): Promise<readonly PayoutProfile[]> {
  const path = ownOnly
    ? `/companies/${companyId}/payout-profile`
    : `/companies/${companyId}/payout-profiles`;
  const payload = await authenticatedApiRequest(accessToken, path, {
    companyId,
    ...(signal !== undefined ? { signal } : {}),
  });
  const data = readData(payload);

  if (ownOnly) {
    return data === null ? [] : [parsePayoutProfile(data)];
  }

  return readArray(data, 'payout profiles').map(parsePayoutProfile);
}

export async function upsertPayoutProfile(
  accessToken: string,
  companyId: string,
  input: UpsertPayoutProfileInput,
): Promise<PayoutProfile> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/payout-profiles/${input.membershipId}`,
    {
      method: 'PUT',
      companyId,
      body: {
        mode: input.mode,
        fixedPayoutAmountMinor: input.fixedPayoutAmountMinor ?? null,
        payoutCurrency: input.payoutCurrency?.trim().toUpperCase() || null,
      },
    },
  );

  return parsePayoutProfile(readData(payload));
}

export async function fetchOfferAssignments(
  accessToken: string,
  companyId: string,
  offerId: string,
  signal?: AbortSignal,
): Promise<readonly OfferAssignment[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/offers/${offerId}/assignments`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readData(payload), 'offer assignments').map(parseOfferAssignment);
}

export async function createOfferAssignment(
  accessToken: string,
  companyId: string,
  input: CreateOfferAssignmentInput,
): Promise<OfferAssignment> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/offers/${input.offerId}/assignments`,
    {
      method: 'POST',
      companyId,
      body: {
        membershipId: input.membershipId,
        manualPayoutAmountMinor: input.manualPayoutAmountMinor ?? null,
        manualPayoutCurrency: input.manualPayoutCurrency?.trim().toUpperCase() || null,
      },
    },
  );

  return parseOfferAssignment(readData(payload));
}

export async function updateOfferAssignment(
  accessToken: string,
  companyId: string,
  input: UpdateOfferAssignmentInput,
): Promise<OfferAssignment> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/offers/${input.offerId}/assignments/${input.assignmentId}`,
    {
      method: 'PATCH',
      companyId,
      body: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.manualPayoutAmountMinor !== undefined
          ? { manualPayoutAmountMinor: input.manualPayoutAmountMinor }
          : {}),
        ...(input.manualPayoutCurrency !== undefined
          ? { manualPayoutCurrency: input.manualPayoutCurrency?.trim().toUpperCase() || null }
          : {}),
      },
    },
  );

  return parseOfferAssignment(readData(payload));
}

export async function fetchTrackingLinks(
  accessToken: string,
  companyId: string,
  filters: { offerId?: string; ownerMembershipId?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<readonly TrackingLink[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/tracking-links${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readNestedData(payload, 'trackingLinks'), 'tracking links').map(
    parseTrackingLink,
  );
}

export async function createTrackingLink(
  accessToken: string,
  companyId: string,
  input: CreateTrackingLinkInput,
): Promise<TrackingLink> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/tracking-links`,
    {
      method: 'POST',
      companyId,
      body: {
        offerId: input.offerId,
        trackingDomainId: input.trackingDomainId,
        ...(input.ownerMembershipId !== undefined
          ? { ownerMembershipId: input.ownerMembershipId }
          : {}),
        ...(input.customSlug !== undefined && input.customSlug.trim().length > 0
          ? { customSlug: input.customSlug.trim().toLowerCase() }
          : {}),
        ...(input.destinationUrl !== undefined && input.destinationUrl.trim().length > 0
          ? { destinationUrl: input.destinationUrl.trim() }
          : {}),
        queryParameters: input.queryParameters ?? {},
        status: input.status ?? 'active',
      },
    },
  );

  return parseTrackingLink(readNestedData(payload, 'trackingLink'));
}

export async function updateTrackingLink(
  accessToken: string,
  companyId: string,
  input: UpdateTrackingLinkInput,
): Promise<TrackingLink> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/tracking-links/${input.linkId}`,
    {
      method: 'PATCH',
      companyId,
      body: {
        ...(input.trackingDomainId !== undefined
          ? { trackingDomainId: input.trackingDomainId }
          : {}),
        ...(input.customSlug !== undefined
          ? { customSlug: input.customSlug?.trim().toLowerCase() || null }
          : {}),
        ...(input.destinationUrl !== undefined
          ? { destinationUrl: input.destinationUrl.trim() }
          : {}),
        ...(input.queryParameters !== undefined
          ? { queryParameters: input.queryParameters }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    },
  );

  return parseTrackingLink(readNestedData(payload, 'trackingLink'));
}

export async function fetchPostbackEndpoints(
  accessToken: string,
  companyId: string,
  networkAccountId: string,
  status?: string,
  signal?: AbortSignal,
): Promise<readonly NetworkPostbackEndpoint[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/network-accounts/${networkAccountId}/postback-endpoints${queryString({ status })}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readNestedData(payload, 'endpoints'), 'postback endpoints').map(
    parsePostbackEndpoint,
  );
}

export async function createPostbackEndpoint(
  accessToken: string,
  companyId: string,
  networkAccountId: string,
  input: { name: string; status?: 'active' | 'paused' },
): Promise<NetworkPostbackEndpointSecret> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/network-accounts/${networkAccountId}/postback-endpoints`,
    {
      method: 'POST',
      companyId,
      body: { name: input.name.trim(), status: input.status ?? 'active' },
    },
  );

  return parsePostbackEndpointSecret(readData(payload));
}

export async function updatePostbackEndpoint(
  accessToken: string,
  companyId: string,
  networkAccountId: string,
  endpointId: string,
  input: { name?: string; status?: 'active' | 'paused' | 'archived' },
): Promise<NetworkPostbackEndpoint> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/network-accounts/${networkAccountId}/postback-endpoints/${endpointId}`,
    {
      method: 'PATCH',
      companyId,
      body: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    },
  );

  return parsePostbackEndpoint(readNestedData(payload, 'endpoint'));
}

export async function rotatePostbackEndpointKey(
  accessToken: string,
  companyId: string,
  networkAccountId: string,
  endpointId: string,
): Promise<NetworkPostbackEndpointSecret> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/network-accounts/${networkAccountId}/postback-endpoints/${endpointId}/rotate-key`,
    { method: 'POST', companyId },
  );

  return parsePostbackEndpointSecret(readData(payload));
}

export async function fetchConversions(
  accessToken: string,
  companyId: string,
  filters: {
    networkAccountId?: string;
    offerId?: string;
    ownerMembershipId?: string;
    status?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<readonly Conversion[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/conversions${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readNestedData(payload, 'conversions'), 'conversions').map(parseConversion);
}

export async function fetchDuplicateRules(
  accessToken: string,
  companyId: string,
  filters: { networkAccountId?: string; offerId?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<readonly DuplicateProtectionRule[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/duplicate-protection-rules${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readNestedData(payload, 'rules'), 'duplicate-protection rules').map(
    parseDuplicateRule,
  );
}

export async function createDuplicateRule(
  accessToken: string,
  companyId: string,
  input: CreateDuplicateProtectionRuleInput,
): Promise<DuplicateProtectionRule> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/duplicate-protection-rules`,
    {
      method: 'POST',
      companyId,
      body: {
        ...input,
        name: input.name.trim(),
        offerId: input.offerId ?? null,
      },
    },
  );

  return parseDuplicateRule(readNestedData(payload, 'rule'));
}

export async function updateDuplicateRule(
  accessToken: string,
  companyId: string,
  input: UpdateDuplicateProtectionRuleInput,
): Promise<DuplicateProtectionRule> {
  const { ruleId, ...body } = input;
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/duplicate-protection-rules/${ruleId}`,
    { method: 'PATCH', companyId, body },
  );

  return parseDuplicateRule(readNestedData(payload, 'rule'));
}

export async function fetchFraudClicks(
  accessToken: string,
  companyId: string,
  filters: {
    networkAccountId?: string;
    offerId?: string;
    duplicateDecision?: string;
    fraudRiskLevel?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<readonly FraudClick[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/fraud-clicks${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readNestedData(payload, 'clicks'), 'fraud clicks').map(parseFraudClick);
}

export async function fetchBillingPlans(
  accessToken: string,
  status?: string,
  signal?: AbortSignal,
): Promise<readonly BillingPlan[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/platform/billing/plans${queryString({ status })}`,
    { ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readData(payload), 'billing plans').map(parseBillingPlan);
}

export async function createBillingPlan(
  accessToken: string,
  input: CreateBillingPlanInput,
): Promise<BillingPlan> {
  const payload = await authenticatedApiRequest(accessToken, '/platform/billing/plans', {
    method: 'POST',
    body: {
      ...input,
      code: input.code.trim().toLowerCase(),
      name: input.name.trim(),
      currency: input.currency.trim().toUpperCase(),
    },
  });

  return parseBillingPlan(readData(payload));
}

export async function updateBillingPlan(
  accessToken: string,
  input: UpdateBillingPlanInput,
): Promise<BillingPlan> {
  const { planId, ...body } = input;
  const payload = await authenticatedApiRequest(
    accessToken,
    `/platform/billing/plans/${planId}`,
    { method: 'PATCH', body },
  );

  return parseBillingPlan(readData(payload));
}

export async function fetchCompanyBilling(
  accessToken: string,
  companyId: string,
  platformAdmin: boolean,
  signal?: AbortSignal,
): Promise<CompanyBillingSnapshot> {
  const path = platformAdmin
    ? `/platform/companies/${companyId}/subscription`
    : `/companies/${companyId}/billing/subscription`;
  const payload = await authenticatedApiRequest(accessToken, path, {
    companyId,
    ...(signal !== undefined ? { signal } : {}),
  });

  return parseBillingSnapshot(readData(payload));
}

export async function createCompanySubscription(
  accessToken: string,
  companyId: string,
  input: CreateSubscriptionInput,
): Promise<CompanyBillingSnapshot> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/platform/companies/${companyId}/subscription`,
    { method: 'POST', companyId, body: input },
  );

  return parseBillingSnapshot(readData(payload));
}

export async function updateCompanySubscription(
  accessToken: string,
  companyId: string,
  input: UpdateSubscriptionInput,
): Promise<CompanyBillingSnapshot> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/platform/companies/${companyId}/subscription`,
    { method: 'PATCH', companyId, body: input },
  );

  return parseBillingSnapshot(readData(payload));
}

export async function fetchReporting(
  accessToken: string,
  companyId: string,
  filters: {
    from?: string;
    to?: string;
    offerId?: string;
    networkAccountId?: string;
    ownerMembershipId?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ReportingDashboard> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/reporting/dashboard${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return parseReportingDashboard(readNestedData(payload, 'dashboard'));
}

export async function fetchOperationalEvents(
  accessToken: string,
  companyId: string,
  filters: {
    eventName?: string;
    entityType?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<readonly OperationalEvent[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/operations/events${queryString(filters)}`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return readArray(readNestedData(payload, 'events'), 'operational events').map(
    parseOperationalEvent,
  );
}

export async function fetchCustomization(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<CompanyCustomization | null> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/customization`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return parseNullableCompanyCustomization(readNestedData(payload, 'customization'));
}

export async function updateCustomization(
  accessToken: string,
  companyId: string,
  input: {
    brandName?: string | null;
    tagline?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    supportEmail?: string | null;
    defaultCurrency?: string | null;
    defaultTimezone?: string | null;
      linkIdentifierMode?:
      CompanyCustomization['linkIdentifierMode'];
    plainTextSharingEnabled?: boolean;
    restrictedSharePlatforms?:
      CompanyCustomization['restrictedSharePlatforms'];
    defaultLinkQueryParameters?:
      CompanyCustomization['defaultLinkQueryParameters'];
},
): Promise<CompanyCustomization> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/customization`,
    { method: 'PUT', companyId, body: input },
  );

  return parseCustomization(readNestedData(payload, 'customization'));
}
