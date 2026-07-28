import { assertCompanyRole, isPlatformSuperAdmin } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 160;
const DEFAULT_SESSION_WINDOW_SECONDS = 1_800;
const DEFAULT_RAPID_REPEAT_WINDOW_SECONDS = 60;
const DEFAULT_RAPID_REPEAT_THRESHOLD = 5;
const MIN_WINDOW_SECONDS = 30;
const MAX_WINDOW_SECONDS = 31_536_000;
const MAX_RESULT_LIMIT = 200;
const ALLOWED_STATUS_TRANSITIONS = {
    active: ['paused', 'archived'],
    paused: ['active', 'archived'],
    archived: [],
};
function normalizeUuid(value, fieldName) {
    const normalizedValue = value.trim();
    if (!UUID_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
    }
    return normalizedValue;
}
function normalizeName(value) {
    const normalizedValue = value.trim().replace(/\s+/gu, ' ');
    if (normalizedValue.length < 2 || normalizedValue.length > MAX_NAME_LENGTH) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `name must contain 2 to ${String(MAX_NAME_LENGTH)} characters.`);
    }
    return normalizedValue;
}
function normalizeInteger(value, fieldName, minimum, maximum) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a whole number between ${String(minimum)} and ${String(maximum)}.`);
    }
    return value;
}
function normalizeFutureTimestamp(value, fieldName) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a valid future timestamp.`);
    }
    return date.toISOString();
}
function normalizeRuleTiming(lockMode, input, offerId) {
    switch (lockMode) {
        case 'session':
            return Object.freeze({
                sessionWindowSeconds: normalizeInteger(input.sessionWindowSeconds ?? DEFAULT_SESSION_WINDOW_SECONDS, 'sessionWindowSeconds', MIN_WINDOW_SECONDS, 86_400),
                lockDurationSeconds: null,
                lockUntil: null,
                offerExpiryAt: null,
            });
        case 'duration':
            if (input.lockDurationSeconds === null || input.lockDurationSeconds === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_TIMING_INVALID', 400, 'lockDurationSeconds is required for duration rules.');
            }
            return Object.freeze({
                sessionWindowSeconds: null,
                lockDurationSeconds: normalizeInteger(input.lockDurationSeconds, 'lockDurationSeconds', MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS),
                lockUntil: null,
                offerExpiryAt: null,
            });
        case 'until_date':
            if (input.lockUntil === null || input.lockUntil === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_TIMING_INVALID', 400, 'lockUntil is required for until_date rules.');
            }
            return Object.freeze({
                sessionWindowSeconds: null,
                lockDurationSeconds: null,
                lockUntil: normalizeFutureTimestamp(input.lockUntil, 'lockUntil'),
                offerExpiryAt: null,
            });
        case 'until_offer_expiry':
            if (offerId === null) {
                throw new ApiHttpError('DUPLICATE_RULE_SCOPE_INVALID', 400, 'until_offer_expiry rules must target a specific offer.');
            }
            if (input.offerExpiryAt === null || input.offerExpiryAt === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_TIMING_INVALID', 400, 'offerExpiryAt is required for until_offer_expiry rules.');
            }
            return Object.freeze({
                sessionWindowSeconds: null,
                lockDurationSeconds: null,
                lockUntil: null,
                offerExpiryAt: normalizeFutureTimestamp(input.offerExpiryAt, 'offerExpiryAt'),
            });
        case 'permanent':
            return Object.freeze({
                sessionWindowSeconds: null,
                lockDurationSeconds: null,
                lockUntil: null,
                offerExpiryAt: null,
            });
    }
}
function createRepositoryContext(identity, requestId, companyId) {
    return {
        actorUserId: identity.actor.userId,
        requestId,
        companyId,
    };
}
function assertRuleReadAccess(identity, companyId) {
    assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
    ]);
}
function assertRuleWriteAccess(identity, companyId) {
    assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
}
function assertFraudReadAccess(identity, companyId) {
    assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
    ]);
}
function assertStatusTransition(currentStatus, targetStatus) {
    if (currentStatus === targetStatus) {
        return;
    }
    if (!ALLOWED_STATUS_TRANSITIONS[currentStatus].includes(targetStatus)) {
        throw new ApiHttpError('DUPLICATE_RULE_STATUS_TRANSITION_INVALID', 409, `Duplicate-protection rule cannot transition from ${currentStatus} to ${targetStatus}.`);
    }
}
function ruleInputsEqual(current, input) {
    return (current.name === input.name &&
        current.lockMode === input.lockMode &&
        current.sessionWindowSeconds === input.sessionWindowSeconds &&
        current.lockDurationSeconds === input.lockDurationSeconds &&
        current.lockUntil === input.lockUntil &&
        current.offerExpiryAt === input.offerExpiryAt &&
        current.matchVisitorId === input.matchVisitorId &&
        current.matchIpAndUserAgent === input.matchIpAndUserAgent &&
        current.rapidRepeatWindowSeconds === input.rapidRepeatWindowSeconds &&
        current.rapidRepeatThreshold === input.rapidRepeatThreshold &&
        current.status === input.status);
}
async function assertCompanyAndDependencies(repository, context, companyId, networkAccountId, offerId) {
    const company = await repository.getCompany(context, companyId);
    if (company?.status !== 'active') {
        throw new ApiHttpError('DUPLICATE_RULE_COMPANY_INACTIVE', 409, 'Duplicate-protection rules require an active company.');
    }
    const account = await repository.getNetworkAccount(context, companyId, networkAccountId);
    if (account?.status !== 'active') {
        throw new ApiHttpError('DUPLICATE_RULE_NETWORK_ACCOUNT_INVALID', 409, 'Duplicate-protection rules require an active network account.');
    }
    if (offerId === null) {
        return;
    }
    const offer = await repository.getOffer(context, companyId, offerId);
    if (offer?.networkAccountId !== networkAccountId || offer.status === 'archived') {
        throw new ApiHttpError('DUPLICATE_RULE_OFFER_INVALID', 409, 'The scoped offer must belong to the selected network account and must not be archived.');
    }
}
function normalizeRuleWriteInput(input) {
    const timing = normalizeRuleTiming(input.lockMode, {
        sessionWindowSeconds: input.sessionWindowSeconds,
        lockDurationSeconds: input.lockDurationSeconds,
        lockUntil: input.lockUntil,
        offerExpiryAt: input.offerExpiryAt,
    }, input.offerId);
    const matchVisitorId = input.matchVisitorId ?? true;
    const matchIpAndUserAgent = input.matchIpAndUserAgent ?? true;
    if (!matchVisitorId && !matchIpAndUserAgent) {
        throw new ApiHttpError('DUPLICATE_RULE_SIGNALS_INVALID', 400, 'At least one identity signal must be enabled.');
    }
    return Object.freeze({
        networkAccountId: input.networkAccountId,
        offerId: input.offerId,
        name: normalizeName(input.name),
        lockMode: input.lockMode,
        ...timing,
        matchVisitorId,
        matchIpAndUserAgent,
        rapidRepeatWindowSeconds: normalizeInteger(input.rapidRepeatWindowSeconds ?? DEFAULT_RAPID_REPEAT_WINDOW_SECONDS, 'rapidRepeatWindowSeconds', 10, 86_400),
        rapidRepeatThreshold: normalizeInteger(input.rapidRepeatThreshold ?? DEFAULT_RAPID_REPEAT_THRESHOLD, 'rapidRepeatThreshold', 2, 1_000),
        status: input.status,
    });
}
export function createDuplicateFraudService(repository) {
    return Object.freeze({
        async createRule(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'companyId');
            assertRuleWriteAccess(identity, companyId);
            const context = createRepositoryContext(identity, requestId, companyId);
            const networkAccountId = normalizeUuid(input.networkAccountId, 'networkAccountId');
            const offerId = input.offerId === undefined || input.offerId === null
                ? null
                : normalizeUuid(input.offerId, 'offerId');
            const writeInput = normalizeRuleWriteInput({
                networkAccountId,
                offerId,
                name: input.name,
                lockMode: input.lockMode,
                sessionWindowSeconds: input.sessionWindowSeconds,
                lockDurationSeconds: input.lockDurationSeconds,
                lockUntil: input.lockUntil,
                offerExpiryAt: input.offerExpiryAt,
                matchVisitorId: input.matchVisitorId,
                matchIpAndUserAgent: input.matchIpAndUserAgent,
                rapidRepeatWindowSeconds: input.rapidRepeatWindowSeconds,
                rapidRepeatThreshold: input.rapidRepeatThreshold,
                status: input.status ?? 'active',
            });
            await assertCompanyAndDependencies(repository, context, companyId, networkAccountId, offerId);
            const created = await repository.createRule(context, companyId, writeInput);
            if (created === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_CONFLICT', 409, 'A duplicate-protection rule already exists for this account and offer scope.');
            }
            return created;
        },
        async listRules(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'companyId');
            assertRuleReadAccess(identity, companyId);
            const context = createRepositoryContext(identity, requestId, companyId);
            return repository.listRules(context, companyId, {
                ...(input.networkAccountId !== undefined
                    ? {
                        networkAccountId: normalizeUuid(input.networkAccountId, 'networkAccountId'),
                    }
                    : {}),
                ...(input.offerId !== undefined
                    ? {
                        offerId: normalizeUuid(input.offerId, 'offerId'),
                    }
                    : {}),
                ...(input.status !== undefined ? { status: input.status } : {}),
            });
        },
        async getRule(identity, requestId, companyIdValue, ruleIdValue) {
            const companyId = normalizeUuid(companyIdValue, 'companyId');
            const ruleId = normalizeUuid(ruleIdValue, 'ruleId');
            assertRuleReadAccess(identity, companyId);
            const context = createRepositoryContext(identity, requestId, companyId);
            const rule = await repository.getRule(context, companyId, ruleId);
            if (rule === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_NOT_FOUND', 404, 'The duplicate-protection rule was not found.');
            }
            return rule;
        },
        async updateRule(identity, requestId, companyIdValue, ruleIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'companyId');
            const ruleId = normalizeUuid(ruleIdValue, 'ruleId');
            assertRuleWriteAccess(identity, companyId);
            const context = createRepositoryContext(identity, requestId, companyId);
            const current = await repository.getRule(context, companyId, ruleId);
            if (current === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_NOT_FOUND', 404, 'The duplicate-protection rule was not found.');
            }
            if (current.status === 'archived') {
                throw new ApiHttpError('DUPLICATE_RULE_ARCHIVED', 409, 'Archived duplicate-protection rules are immutable.');
            }
            const status = input.status ?? current.status;
            assertStatusTransition(current.status, status);
            const writeInput = normalizeRuleWriteInput({
                networkAccountId: current.networkAccountId,
                offerId: current.offerId,
                name: input.name ?? current.name,
                lockMode: input.lockMode ?? current.lockMode,
                sessionWindowSeconds: input.sessionWindowSeconds === undefined
                    ? current.sessionWindowSeconds
                    : input.sessionWindowSeconds,
                lockDurationSeconds: input.lockDurationSeconds === undefined
                    ? current.lockDurationSeconds
                    : input.lockDurationSeconds,
                lockUntil: input.lockUntil === undefined ? current.lockUntil : input.lockUntil,
                offerExpiryAt: input.offerExpiryAt === undefined ? current.offerExpiryAt : input.offerExpiryAt,
                matchVisitorId: input.matchVisitorId ?? current.matchVisitorId,
                matchIpAndUserAgent: input.matchIpAndUserAgent ?? current.matchIpAndUserAgent,
                rapidRepeatWindowSeconds: input.rapidRepeatWindowSeconds ?? current.rapidRepeatWindowSeconds,
                rapidRepeatThreshold: input.rapidRepeatThreshold ?? current.rapidRepeatThreshold,
                status,
            });
            if (ruleInputsEqual(current, writeInput)) {
                throw new ApiHttpError('DUPLICATE_RULE_UNCHANGED', 409, 'The duplicate-protection rule is unchanged.');
            }
            const updated = await repository.updateRule(context, current, writeInput);
            if (updated === undefined) {
                throw new ApiHttpError('DUPLICATE_RULE_UPDATE_CONFLICT', 409, 'The duplicate-protection rule was modified by another request.');
            }
            return updated;
        },
        async listFraudClicks(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'companyId');
            assertFraudReadAccess(identity, companyId);
            const context = createRepositoryContext(identity, requestId, companyId);
            const isPublisher = !isPlatformSuperAdmin(identity.subject) && identity.companyMembership?.role === 'publisher';
            return repository.listFraudClicks(context, companyId, {
                ...(input.networkAccountId !== undefined
                    ? {
                        networkAccountId: normalizeUuid(input.networkAccountId, 'networkAccountId'),
                    }
                    : {}),
                ...(input.offerId !== undefined
                    ? {
                        offerId: normalizeUuid(input.offerId, 'offerId'),
                    }
                    : {}),
                ...(input.duplicateDecision !== undefined
                    ? {
                        duplicateDecision: input.duplicateDecision,
                    }
                    : {}),
                ...(input.fraudRiskLevel !== undefined
                    ? {
                        fraudRiskLevel: input.fraudRiskLevel,
                    }
                    : {}),
                ...(isPublisher ? { visibleToUserId: identity.actor.userId } : {}),
                limit: normalizeInteger(input.limit ?? 100, 'limit', 1, MAX_RESULT_LIMIT),
            });
        },
    });
}
//# sourceMappingURL=duplicate-fraud.service.js.map