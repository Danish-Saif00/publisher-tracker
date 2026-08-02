import { randomBytes } from 'node:crypto';

import { assertTenantCompanyRole } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { TrackingLinksRepository } from './tracking-links.repository.js';
import type {
  CreateTrackingLinkInput,
  DeleteTrackingLinkResult,
  ListTrackingLinksInput,
  TrackingLinkCompanyRecord,
  TrackingLinkDependencySummary,
  TrackingLinkDomainRecord,
  TrackingLinkOfferRecord,
  TrackingLinkOwnerRecord,
  TrackingLinkQueryParameters,
  TrackingLinkRecord,
  TrackingLinksRepositoryContext,
  TrackingLinkStatus,
  TrackingLinkWriteInput,
  UpdateTrackingLinkInput,
} from './tracking-links.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUERY_PARAMETER_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MAX_QUERY_PARAMETERS = 50;
const MAX_QUERY_PARAMETER_KEY_LENGTH = 64;
const MAX_QUERY_PARAMETER_VALUE_LENGTH = 500;

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<TrackingLinkStatus, readonly TrackingLinkStatus[]>
> = {
  draft: ['active'],
  active: ['paused'],
  paused: ['active'],
  archived: [],
};

export interface TrackingLinksService {
  createTrackingLink(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateTrackingLinkInput,
  ): Promise<TrackingLinkRecord>;

  listTrackingLinks(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: ListTrackingLinksInput,
  ): Promise<readonly TrackingLinkRecord[]>;

  getTrackingLink(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    linkId: string,
  ): Promise<TrackingLinkRecord>;

  cloneTrackingLink(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    linkId: string,
  ): Promise<TrackingLinkRecord>;

  archiveTrackingLink(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    linkId: string,
  ): Promise<TrackingLinkRecord>;

  deleteTrackingLink(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    linkId: string,
  ): Promise<DeleteTrackingLinkResult>;

  updateTrackingLink(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    linkId: string,
    input: UpdateTrackingLinkInput,
  ): Promise<TrackingLinkRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeCustomSlug(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 2 ||
    normalizedValue.length > 80 ||
    !CUSTOM_SLUG_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'customSlug must contain 2 to 80 lowercase letters, numbers, or single hyphens.',
    );
  }

  return normalizedValue;
}

function normalizeDestinationUrl(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length < 8 || normalizedValue.length > 2048) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'destinationUrl must contain 8 to 2048 characters.',
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch (error: unknown) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'destinationUrl must be a valid URL.', {
      cause: error,
    });
  }

  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0 ||
    parsedUrl.hostname.length === 0
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'destinationUrl must be an HTTP or HTTPS URL without embedded credentials.',
    );
  }

  return parsedUrl.toString();
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);

    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}
function normalizeQueryParameters(
  value: Readonly<Record<string, string>> | undefined,
): TrackingLinkQueryParameters {
  if (value === undefined) {
    return Object.freeze({});
  }

  const entries = Object.entries(value);

  if (entries.length > MAX_QUERY_PARAMETERS) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `queryParameters cannot contain more than ${String(MAX_QUERY_PARAMETERS)} entries.`,
    );
  }

  const normalizedEntries = entries
    .map(([key, parameterValue]) => {
      const normalizedKey = key.trim();

      if (
        normalizedKey.length === 0 ||
        normalizedKey.length > MAX_QUERY_PARAMETER_KEY_LENGTH ||
        !QUERY_PARAMETER_KEY_PATTERN.test(normalizedKey)
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'Each queryParameters key must contain 1 to 64 letters, numbers, dots, underscores, or hyphens.',
        );
      }

      if (
        typeof parameterValue !== 'string' ||
        parameterValue.length > MAX_QUERY_PARAMETER_VALUE_LENGTH ||
        containsControlCharacter(parameterValue)
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'Each queryParameters value must be a control-character-free string of at most 500 characters.',
        );
      }

      return [normalizedKey, parameterValue] as const;
    })
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  const normalizedParameters: Record<string, string> = {};

  for (const [key, parameterValue] of normalizedEntries) {
    if (Object.hasOwn(normalizedParameters, key)) {
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        `queryParameters contains the duplicate normalized key "${key}".`,
      );
    }

    normalizedParameters[key] = parameterValue;
  }

  return Object.freeze(normalizedParameters);
}

function normalizeStatus(value: TrackingLinkStatus): TrackingLinkStatus {
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

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId: string,
): TrackingLinksRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    companyId,
  };
}

