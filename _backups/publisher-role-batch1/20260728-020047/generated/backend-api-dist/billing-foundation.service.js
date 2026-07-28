import { assertCompanyRole, assertPlatformSuperAdmin } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const ENTITLEMENT_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAX_PRICE_AMOUNT_MINOR = 2_147_483_647;
const MAX_ENTITLEMENT_LIMIT = 2_147_483_647;
const MAX_ENTITLEMENTS = 100;
const MAX_EXTERNAL_REFERENCE_LENGTH = 255;
const ALLOWED_SUBSCRIPTION_TRANSITIONS = {
    trialing: ['active', 'grace_period', 'suspended', 'canceled', 'expired'],
    active: ['grace_period', 'suspended', 'canceled', 'expired'],
    grace_period: ['active', 'suspended', 'canceled', 'expired'],
    suspended: ['active', 'grace_period', 'canceled', 'expired'],
    canceled: ['active'],
    expired: ['active'],
};
function normalizeUuid(value, fieldName) {
    const normalizedValue = value.trim();
    if (!UUID_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
    }
    return normalizedValue;
}
function normalizePlanCode(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue.length < 2 ||
        normalizedValue.length > 80 ||
        !PLAN_CODE_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Billing plan code must contain 2 to 80 lowercase letters, numbers, or single underscores.');
    }
    return normalizedValue;
}
function normalizeRequiredText(value, fieldName, minimumLength, maximumLength) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < minimumLength || normalizedValue.length > maximumLength) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must contain ${String(minimumLength)} to ${String(maximumLength)} characters.`);
    }
    return normalizedValue;
}
function normalizeOptionalNullableText(value, fieldName, maximumLength) {
    if (value === undefined || value === null) {
        return value;
    }
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0 || normalizedValue.length > maximumLength) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must contain 1 to ${String(maximumLength)} characters when provided.`);
    }
    return normalizedValue;
}
function normalizeCurrency(value) {
    const normalizedValue = value.trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'currency must be a three-letter uppercase ISO currency code.');
    }
    return normalizedValue;
}
function normalizeInteger(value, fieldName, minimumValue, maximumValue) {
    if (!Number.isInteger(value) || value < minimumValue || value > maximumValue) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be an integer between ${String(minimumValue)} and ${String(maximumValue)}.`);
    }
    return value;
}
function normalizeBillingInterval(value) {
    switch (value) {
        case 'monthly':
        case 'annual':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'billingInterval must be monthly or annual.');
    }
}
function normalizePlanStatus(value, errorCode) {
    switch (value) {
        case 'active':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError(errorCode, 400, 'Billing plan status must be active or archived.');
    }
}
function normalizeSubscriptionStatus(value) {
    switch (value) {
        case 'trialing':
        case 'active':
        case 'grace_period':
        case 'suspended':
        case 'canceled':
        case 'expired':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Company subscription status is invalid.');
    }
}
function normalizeEntitlements(input) {
    if (input.length > MAX_ENTITLEMENTS) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `A billing plan cannot contain more than ${String(MAX_ENTITLEMENTS)} entitlements.`);
    }
    const seenKeys = new Set();
    const entitlements = input.map((entitlement) => {
        const key = entitlement.key.trim().toLowerCase();
        if (key.length < 2 || key.length > 80 || !ENTITLEMENT_KEY_PATTERN.test(key)) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Entitlement keys must contain 2 to 80 lowercase letters, numbers, or underscores and start with a letter.');
        }
        if (seenKeys.has(key)) {
            throw new ApiHttpError('BILLING_ENTITLEMENT_KEY_CONFLICT', 409, `The entitlement key "${key}" is duplicated.`);
        }
        seenKeys.add(key);
        const enabled = entitlement.enabled ?? true;
        const limitValue = entitlement.limitValue === undefined ? null : entitlement.limitValue;
        if (limitValue !== null) {
            normalizeInteger(limitValue, `Entitlement "${key}" limitValue`, 0, MAX_ENTITLEMENT_LIMIT);
        }
        if (!enabled && limitValue !== null) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `Disabled entitlement "${key}" cannot define a limitValue.`);
        }
        return Object.freeze({
            key,
            enabled,
            limitValue,
        });
    });
    entitlements.sort((left, right) => left.key.localeCompare(right.key));
    return Object.freeze(entitlements);
}
function normalizeDateTime(value, fieldName) {
    const normalizedValue = value.trim();
    const date = new Date(normalizedValue);
    if (normalizedValue.length === 0 || Number.isNaN(date.getTime())) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a valid ISO date-time.`);
    }
    return date.toISOString();
}
function normalizeOptionalDateTime(value, fieldName) {
    if (value === undefined || value === null) {
        return value;
    }
    return normalizeDateTime(value, fieldName);
}
function addDays(value, days) {
    const date = new Date(value);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
}
function assertDateAfter(laterValue, earlierValue, fieldName) {
    if (new Date(laterValue).getTime() <= new Date(earlierValue).getTime()) {
        throw new ApiHttpError('BILLING_SUBSCRIPTION_DATE_INVALID', 400, `${fieldName} must be later than ${earlierValue}.`);
    }
}
function createRepositoryContext(identity, requestId, companyId) {
    return {
        actorUserId: identity.actor.userId,
        requestId,
        ...(companyId !== undefined
            ? {
                companyId,
            }
            : {}),
    };
}
function assertCompanyRequestContext(identity, companyId) {
    if (identity.requestedCompanyId === undefined) {
        throw new ApiHttpError('COMPANY_CONTEXT_REQUIRED', 400, 'The x-company-id header is required for this operation.');
    }
    if (identity.requestedCompanyId !== companyId) {
        throw new ApiHttpError('COMPANY_CONTEXT_MISMATCH', 400, 'The x-company-id header must match the company route parameter.');
    }
}
async function requirePlan(repository, context, planId) {
    const plan = await repository.getPlan(context, planId);
    if (plan === undefined) {
        throw new ApiHttpError('BILLING_PLAN_NOT_FOUND', 404, 'The requested billing plan was not found.');
    }
    return plan;
}
async function requireActivePlan(repository, context, planId) {
    const plan = await requirePlan(repository, context, planId);
    if (plan.status !== 'active') {
        throw new ApiHttpError('BILLING_PLAN_ARCHIVED', 409, 'An archived billing plan cannot be assigned or modified.');
    }
    return plan;
}
async function requireCompany(repository, context, companyId) {
    const company = await repository.getCompany(context, companyId);
    if (company === undefined) {
        throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
    }
    return company;
}
function assertSubscriptionTransition(currentStatus, requestedStatus) {
    if (currentStatus === requestedStatus) {
        return;
    }
    if (!ALLOWED_SUBSCRIPTION_TRANSITIONS[currentStatus].includes(requestedStatus)) {
        throw new ApiHttpError('BILLING_SUBSCRIPTION_TRANSITION_INVALID', 409, `A ${currentStatus} subscription cannot transition to ${requestedStatus}.`);
    }
}
function normalizeExternalReference(value) {
    return normalizeOptionalNullableText(value, 'externalReference', MAX_EXTERNAL_REFERENCE_LENGTH);
}
function createAccessRecord(companyStatus, subscription, now) {
    if (companyStatus !== 'active') {
        return Object.freeze({
            allowed: false,
            reason: 'company_inactive',
            effectiveUntil: null,
        });
    }
    if (subscription === undefined) {
        return Object.freeze({
            allowed: false,
            reason: 'no_subscription',
            effectiveUntil: null,
        });
    }
    if (new Date(subscription.startsAt).getTime() > new Date(now).getTime()) {
        return Object.freeze({
            allowed: false,
            reason: 'subscription_not_started',
            effectiveUntil: subscription.startsAt,
        });
    }
    switch (subscription.status) {
        case 'trialing': {
            const trialEndsAt = subscription.trialEndsAt;
            if (trialEndsAt !== null && new Date(trialEndsAt).getTime() > new Date(now).getTime()) {
                return Object.freeze({
                    allowed: true,
                    reason: 'trialing',
                    effectiveUntil: trialEndsAt,
                });
            }
            return Object.freeze({
                allowed: false,
                reason: 'trial_expired',
                effectiveUntil: trialEndsAt,
            });
        }
        case 'active': {
            const currentPeriodEndsAt = subscription.currentPeriodEndsAt;
            if (currentPeriodEndsAt !== null &&
                new Date(currentPeriodEndsAt).getTime() <= new Date(now).getTime()) {
                return Object.freeze({
                    allowed: false,
                    reason: 'period_expired',
                    effectiveUntil: currentPeriodEndsAt,
                });
            }
            return Object.freeze({
                allowed: true,
                reason: 'active',
                effectiveUntil: currentPeriodEndsAt,
            });
        }
        case 'grace_period': {
            const graceEndsAt = subscription.graceEndsAt;
            if (graceEndsAt !== null && new Date(graceEndsAt).getTime() > new Date(now).getTime()) {
                return Object.freeze({
                    allowed: true,
                    reason: 'grace_period',
                    effectiveUntil: graceEndsAt,
                });
            }
            return Object.freeze({
                allowed: false,
                reason: 'grace_expired',
                effectiveUntil: graceEndsAt,
            });
        }
        case 'suspended':
            return Object.freeze({
                allowed: false,
                reason: 'subscription_suspended',
                effectiveUntil: null,
            });
        case 'canceled':
            return Object.freeze({
                allowed: false,
                reason: 'subscription_canceled',
                effectiveUntil: subscription.canceledAt,
            });
        case 'expired':
            return Object.freeze({
                allowed: false,
                reason: 'subscription_expired',
                effectiveUntil: subscription.endedAt,
            });
    }
    throw new Error('The company subscription status is unsupported.');
}
async function buildCompanyBillingSnapshot(repository, context, companyId, now) {
    const company = await requireCompany(repository, context, companyId);
    const subscription = await repository.getCompanySubscription(context, companyId);
    const plan = subscription === undefined ? undefined : await repository.getPlan(context, subscription.planId);
    if (subscription !== undefined && plan === undefined) {
        throw new Error('The company subscription references an unavailable billing plan.');
    }
    return Object.freeze({
        companyId,
        companyStatus: company.status,
        subscription: subscription ?? null,
        plan: plan ?? null,
        access: createAccessRecord(company.status, subscription, now),
    });
}
function createPlanUpdate(input) {
    const changedFields = [];
    const name = input.name === undefined ? undefined : normalizeRequiredText(input.name, 'name', 2, 160);
    if (name !== undefined) {
        changedFields.push('name');
    }
    const description = normalizeOptionalNullableText(input.description, 'description', 2000);
    if (description !== undefined) {
        changedFields.push('description');
    }
    const status = input.status === undefined
        ? undefined
        : normalizePlanStatus(input.status, 'INVALID_REQUEST_BODY');
    if (status !== undefined) {
        changedFields.push('status');
    }
    const currency = input.currency === undefined ? undefined : normalizeCurrency(input.currency);
    if (currency !== undefined) {
        changedFields.push('currency');
    }
    const priceAmountMinor = input.priceAmountMinor === undefined
        ? undefined
        : normalizeInteger(input.priceAmountMinor, 'priceAmountMinor', 0, MAX_PRICE_AMOUNT_MINOR);
    if (priceAmountMinor !== undefined) {
        changedFields.push('priceAmountMinor');
    }
    const billingInterval = input.billingInterval === undefined
        ? undefined
        : normalizeBillingInterval(input.billingInterval);
    if (billingInterval !== undefined) {
        changedFields.push('billingInterval');
    }
    const trialDays = input.trialDays === undefined
        ? undefined
        : normalizeInteger(input.trialDays, 'trialDays', 0, 365);
    if (trialDays !== undefined) {
        changedFields.push('trialDays');
    }
    const gracePeriodDays = input.gracePeriodDays === undefined
        ? undefined
        : normalizeInteger(input.gracePeriodDays, 'gracePeriodDays', 0, 90);
    if (gracePeriodDays !== undefined) {
        changedFields.push('gracePeriodDays');
    }
    const entitlements = input.entitlements === undefined ? undefined : normalizeEntitlements(input.entitlements);
    if (entitlements !== undefined) {
        changedFields.push('entitlements');
    }
    if (changedFields.length === 0) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'At least one billing plan field must be provided.');
    }
    return Object.freeze({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(priceAmountMinor !== undefined ? { priceAmountMinor } : {}),
        ...(billingInterval !== undefined ? { billingInterval } : {}),
        ...(trialDays !== undefined ? { trialDays } : {}),
        ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
        ...(entitlements !== undefined ? { entitlements } : {}),
        changedFields: Object.freeze(changedFields),
    });
}
function plansAreEquivalent(plan, input) {
    const scalarValuesAreEqual = (input.name === undefined || input.name === plan.name) &&
        (input.description === undefined || input.description === plan.description) &&
        (input.status === undefined || input.status === plan.status) &&
        (input.currency === undefined || input.currency === plan.currency) &&
        (input.priceAmountMinor === undefined || input.priceAmountMinor === plan.priceAmountMinor) &&
        (input.billingInterval === undefined || input.billingInterval === plan.billingInterval) &&
        (input.trialDays === undefined || input.trialDays === plan.trialDays) &&
        (input.gracePeriodDays === undefined || input.gracePeriodDays === plan.gracePeriodDays);
    if (!scalarValuesAreEqual) {
        return false;
    }
    if (input.entitlements === undefined) {
        return true;
    }
    if (input.entitlements.length !== plan.entitlements.length) {
        return false;
    }
    return input.entitlements.every((entitlement, index) => {
        const current = plan.entitlements[index];
        return (current?.key === entitlement.key &&
            current.enabled === entitlement.enabled &&
            current.limitValue === entitlement.limitValue);
    });
}
function subscriptionsAreEquivalent(current, next) {
    return (current.planId === next.planId &&
        current.status === next.status &&
        current.startsAt === next.startsAt &&
        current.trialEndsAt === next.trialEndsAt &&
        current.currentPeriodStartsAt === next.currentPeriodStartsAt &&
        current.currentPeriodEndsAt === next.currentPeriodEndsAt &&
        current.graceEndsAt === next.graceEndsAt &&
        current.canceledAt === next.canceledAt &&
        current.endedAt === next.endedAt &&
        current.externalReference === next.externalReference);
}
export function createBillingFoundationService(repository, options = {}) {
    const getNow = options.now ?? (() => new Date());
    return Object.freeze({
        async createPlan(identity, requestId, input) {
            assertPlatformSuperAdmin(identity.subject);
            const normalizedInput = Object.freeze({
                code: normalizePlanCode(input.code),
                name: normalizeRequiredText(input.name, 'name', 2, 160),
                description: normalizeOptionalNullableText(input.description, 'description', 2000) ?? null,
                status: 'active',
                currency: normalizeCurrency(input.currency),
                priceAmountMinor: normalizeInteger(input.priceAmountMinor, 'priceAmountMinor', 0, MAX_PRICE_AMOUNT_MINOR),
                billingInterval: normalizeBillingInterval(input.billingInterval),
                trialDays: normalizeInteger(input.trialDays ?? 0, 'trialDays', 0, 365),
                gracePeriodDays: normalizeInteger(input.gracePeriodDays ?? 0, 'gracePeriodDays', 0, 90),
                entitlements: normalizeEntitlements(input.entitlements ?? []),
            });
            const plan = await repository.createPlan(createRepositoryContext(identity, requestId), normalizedInput);
            if (plan === undefined) {
                throw new ApiHttpError('BILLING_PLAN_CODE_CONFLICT', 409, 'A billing plan with this code already exists.');
            }
            return plan;
        },
        async listPlans(identity, requestId, input) {
            assertPlatformSuperAdmin(identity.subject);
            const status = input.status === undefined
                ? undefined
                : normalizePlanStatus(input.status, 'INVALID_QUERY_PARAMETER');
            return repository.listPlans(createRepositoryContext(identity, requestId), status);
        },
        async getPlan(identity, requestId, planIdValue) {
            assertPlatformSuperAdmin(identity.subject);
            const planId = normalizeUuid(planIdValue, 'Billing plan ID');
            return requirePlan(repository, createRepositoryContext(identity, requestId), planId);
        },
        async updatePlan(identity, requestId, planIdValue, input) {
            assertPlatformSuperAdmin(identity.subject);
            const planId = normalizeUuid(planIdValue, 'Billing plan ID');
            const context = createRepositoryContext(identity, requestId);
            const plan = await requirePlan(repository, context, planId);
            if (plan.status === 'archived') {
                throw new ApiHttpError('BILLING_PLAN_ARCHIVED', 409, 'An archived billing plan is immutable.');
            }
            const update = createPlanUpdate(input);
            if (plansAreEquivalent(plan, update)) {
                throw new ApiHttpError('BILLING_PLAN_UNCHANGED', 409, 'The billing plan already contains the requested values.');
            }
            if (update.status === 'archived' && update.entitlements !== undefined) {
                throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Billing entitlements cannot be replaced while archiving a plan.');
            }
            if (update.status === 'archived') {
                const openSubscriptionCount = await repository.countOpenSubscriptionsForPlan(context, planId);
                if (openSubscriptionCount > 0) {
                    throw new ApiHttpError('BILLING_PLAN_IN_USE', 409, 'A billing plan with an open company subscription cannot be archived.');
                }
            }
            const updatedPlan = await repository.updatePlan(context, planId, plan.updatedAt, plan.status, update);
            if (updatedPlan === undefined) {
                throw new ApiHttpError('BILLING_PLAN_UPDATE_CONFLICT', 409, 'The billing plan changed before this request could be completed.');
            }
            return updatedPlan;
        },
        async createCompanySubscription(identity, requestId, companyIdValue, input) {
            assertPlatformSuperAdmin(identity.subject);
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const planId = normalizeUuid(input.planId, 'Billing plan ID');
            const context = createRepositoryContext(identity, requestId, companyId);
            const company = await requireCompany(repository, context, companyId);
            if (company.status === 'archived') {
                throw new ApiHttpError('BILLING_COMPANY_ARCHIVED', 409, 'An archived company cannot receive a billing subscription.');
            }
            const existingSubscription = await repository.getCompanySubscription(context, companyId);
            if (existingSubscription !== undefined) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_CONFLICT', 409, 'The company already has a billing subscription.');
            }
            const plan = await requireActivePlan(repository, context, planId);
            const now = getNow().toISOString();
            const startsAt = input.startsAt === undefined ? now : normalizeDateTime(input.startsAt, 'startsAt');
            const currentPeriodEndsAt = input.currentPeriodEndsAt === undefined
                ? null
                : normalizeDateTime(input.currentPeriodEndsAt, 'currentPeriodEndsAt');
            if (currentPeriodEndsAt !== null) {
                assertDateAfter(currentPeriodEndsAt, startsAt, 'currentPeriodEndsAt');
            }
            const trialEndsAt = plan.trialDays === 0 ? null : addDays(startsAt, plan.trialDays);
            const subscription = await repository.createCompanySubscription(context, companyId, Object.freeze({
                planId,
                status: trialEndsAt === null ? 'active' : 'trialing',
                startsAt,
                trialEndsAt,
                currentPeriodStartsAt: startsAt,
                currentPeriodEndsAt,
                graceEndsAt: null,
                canceledAt: null,
                endedAt: null,
                externalReference: normalizeExternalReference(input.externalReference) ?? null,
            }));
            if (subscription === undefined) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_CONFLICT', 409, 'The company subscription changed before this request could be completed.');
            }
            return buildCompanyBillingSnapshot(repository, context, companyId, now);
        },
        async getPlatformCompanyBilling(identity, requestId, companyIdValue) {
            assertPlatformSuperAdmin(identity.subject);
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const context = createRepositoryContext(identity, requestId, companyId);
            return buildCompanyBillingSnapshot(repository, context, companyId, getNow().toISOString());
        },
        async updateCompanySubscription(identity, requestId, companyIdValue, input) {
            assertPlatformSuperAdmin(identity.subject);
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const context = createRepositoryContext(identity, requestId, companyId);
            const company = await requireCompany(repository, context, companyId);
            if (company.status === 'archived') {
                throw new ApiHttpError('BILLING_COMPANY_ARCHIVED', 409, 'An archived company subscription cannot be modified.');
            }
            const current = await repository.getCompanySubscription(context, companyId);
            if (current === undefined) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_NOT_FOUND', 404, 'The company billing subscription was not found.');
            }
            const hasInput = input.planId !== undefined ||
                input.status !== undefined ||
                input.currentPeriodEndsAt !== undefined ||
                input.graceEndsAt !== undefined ||
                input.externalReference !== undefined;
            if (!hasInput) {
                throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'At least one company subscription field must be provided.');
            }
            const targetPlanId = input.planId === undefined
                ? current.planId
                : normalizeUuid(input.planId, 'Billing plan ID');
            const targetPlan = await requireActivePlan(repository, context, targetPlanId);
            const targetStatus = input.status === undefined ? current.status : normalizeSubscriptionStatus(input.status);
            assertSubscriptionTransition(current.status, targetStatus);
            const now = getNow().toISOString();
            const requestedCurrentPeriodEndsAt = input.currentPeriodEndsAt;
            const currentPeriodEndsAt = requestedCurrentPeriodEndsAt === undefined
                ? current.currentPeriodEndsAt
                : (normalizeOptionalDateTime(requestedCurrentPeriodEndsAt, 'currentPeriodEndsAt') ??
                    null);
            const currentPeriodExpired = current.currentPeriodEndsAt !== null &&
                new Date(current.currentPeriodEndsAt).getTime() <= new Date(now).getTime();
            const terminalSubscription = current.status === 'canceled' || current.status === 'expired';
            const renewalRequested = targetStatus === 'active' &&
                currentPeriodEndsAt !== null &&
                new Date(currentPeriodEndsAt).getTime() > new Date(now).getTime() &&
                (terminalSubscription || currentPeriodExpired);
            const currentPeriodStartsAt = renewalRequested
                ? now
                : current.currentPeriodStartsAt;
            if (terminalSubscription && !renewalRequested) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_DATE_INVALID', 400, 'Renewing a canceled or expired subscription requires active status and a future currentPeriodEndsAt.');
            }
            if (currentPeriodEndsAt !== null) {
                assertDateAfter(currentPeriodEndsAt, currentPeriodStartsAt, 'currentPeriodEndsAt');
            }
            let graceEndsAt = null;
            if (targetStatus === 'grace_period') {
                const suppliedGraceEndsAt = normalizeOptionalDateTime(input.graceEndsAt, 'graceEndsAt');
                if (suppliedGraceEndsAt !== undefined && suppliedGraceEndsAt !== null) {
                    graceEndsAt = suppliedGraceEndsAt;
                }
                else if (current.status === 'grace_period' && current.graceEndsAt !== null) {
                    graceEndsAt = current.graceEndsAt;
                }
                else {
                    if (targetPlan.gracePeriodDays === 0) {
                        throw new ApiHttpError('BILLING_SUBSCRIPTION_DATE_INVALID', 400, 'graceEndsAt is required because the billing plan has no default grace period.');
                    }
                    const graceBase = currentPeriodEndsAt !== null &&
                        new Date(currentPeriodEndsAt).getTime() > new Date(now).getTime()
                        ? currentPeriodEndsAt
                        : now;
                    graceEndsAt = addDays(graceBase, targetPlan.gracePeriodDays);
                }
                assertDateAfter(graceEndsAt, now, 'graceEndsAt');
            }
            else if (input.graceEndsAt !== undefined && input.graceEndsAt !== null) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_DATE_INVALID', 400, 'graceEndsAt can only be set for a grace_period subscription.');
            }
            const next = Object.freeze({
                planId: targetPlanId,
                status: targetStatus,
                startsAt: current.startsAt,
                trialEndsAt: renewalRequested ? null : current.trialEndsAt,
                currentPeriodStartsAt,
                currentPeriodEndsAt,
                graceEndsAt,
                canceledAt: targetStatus === 'canceled' ? now : null,
                endedAt: targetStatus === 'expired' ? now : null,
                externalReference: input.externalReference === undefined
                    ? current.externalReference
                    : (normalizeExternalReference(input.externalReference) ?? null),
            });
            if (subscriptionsAreEquivalent(current, next)) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_UNCHANGED', 409, 'The company subscription already contains the requested values.');
            }
            const updatedSubscription = await repository.updateCompanySubscription(context, companyId, current.updatedAt, current.status, current.planId, next);
            if (updatedSubscription === undefined) {
                throw new ApiHttpError('BILLING_SUBSCRIPTION_UPDATE_CONFLICT', 409, 'The company subscription changed before this request could be completed.');
            }
            return buildCompanyBillingSnapshot(repository, context, companyId, now);
        },
        async getTenantCompanyBilling(identity, requestId, companyIdValue) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            return buildCompanyBillingSnapshot(repository, context, companyId, getNow().toISOString());
        },
    });
}
//# sourceMappingURL=billing-foundation.service.js.map