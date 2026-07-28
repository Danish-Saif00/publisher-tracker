import { randomBytes } from 'node:crypto';
import { assertCompanyRole, isPlatformSuperAdmin } from '@affiliate-tracker/auth';
import { ApiHttpError } from './api.errors.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUERY_PARAMETER_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MAX_QUERY_PARAMETERS = 50;
const MAX_QUERY_PARAMETER_KEY_LENGTH = 64;
const MAX_QUERY_PARAMETER_VALUE_LENGTH = 500;
const ALLOWED_STATUS_TRANSITIONS = {
    draft: ['active', 'archived'],
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
function normalizeCustomSlug(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue.length < 2 ||
        normalizedValue.length > 80 ||
        !CUSTOM_SLUG_PATTERN.test(normalizedValue)) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'customSlug must contain 2 to 80 lowercase letters, numbers, or single hyphens.');
    }
    return normalizedValue;
}
function normalizeDestinationUrl(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < 8 || normalizedValue.length > 2048) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'destinationUrl must contain 8 to 2048 characters.');
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(normalizedValue);
    }
    catch (error) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'destinationUrl must be a valid URL.', {
            cause: error,
        });
    }
    if ((parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
        parsedUrl.username.length > 0 ||
        parsedUrl.password.length > 0 ||
        parsedUrl.hostname.length === 0) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'destinationUrl must be an HTTP or HTTPS URL without embedded credentials.');
    }
    return parsedUrl.toString();
}
function containsControlCharacter(value) {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    });
}
function normalizeQueryParameters(value) {
    if (value === undefined) {
        return Object.freeze({});
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_QUERY_PARAMETERS) {
        throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `queryParameters cannot contain more than ${String(MAX_QUERY_PARAMETERS)} entries.`);
    }
    const normalizedEntries = entries
        .map(([key, parameterValue]) => {
        const normalizedKey = key.trim();
        if (normalizedKey.length === 0 ||
            normalizedKey.length > MAX_QUERY_PARAMETER_KEY_LENGTH ||
            !QUERY_PARAMETER_KEY_PATTERN.test(normalizedKey)) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Each queryParameters key must contain 1 to 64 letters, numbers, dots, underscores, or hyphens.');
        }
        if (typeof parameterValue !== 'string' ||
            parameterValue.length > MAX_QUERY_PARAMETER_VALUE_LENGTH ||
            containsControlCharacter(parameterValue)) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Each queryParameters value must be a control-character-free string of at most 500 characters.');
        }
        return [normalizedKey, parameterValue];
    })
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    const normalizedParameters = {};
    for (const [key, parameterValue] of normalizedEntries) {
        if (Object.hasOwn(normalizedParameters, key)) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `queryParameters contains the duplicate normalized key "${key}".`);
        }
        normalizedParameters[key] = parameterValue;
    }
    return Object.freeze(normalizedParameters);
}
function normalizeStatus(value) {
    switch (value) {
        case 'draft':
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Tracking-link status is invalid.');
    }
}
function createRepositoryContext(identity, requestId, companyId) {
    return {
        actorUserId: identity.actor.userId,
        requestId,
        companyId,
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
function isCompanyAdmin(identity, companyId) {
    return (isPlatformSuperAdmin(identity.subject) ||
        (identity.companyMembership?.companyId === companyId &&
            identity.companyMembership.status === 'active' &&
            identity.companyMembership.role === 'company_admin'));
}
function resolveVisibleToUserId(identity) {
    return identity.companyMembership?.role === 'publisher' ? identity.actor.userId : undefined;
}
function resolveOwnerMembershipId(identity, companyId, requestedOwnerMembershipId) {
    if (isCompanyAdmin(identity, companyId)) {
        if (requestedOwnerMembershipId === undefined) {
            throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'ownerMembershipId is required when a Company Admin creates a tracking link.');
        }
        return normalizeUuid(requestedOwnerMembershipId, 'Owner membership ID');
    }
    const membership = identity.companyMembership;
    if (membership === undefined) {
        throw new ApiHttpError('TRACKING_LINK_OWNER_FORBIDDEN', 403, 'The authenticated user cannot own a tracking link in this company.');
    }
    if (membership.companyId !== companyId ||
        membership.status !== 'active' ||
        (membership.role !== 'manager' && membership.role !== 'publisher')) {
        throw new ApiHttpError('TRACKING_LINK_OWNER_FORBIDDEN', 403, 'The authenticated user cannot own a tracking link in this company.');
    }
    if (requestedOwnerMembershipId !== undefined) {
        const normalizedOwnerMembershipId = normalizeUuid(requestedOwnerMembershipId, 'Owner membership ID');
        if (normalizedOwnerMembershipId !== membership.membershipId) {
            throw new ApiHttpError('TRACKING_LINK_OWNER_FORBIDDEN', 403, 'Managers and Publishers can create tracking links only for their own membership.');
        }
    }
    return membership.membershipId;
}
function assertCanModifyLink(identity, companyId, trackingLink) {
    if (isCompanyAdmin(identity, companyId)) {
        return;
    }
    if (trackingLink.ownerUserId !== identity.actor.userId) {
        throw new ApiHttpError('TRACKING_LINK_OWNER_FORBIDDEN', 403, 'Managers and Publishers can modify only their own tracking links.');
    }
}
async function requireActiveCompany(repository, context, companyId) {
    const company = await repository.getCompany(context, companyId);
    if (company === undefined) {
        throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
    }
    if (company.status !== 'active') {
        throw new ApiHttpError('TRACKING_LINK_COMPANY_INACTIVE', 409, 'Tracking links require an active company.');
    }
    return company;
}
async function requireActiveOffer(repository, context, companyId, offerId) {
    const offer = await repository.getOffer(context, companyId, offerId);
    if (offer?.status !== 'active') {
        throw new ApiHttpError('TRACKING_LINK_OFFER_INVALID', 409, 'The tracking link requires an active offer from the same company.');
    }
    return offer;
}
async function requireActiveDomain(repository, context, companyId, trackingDomainId) {
    const domain = await repository.getTrackingDomain(context, companyId, trackingDomainId);
    if (domain?.status !== 'active') {
        throw new ApiHttpError('TRACKING_LINK_DOMAIN_INVALID', 409, 'The tracking link requires an active verified tracking domain from the same company.');
    }
    return domain;
}
async function requireActiveOwner(repository, context, companyId, ownerMembershipId) {
    const owner = await repository.getOwnerMembership(context, companyId, ownerMembershipId);
    if (owner?.status !== 'active') {
        throw new ApiHttpError('TRACKING_LINK_OWNER_INVALID', 409, 'The tracking-link owner must be an active Manager or Publisher in the same company.');
    }
    return owner;
}
async function requireActiveAssignment(repository, context, companyId, offerId, ownerMembershipId) {
    const assignment = await repository.getOfferAssignment(context, companyId, offerId, ownerMembershipId);
    if (assignment?.status !== 'active') {
        throw new ApiHttpError('TRACKING_LINK_ASSIGNMENT_INVALID', 409, 'The tracking-link owner requires an active assignment to the selected offer.');
    }
}
async function requireActivationDependencies(repository, context, companyId, offerId, trackingDomainId, ownerMembershipId) {
    const [offer, domain, owner] = await Promise.all([
        requireActiveOffer(repository, context, companyId, offerId),
        requireActiveDomain(repository, context, companyId, trackingDomainId),
        requireActiveOwner(repository, context, companyId, ownerMembershipId),
    ]);
    await requireActiveAssignment(repository, context, companyId, offerId, ownerMembershipId);
    return {
        offer,
        domain,
        owner,
    };
}
function generateTrackingCode() {
    return randomBytes(8).toString('hex');
}
function queryParametersEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
export function createTrackingLinksService(repository) {
    return Object.freeze({
        async createTrackingLink(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
                'publisher',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireActiveCompany(repository, context, companyId);
            const offerId = normalizeUuid(input.offerId, 'Offer ID');
            const trackingDomainId = normalizeUuid(input.trackingDomainId, 'Tracking domain ID');
            const ownerMembershipId = resolveOwnerMembershipId(identity, companyId, input.ownerMembershipId);
            const dependencies = await requireActivationDependencies(repository, context, companyId, offerId, trackingDomainId, ownerMembershipId);
            const status = input.status === undefined ? 'draft' : normalizeStatus(input.status);
            if (status !== 'draft' && status !== 'active') {
                throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'A new tracking link must start in draft or active status.');
            }
            const writeInput = Object.freeze({
                offerId,
                trackingDomainId,
                ownerMembershipId,
                trackingCode: generateTrackingCode(),
                customSlug: input.customSlug === undefined ? null : normalizeCustomSlug(input.customSlug),
                destinationUrl: input.destinationUrl === undefined
                    ? normalizeDestinationUrl(dependencies.offer.destinationUrl)
                    : normalizeDestinationUrl(input.destinationUrl),
                queryParameters: normalizeQueryParameters(input.queryParameters),
                status,
            });
            const trackingLink = await repository.createTrackingLink(context, companyId, writeInput);
            if (trackingLink === undefined) {
                throw new ApiHttpError('TRACKING_LINK_CONFLICT', 409, 'The tracking code or custom slug conflicts with an existing tracking link.');
            }
            return trackingLink;
        },
        async listTrackingLinks(identity, requestId, companyIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
                'publisher',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireActiveCompany(repository, context, companyId);
            return repository.listTrackingLinks(context, companyId, {
                ...(input.offerId !== undefined
                    ? {
                        offerId: normalizeUuid(input.offerId, 'Offer ID'),
                    }
                    : {}),
                ...(input.ownerMembershipId !== undefined
                    ? {
                        ownerMembershipId: normalizeUuid(input.ownerMembershipId, 'Owner membership ID'),
                    }
                    : {}),
                ...(input.status !== undefined
                    ? {
                        status: normalizeStatus(input.status),
                    }
                    : {}),
                ...(resolveVisibleToUserId(identity) !== undefined
                    ? {
                        visibleToUserId: identity.actor.userId,
                    }
                    : {}),
            });
        },
        async getTrackingLink(identity, requestId, companyIdValue, linkIdValue) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const linkId = normalizeUuid(linkIdValue, 'Tracking link ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
                'publisher',
            ]);
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireActiveCompany(repository, context, companyId);
            const trackingLink = await repository.getTrackingLink(context, companyId, linkId, resolveVisibleToUserId(identity));
            if (trackingLink === undefined) {
                throw new ApiHttpError('TRACKING_LINK_NOT_FOUND', 404, 'The requested tracking link was not found.');
            }
            return trackingLink;
        },
        async updateTrackingLink(identity, requestId, companyIdValue, linkIdValue, input) {
            const companyId = normalizeUuid(companyIdValue, 'Company ID');
            const linkId = normalizeUuid(linkIdValue, 'Tracking link ID');
            assertCompanyRequestContext(identity, companyId);
            assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
                'company_admin',
                'manager',
                'publisher',
            ]);
            if (input.trackingDomainId === undefined &&
                input.customSlug === undefined &&
                input.destinationUrl === undefined &&
                input.queryParameters === undefined &&
                input.status === undefined) {
                throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'At least one tracking-link field must be provided.');
            }
            const context = createRepositoryContext(identity, requestId, companyId);
            await requireActiveCompany(repository, context, companyId);
            const current = await repository.getTrackingLink(context, companyId, linkId);
            if (current === undefined) {
                throw new ApiHttpError('TRACKING_LINK_NOT_FOUND', 404, 'The requested tracking link was not found.');
            }
            assertCanModifyLink(identity, companyId, current);
            if (current.status === 'archived') {
                throw new ApiHttpError('TRACKING_LINK_ARCHIVED', 409, 'An archived tracking link is immutable.');
            }
            const trackingDomainId = input.trackingDomainId === undefined
                ? current.trackingDomainId
                : normalizeUuid(input.trackingDomainId, 'Tracking domain ID');
            const customSlug = input.customSlug === undefined
                ? current.customSlug
                : input.customSlug === null
                    ? null
                    : normalizeCustomSlug(input.customSlug);
            const destinationUrl = input.destinationUrl === undefined
                ? current.destinationUrl
                : normalizeDestinationUrl(input.destinationUrl);
            const queryParameters = input.queryParameters === undefined
                ? current.queryParameters
                : normalizeQueryParameters(input.queryParameters);
            const status = input.status === undefined ? current.status : normalizeStatus(input.status);
            if (status !== current.status &&
                !ALLOWED_STATUS_TRANSITIONS[current.status].includes(status)) {
                throw new ApiHttpError('TRACKING_LINK_STATUS_TRANSITION_INVALID', 409, `Tracking-link status cannot transition from ${current.status} to ${status}.`);
            }
            if (status === 'active' || trackingDomainId !== current.trackingDomainId) {
                await requireActivationDependencies(repository, context, companyId, current.offerId, trackingDomainId, current.ownerMembershipId);
            }
            if (trackingDomainId === current.trackingDomainId &&
                customSlug === current.customSlug &&
                destinationUrl === current.destinationUrl &&
                queryParametersEqual(queryParameters, current.queryParameters) &&
                status === current.status) {
                throw new ApiHttpError('TRACKING_LINK_UNCHANGED', 409, 'The tracking-link update does not change any values.');
            }
            const writeInput = Object.freeze({
                offerId: current.offerId,
                trackingDomainId,
                ownerMembershipId: current.ownerMembershipId,
                trackingCode: current.trackingCode,
                customSlug,
                destinationUrl,
                queryParameters,
                status,
            });
            const trackingLink = await repository.updateTrackingLink(context, current, writeInput);
            if (trackingLink === undefined) {
                throw new ApiHttpError('TRACKING_LINK_UPDATE_CONFLICT', 409, 'The tracking link changed concurrently or the custom slug conflicts with another link.');
            }
            return trackingLink;
        },
    });
}
//# sourceMappingURL=tracking-links.service.js.map