function assertCompanyRequestContext(identity: ResolvedApiIdentity, companyId: string): void {
  if (identity.requestedCompanyId === undefined) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_REQUIRED',
      400,
      'The x-company-id header is required for this operation.',
    );
  }

  if (identity.requestedCompanyId !== companyId) {
    throw new ApiHttpError(
      'COMPANY_CONTEXT_MISMATCH',
      400,
      'The x-company-id header must match the company route parameter.',
    );
  }
}

function isCompanyAdmin(identity: ResolvedApiIdentity, companyId: string): boolean {
  return (
    identity.subject.platformRole !== 'platform_super_admin' &&
    identity.companyMembership?.companyId === companyId &&
    identity.companyMembership.status === 'active' &&
    identity.companyMembership.role === 'company_admin'
  );
}

function resolveVisibleToUserId(identity: ResolvedApiIdentity): string | undefined {
  return identity.companyMembership?.role === 'publisher' ? identity.actor.userId : undefined;
}

function isPublisher(identity: ResolvedApiIdentity, companyId: string): boolean {
  const membership = identity.companyMembership;

  return (
    membership?.companyId === companyId &&
    membership.status === 'active' &&
    membership.role === 'publisher'
  );
}

function assertPublisherTrackingDomain(
  identity: ResolvedApiIdentity,
  companyId: string,
  offer: TrackingLinkOfferRecord,
  trackingDomainId: string,
): void {
  if (!isPublisher(identity, companyId)) {
    return;
  }

  if (offer.trackingDomainId === null || offer.trackingDomainId !== trackingDomainId) {
    throw new ApiHttpError(
      'TRACKING_LINK_DOMAIN_FORBIDDEN',
      403,
      'Publishers can use only the active tracking domain configured for their assigned Offer.',
    );
  }
}

function assertPublisherDestinationOverride(
  identity: ResolvedApiIdentity,
  companyId: string,
  requestedDestinationUrl: string | undefined,
): void {
  if (!isPublisher(identity, companyId) || requestedDestinationUrl === undefined) {
    return;
  }

  throw new ApiHttpError(
    'TRACKING_LINK_DESTINATION_OVERRIDE_FORBIDDEN',
    403,
    'Publishers cannot override an assigned Offer destination URL.',
  );
}

function resolveOwnerMembershipId(
  identity: ResolvedApiIdentity,
  companyId: string,
  requestedOwnerMembershipId: string | undefined,
): string {
  if (isCompanyAdmin(identity, companyId)) {
    if (requestedOwnerMembershipId === undefined) {
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'ownerMembershipId is required when a Company Admin creates a tracking link.',
      );
    }

    return normalizeUuid(requestedOwnerMembershipId, 'Owner membership ID');
  }

  const membership = identity.companyMembership;

  if (membership === undefined) {
    throw new ApiHttpError(
      'TRACKING_LINK_OWNER_FORBIDDEN',
      403,
      'The authenticated user cannot own a tracking link in this company.',
    );
  }

  if (
    membership.companyId !== companyId ||
    membership.status !== 'active' ||
    (membership.role !== 'manager' && membership.role !== 'publisher')
  ) {
    throw new ApiHttpError(
      'TRACKING_LINK_OWNER_FORBIDDEN',
      403,
      'The authenticated user cannot own a tracking link in this company.',
    );
  }

  if (requestedOwnerMembershipId !== undefined) {
    const normalizedOwnerMembershipId = normalizeUuid(
      requestedOwnerMembershipId,
      'Owner membership ID',
    );

    if (normalizedOwnerMembershipId !== membership.membershipId) {
      throw new ApiHttpError(
        'TRACKING_LINK_OWNER_FORBIDDEN',
        403,
        'Managers and Publishers can create tracking links only for their own membership.',
      );
    }
  }

  return membership.membershipId;
}

function assertCanModifyLink(
  identity: ResolvedApiIdentity,
  companyId: string,
  trackingLink: TrackingLinkRecord,
): void {
  if (isCompanyAdmin(identity, companyId)) {
    return;
  }

  if (trackingLink.ownerUserId !== identity.actor.userId) {
    throw new ApiHttpError(
      'TRACKING_LINK_OWNER_FORBIDDEN',
      403,
      'Managers and Publishers can modify only their own tracking links.',
    );
  }
}

async function requireActiveCompany(
  repository: TrackingLinksRepository,
  context: TrackingLinksRepositoryContext,
  companyId: string,
): Promise<TrackingLinkCompanyRecord> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  if (company.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_LINK_COMPANY_INACTIVE',
      409,
      'Tracking links require an active company.',
    );
  }

  return company;
}

async function requireActiveOffer(
  repository: TrackingLinksRepository,
  context: TrackingLinksRepositoryContext,
  companyId: string,
  offerId: string,
): Promise<TrackingLinkOfferRecord> {
  const offer = await repository.getOffer(context, companyId, offerId);

  if (offer?.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_LINK_OFFER_INVALID',
      409,
      'The tracking link requires an active offer from the same company.',
    );
  }

  return offer;
}

async function requireActiveDomain(
  repository: TrackingLinksRepository,
  context: TrackingLinksRepositoryContext,
  companyId: string,
  trackingDomainId: string,
): Promise<TrackingLinkDomainRecord> {
  const domain = await repository.getTrackingDomain(context, companyId, trackingDomainId);

  if (domain?.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_LINK_DOMAIN_INVALID',
      409,
      'The tracking link requires an active verified tracking domain from the same company.',
    );
  }

  return domain;
}

async function requireActiveOwner(
  repository: TrackingLinksRepository,
  context: TrackingLinksRepositoryContext,
  companyId: string,
  ownerMembershipId: string,
): Promise<TrackingLinkOwnerRecord> {
  const owner = await repository.getOwnerMembership(context, companyId, ownerMembershipId);

  if (owner?.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_LINK_OWNER_INVALID',
      409,
      'The tracking-link owner must be an active Manager or Publisher in the same company.',
    );
  }

  return owner;
}

async function requireActiveAssignment(
  repository: TrackingLinksRepository,
  context: TrackingLinksRepositoryContext,
  companyId: string,
  offerId: string,
  ownerMembershipId: string,
): Promise<void> {
  const assignment = await repository.getOfferAssignment(
    context,
    companyId,
    offerId,
    ownerMembershipId,
  );

  if (assignment?.status !== 'active') {
    throw new ApiHttpError(
      'TRACKING_LINK_ASSIGNMENT_INVALID',
      409,
      'The tracking-link owner requires an active assignment to the selected offer.',
    );
  }
}

async function requireActivationDependencies(
  repository: TrackingLinksRepository,
  context: TrackingLinksRepositoryContext,
  companyId: string,
  offerId: string,
  trackingDomainId: string,
  ownerMembershipId: string,
): Promise<{
  readonly offer: TrackingLinkOfferRecord;
  readonly domain: TrackingLinkDomainRecord;
  readonly owner: TrackingLinkOwnerRecord;
}> {
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

function generateTrackingCode(): string {
  return randomBytes(8).toString('hex');
}

function queryParametersEqual(
  left: TrackingLinkQueryParameters,
  right: TrackingLinkQueryParameters,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasTrackingLinkDependencies(summary: TrackingLinkDependencySummary): boolean {
  return summary.trackingClickCount > 0 || summary.conversionCount > 0;
}

function formatTrackingLinkDependencySummary(summary: TrackingLinkDependencySummary): string {
  return [
    `tracking clicks=${String(summary.trackingClickCount)}`,
    `conversions=${String(summary.conversionCount)}`,
  ].join(', ');
}

export function createTrackingLinksService(
  repository: TrackingLinksRepository,
): TrackingLinksService {
  return Object.freeze<TrackingLinksService>({
    async createTrackingLink(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const offerId = normalizeUuid(input.offerId, 'Offer ID');
      const trackingDomainId = normalizeUuid(input.trackingDomainId, 'Tracking domain ID');
      const ownerMembershipId = resolveOwnerMembershipId(
        identity,
        companyId,
        input.ownerMembershipId,
      );

      assertPublisherDestinationOverride(identity, companyId, input.destinationUrl);

      const dependencies = await requireActivationDependencies(
        repository,
        context,
        companyId,
        offerId,
        trackingDomainId,
        ownerMembershipId,
      );

      assertPublisherTrackingDomain(identity, companyId, dependencies.offer, trackingDomainId);

      const status = input.status === undefined ? 'draft' : normalizeStatus(input.status);

      if (status !== 'draft' && status !== 'active') {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'A new tracking link must start in draft or active status.',
        );
      }

      const writeInput: TrackingLinkWriteInput = Object.freeze({
        offerId,
        trackingDomainId,
        ownerMembershipId,
        trackingCode: generateTrackingCode(),
        customSlug: input.customSlug === undefined ? null : normalizeCustomSlug(input.customSlug),
        destinationUrl:
          input.destinationUrl === undefined
            ? normalizeDestinationUrl(dependencies.offer.destinationUrl)
            : normalizeDestinationUrl(input.destinationUrl),
        queryParameters: normalizeQueryParameters(input.queryParameters),
        source: 'manual',
        status,
      });

      const trackingLink = await repository.createTrackingLink(context, companyId, writeInput);

      if (trackingLink === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_CONFLICT',
          409,
          'The tracking code or custom slug conflicts with an existing tracking link.',
        );
      }

      return trackingLink;
    },

    async listTrackingLinks(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
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
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const trackingLink = await repository.getTrackingLink(
        context,
        companyId,
        linkId,
        resolveVisibleToUserId(identity),
      );

      if (trackingLink === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_NOT_FOUND',
          404,
          'The requested tracking link was not found.',
        );
      }

      return trackingLink;
    },

    async cloneTrackingLink(identity, requestId, companyIdValue, linkIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const linkId = normalizeUuid(linkIdValue, 'Tracking link ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await repository.getTrackingLink(
        context,
        companyId,
        linkId,
        resolveVisibleToUserId(identity),
      );

      if (current === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_NOT_FOUND',
          404,
          'The requested tracking link was not found.',
        );
      }

      assertCanModifyLink(identity, companyId, current);

      const dependencies = await requireActivationDependencies(
        repository,
        context,
        companyId,
        current.offerId,
        current.trackingDomainId,
        current.ownerMembershipId,
      );

      assertPublisherTrackingDomain(
        identity,
        companyId,
        dependencies.offer,
        current.trackingDomainId,
      );

      if (
        isPublisher(identity, companyId) &&
        current.destinationUrl !== normalizeDestinationUrl(dependencies.offer.destinationUrl)
      ) {
        throw new ApiHttpError(
          'TRACKING_LINK_DESTINATION_OVERRIDE_FORBIDDEN',
          403,
          'Publishers can clone only links that use the assigned Offer destination URL.',
        );
      }

      const trackingLink = await repository.cloneTrackingLink(
        context,
        current,
        generateTrackingCode(),
      );

      if (trackingLink === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_CLONE_CONFLICT',
          409,
          'The tracking link changed or the generated clone identity conflicted before cloning completed.',
        );
      }

      return trackingLink;
    },

    async archiveTrackingLink(identity, requestId, companyIdValue, linkIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const linkId = normalizeUuid(linkIdValue, 'Tracking link ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await repository.getTrackingLink(
        context,
        companyId,
        linkId,
        resolveVisibleToUserId(identity),
      );

      if (current === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_NOT_FOUND',
          404,
          'The requested tracking link was not found.',
        );
      }

      assertCanModifyLink(identity, companyId, current);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_LINK_ARCHIVED',
          409,
          'The tracking link is already archived.',
        );
      }

      const trackingLink = await repository.archiveTrackingLink(context, current);

      if (trackingLink === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_ARCHIVE_CONFLICT',
          409,
          'The tracking link changed before the archive operation completed.',
        );
      }

      return trackingLink;
    },

    async deleteTrackingLink(identity, requestId, companyIdValue, linkIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const linkId = normalizeUuid(linkIdValue, 'Tracking link ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await repository.getTrackingLink(context, companyId, linkId);

      if (current === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_NOT_FOUND',
          404,
          'The requested tracking link was not found.',
        );
      }

      if (current.status !== 'archived') {
        throw new ApiHttpError(
          'TRACKING_LINK_DELETE_REQUIRES_ARCHIVE',
          409,
          'The tracking link must be archived before permanent deletion.',
        );
      }

      if (current.source !== 'manual') {
        throw new ApiHttpError(
          'TRACKING_LINK_GENERATED_DELETE_FORBIDDEN',
          409,
          'Assignment-generated tracking links are retained to prevent automatic recreation.',
        );
      }

      const dependencies = await repository.getTrackingLinkDependencySummary(
        context,
        companyId,
        linkId,
      );

      if (dependencies === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_NOT_FOUND',
          404,
          'The requested tracking link was not found.',
        );
      }

      if (hasTrackingLinkDependencies(dependencies)) {
        throw new ApiHttpError(
          'TRACKING_LINK_DELETE_BLOCKED',
          409,
          `The tracking link cannot be permanently deleted while dependent records exist: ${formatTrackingLinkDependencySummary(
            dependencies,
          )}.`,
        );
      }

      const deleted = await repository.deleteTrackingLink(context, current);

      if (!deleted) {
        throw new ApiHttpError(
          'TRACKING_LINK_DELETE_CONFLICT',
          409,
          'The tracking link changed or gained dependent records before deletion completed.',
        );
      }

      return Object.freeze({ id: linkId, deleted: true as const });
    },

    async updateTrackingLink(identity, requestId, companyIdValue, linkIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const linkId = normalizeUuid(linkIdValue, 'Tracking link ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      if (
        input.trackingDomainId === undefined &&
        input.customSlug === undefined &&
        input.destinationUrl === undefined &&
        input.queryParameters === undefined &&
        input.status === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one tracking-link field must be provided.',
        );
      }

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await repository.getTrackingLink(
        context,
        companyId,
        linkId,
        resolveVisibleToUserId(identity),
      );

      if (current === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_NOT_FOUND',
          404,
          'The requested tracking link was not found.',
        );
      }

      assertCanModifyLink(identity, companyId, current);

      if (current.status === 'archived') {
        throw new ApiHttpError(
          'TRACKING_LINK_ARCHIVED',
          409,
          'An archived tracking link is immutable.',
        );
      }

      const trackingDomainId =
        input.trackingDomainId === undefined
          ? current.trackingDomainId
          : normalizeUuid(input.trackingDomainId, 'Tracking domain ID');

      const customSlug =
        input.customSlug === undefined
          ? current.customSlug
          : input.customSlug === null
            ? null
            : normalizeCustomSlug(input.customSlug);

      const destinationUrl =
        input.destinationUrl === undefined
          ? current.destinationUrl
          : normalizeDestinationUrl(input.destinationUrl);

      if (isPublisher(identity, companyId)) {
        if (input.trackingDomainId !== undefined && trackingDomainId !== current.trackingDomainId) {
          throw new ApiHttpError(
            'TRACKING_LINK_DOMAIN_FORBIDDEN',
            403,
            'Publishers cannot move a tracking link to another tracking domain.',
          );
        }

        if (input.destinationUrl !== undefined && destinationUrl !== current.destinationUrl) {
          throw new ApiHttpError(
            'TRACKING_LINK_DESTINATION_OVERRIDE_FORBIDDEN',
            403,
            'Publishers cannot override an assigned Offer destination URL.',
          );
        }
      }

      const queryParameters =
        input.queryParameters === undefined
          ? current.queryParameters
          : normalizeQueryParameters(input.queryParameters);

      const status = input.status === undefined ? current.status : normalizeStatus(input.status);

      if (
        status !== current.status &&
        !ALLOWED_STATUS_TRANSITIONS[current.status].includes(status)
      ) {
        throw new ApiHttpError(
          'TRACKING_LINK_STATUS_TRANSITION_INVALID',
          409,
          `Tracking-link status cannot transition from ${current.status} to ${status}.`,
        );
      }

      if (
        isPublisher(identity, companyId) ||
        status === 'active' ||
        trackingDomainId !== current.trackingDomainId
      ) {
        const dependencies = await requireActivationDependencies(
          repository,
          context,
          companyId,
          current.offerId,
          trackingDomainId,
          current.ownerMembershipId,
        );

        assertPublisherTrackingDomain(identity, companyId, dependencies.offer, trackingDomainId);

        if (
          isPublisher(identity, companyId) &&
          destinationUrl !== normalizeDestinationUrl(dependencies.offer.destinationUrl)
        ) {
          throw new ApiHttpError(
            'TRACKING_LINK_DESTINATION_OVERRIDE_FORBIDDEN',
            403,
            'Publishers can use only the destination URL configured for their assigned Offer.',
          );
        }
      }

      if (
        trackingDomainId === current.trackingDomainId &&
        customSlug === current.customSlug &&
        destinationUrl === current.destinationUrl &&
        queryParametersEqual(queryParameters, current.queryParameters) &&
        status === current.status
      ) {
        throw new ApiHttpError(
          'TRACKING_LINK_UNCHANGED',
          409,
          'The tracking-link update does not change any values.',
        );
      }

      const writeInput: TrackingLinkWriteInput = Object.freeze({
        offerId: current.offerId,
        trackingDomainId,
        ownerMembershipId: current.ownerMembershipId,
        trackingCode: current.trackingCode,
        customSlug,
        destinationUrl,
        queryParameters,
        source: current.source,
        status,
      });

      const trackingLink = await repository.updateTrackingLink(context, current, writeInput);

      if (trackingLink === undefined) {
        throw new ApiHttpError(
          'TRACKING_LINK_UPDATE_CONFLICT',
          409,
          'The tracking link changed concurrently or the custom slug conflicts with another link.',
        );
      }

      return trackingLink;
    },
  });
}

export type {
  CreateTrackingLinkInput,
  DeleteTrackingLinkResult,
  ListTrackingLinksInput,
  TrackingLinkRecord,
  UpdateTrackingLinkInput,
} from './tracking-links.types.js';
