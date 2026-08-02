import { assertTenantCompanyRole } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { OffersPayoutRepository } from './offers-payout.repository.js';
import type {
  CreateOfferAssignmentInput,
  CreateOfferInput,
  ListOffersInput,
  OfferAssignmentRecord,
  OfferAssignmentStatus,
  OfferAssignmentWriteInput,
  OfferDependencySummary,
  OfferRecord,
  OffersPayoutRepositoryContext,
  OfferStatus,
  OfferWriteInput,
  PayoutMode,
  PayoutProfileRecord,
  PayoutProfileWriteInput,
  UpdateOfferAssignmentInput,
  UpdateOfferInput,
  UpsertPayoutProfileInput,
} from './offers-payout.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OFFER_CODE_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAX_AMOUNT_MINOR = 2_147_483_647;
const MAX_EXTERNAL_OFFER_ID_LENGTH = 255;

const ALLOWED_OFFER_TRANSITIONS: Readonly<Record<OfferStatus, readonly OfferStatus[]>> = {
  draft: ['active', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [],
};

const ALLOWED_ASSIGNMENT_TRANSITIONS: Readonly<
  Record<OfferAssignmentStatus, readonly OfferAssignmentStatus[]>
> = {
  active: ['paused', 'revoked'],
  paused: ['active', 'revoked'],
  revoked: ['active'],
};

export interface OffersPayoutService {
  createOffer(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateOfferInput,
  ): Promise<OfferRecord>;

  listOffers(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: ListOffersInput,
  ): Promise<readonly OfferRecord[]>;

  getOffer(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    offerId: string,
  ): Promise<OfferRecord>;

  updateOffer(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    offerId: string,
    input: UpdateOfferInput,
  ): Promise<OfferRecord>;

  upsertPayoutProfile(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    membershipId: string,
    input: UpsertPayoutProfileInput,
  ): Promise<PayoutProfileRecord>;

  listPayoutProfiles(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly PayoutProfileRecord[]>;

  getOwnPayoutProfile(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<PayoutProfileRecord>;

  createAssignment(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    offerId: string,
    input: CreateOfferAssignmentInput,
  ): Promise<OfferAssignmentRecord>;

  listOfferAssignments(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    offerId: string,
  ): Promise<readonly OfferAssignmentRecord[]>;

  updateAssignment(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    offerId: string,
    assignmentId: string,
    input: UpdateOfferAssignmentInput,
  ): Promise<OfferAssignmentRecord>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length < minimumLength || normalizedValue.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain ${String(minimumLength)} to ${String(maximumLength)} characters.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalNullableText(
  value: string | null | undefined,
  fieldName: string,
  maximumLength: number,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain 1 to ${String(maximumLength)} characters or be null.`,
    );
  }

  return normalizedValue;
}

function normalizeOfferCode(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 2 ||
    normalizedValue.length > 80 ||
    !OFFER_CODE_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Offer code must contain 2 to 80 lowercase letters, numbers, underscores, or hyphens.',
    );
  }

  return normalizedValue;
}

function normalizeUrl(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length < 8 || normalizedValue.length > 2048) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain 8 to 2048 characters.`,
    );
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch (error: unknown) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must be a valid URL.`, {
      cause: error,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must use http or https.`);
  }

  return url.toString();
}

function normalizeAmount(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_AMOUNT_MINOR) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must be an integer between 1 and ${String(MAX_AMOUNT_MINOR)}.`,
    );
  }

  return value;
}

function normalizeCurrency(value: string, fieldName: string): string {
  const normalizedValue = value.trim().toUpperCase();

  if (!CURRENCY_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must be a three-letter ISO currency code.`,
    );
  }

  return normalizedValue;
}

function normalizeOfferStatus(value: OfferStatus): OfferStatus {
  switch (value) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Offer status is invalid.');
  }
}

function normalizeAssignmentStatus(value: OfferAssignmentStatus): OfferAssignmentStatus {
  switch (value) {
    case 'active':
    case 'paused':
    case 'revoked':
      return value;
    default:
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Offer-assignment status is invalid.');
  }
}

function normalizePayoutMode(value: PayoutMode): PayoutMode {
  switch (value) {
    case 'fixed_member':
    case 'per_offer':
      return value;
    default:
      throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'Payout mode is invalid.');
  }
}

function normalizePayoutProfileInput(input: UpsertPayoutProfileInput): PayoutProfileWriteInput {
  const mode = normalizePayoutMode(input.mode);

  if (mode === 'fixed_member') {
    if (
      input.fixedPayoutAmountMinor === undefined ||
      input.fixedPayoutAmountMinor === null ||
      input.payoutCurrency === undefined ||
      input.payoutCurrency === null
    ) {
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'fixed_member mode requires fixedPayoutAmountMinor and payoutCurrency.',
      );
    }

    return Object.freeze({
      mode,
      fixedPayoutAmountMinor: normalizeAmount(
        input.fixedPayoutAmountMinor,
        'fixedPayoutAmountMinor',
      ),
      payoutCurrency: normalizeCurrency(input.payoutCurrency, 'payoutCurrency'),
    });
  }

  if (
    (input.fixedPayoutAmountMinor !== undefined && input.fixedPayoutAmountMinor !== null) ||
    (input.payoutCurrency !== undefined && input.payoutCurrency !== null)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'per_offer mode cannot define a fixed payout amount or currency.',
    );
  }

  return Object.freeze({
    mode,
    fixedPayoutAmountMinor: null,
    payoutCurrency: null,
  });
}

function normalizeManualPayoutPair(
  amount: number | null | undefined,
  currency: string | null | undefined,
): {
  readonly amountMinor: number | null;
  readonly currency: string | null;
} {
  if (amount === undefined && currency === undefined) {
    return Object.freeze({
      amountMinor: null,
      currency: null,
    });
  }

  if (amount === undefined || currency === undefined) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'manualPayoutAmountMinor and manualPayoutCurrency must be provided together.',
    );
  }

  if (amount === null && currency === null) {
    return Object.freeze({
      amountMinor: null,
      currency: null,
    });
  }

  if (amount === null || currency === null) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'Manual payout amount and currency must both be values or both be null.',
    );
  }

  return Object.freeze({
    amountMinor: normalizeAmount(amount, 'manualPayoutAmountMinor'),
    currency: normalizeCurrency(currency, 'manualPayoutCurrency'),
  });
}

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): OffersPayoutRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    ...(companyId !== undefined ? { companyId } : {}),
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

async function requireActiveCompany(
  repository: OffersPayoutRepository,
  context: OffersPayoutRepositoryContext,
  companyId: string,
): Promise<void> {
  const company = await repository.getCompany(context, companyId);

  if (company === undefined) {
    throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
  }

  if (company.status !== 'active') {
    throw new ApiHttpError(
      'OFFER_COMPANY_INACTIVE',
      409,
      'Offers and payout settings require an active company.',
    );
  }
}

async function requireActiveNetworkAccount(
  repository: OffersPayoutRepository,
  context: OffersPayoutRepositoryContext,
  companyId: string,
  networkAccountId: string,
): Promise<void> {
  const account = await repository.getNetworkAccount(context, companyId, networkAccountId);

  if (account?.status !== 'active') {
    throw new ApiHttpError(
      'OFFER_NETWORK_ACCOUNT_INVALID',
      409,
      'The offer requires an active network account from the same company.',
    );
  }
}

function isScopedOfferReader(identity: ResolvedApiIdentity): boolean {
  return (
    identity.subject.platformRole === undefined &&
    (identity.companyMembership?.role === 'manager' ||
      identity.companyMembership?.role === 'publisher')
  );
}

function getManagerMembershipId(identity: ResolvedApiIdentity): string | undefined {
  return identity.companyMembership?.role === 'manager'
    ? identity.companyMembership.membershipId
    : undefined;
}

function offersAreEquivalent(current: OfferRecord, next: OfferWriteInput): boolean {
  return (
    current.networkAccountId === next.networkAccountId &&
    current.code === next.code &&
    current.externalOfferId === next.externalOfferId &&
    current.name === next.name &&
    current.description === next.description &&
    current.destinationUrl === next.destinationUrl &&
    current.status === next.status
  );
}

function assertOfferTransition(current: OfferStatus, next: OfferStatus): void {
  if (current === next) {
    return;
  }

  if (!ALLOWED_OFFER_TRANSITIONS[current].includes(next)) {
    throw new ApiHttpError(
      'OFFER_STATUS_TRANSITION_INVALID',
      409,
      `An offer cannot transition from ${current} to ${next}.`,
    );
  }
}

function assignmentsAreEquivalent(
  current: OfferAssignmentRecord,
  next: OfferAssignmentWriteInput,
): boolean {
  return (
    current.status === next.status &&
    current.manualPayoutAmountMinor === next.manualPayoutAmountMinor &&
    current.manualPayoutCurrency === next.manualPayoutCurrency
  );
}

function assertAssignmentTransition(
  current: OfferAssignmentStatus,
  next: OfferAssignmentStatus,
): void {
  if (current === next) {
    return;
  }

  if (!ALLOWED_ASSIGNMENT_TRANSITIONS[current].includes(next)) {
    throw new ApiHttpError(
      'OFFER_ASSIGNMENT_STATUS_TRANSITION_INVALID',
      409,
      `An offer assignment cannot transition from ${current} to ${next}.`,
    );
  }
}

function hasOfferDependencies(summary: OfferDependencySummary): boolean {
  return (
    summary.publisherAssignments > 0 ||
    summary.trackingLinks > 0 ||
    summary.trackingClicks > 0 ||
    summary.conversions > 0 ||
    summary.duplicateProtectionRules > 0
  );
}

function formatOfferDependencySummary(summary: OfferDependencySummary): string {
  return [
    `publisherAssignments=${String(summary.publisherAssignments)}`,
    `trackingLinks=${String(summary.trackingLinks)}`,
    `trackingClicks=${String(summary.trackingClicks)}`,
    `conversions=${String(summary.conversions)}`,
    `duplicateProtectionRules=${String(summary.duplicateProtectionRules)}`,
  ].join(', ');
}

async function requireOffer(
  repository: OffersPayoutRepository,
  context: OffersPayoutRepositoryContext,
  companyId: string,
  offerId: string,
  visibleToUserId?: string,
): Promise<OfferRecord> {
  const offer = await repository.getOffer(context, companyId, offerId, visibleToUserId);

  if (offer === undefined) {
    throw new ApiHttpError('OFFER_NOT_FOUND', 404, 'The requested offer was not found.');
  }

  return offer;
}

export function createOffersPayoutService(repository: OffersPayoutRepository): OffersPayoutService {
  return Object.freeze<OffersPayoutService>({
    async createOffer(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const networkAccountId = normalizeUuid(input.networkAccountId, 'Network account ID');

      await requireActiveNetworkAccount(repository, context, companyId, networkAccountId);

      const offer = await repository.createOffer(context, companyId, {
        networkAccountId,
        code: normalizeOfferCode(input.code),
        externalOfferId:
          normalizeOptionalNullableText(
            input.externalOfferId,
            'externalOfferId',
            MAX_EXTERNAL_OFFER_ID_LENGTH,
          ) ?? null,
        name: normalizeRequiredText(input.name, 'name', 2, 160),
        description: normalizeOptionalNullableText(input.description, 'description', 4000) ?? null,
        destinationUrl: normalizeUrl(input.destinationUrl, 'destinationUrl'),
        status: 'draft',
      });

      if (offer === undefined) {
        throw new ApiHttpError(
          'OFFER_CONFLICT',
          409,
          'An offer with this code or external network identifier already exists.',
        );
      }

      return offer;
    },

    async listOffers(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listOffers(context, companyId, {
        ...(input.networkAccountId !== undefined
          ? {
              networkAccountId: normalizeUuid(input.networkAccountId, 'Network account ID'),
            }
          : {}),
        ...(input.status !== undefined ? { status: normalizeOfferStatus(input.status) } : {}),
        ...(isScopedOfferReader(identity) ? { visibleToUserId: identity.actor.userId } : {}),
      });
    },

    async getOffer(identity, requestId, companyIdValue, offerIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const offerId = normalizeUuid(offerIdValue, 'Offer ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
        'publisher',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return requireOffer(
        repository,
        context,
        companyId,
        offerId,
        isScopedOfferReader(identity) ? identity.actor.userId : undefined,
      );
    },

    async updateOffer(identity, requestId, companyIdValue, offerIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const offerId = normalizeUuid(offerIdValue, 'Offer ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const current = await requireOffer(repository, context, companyId, offerId);

      if (current.status === 'archived') {
        throw new ApiHttpError('OFFER_ARCHIVED', 409, 'An archived offer is immutable.');
      }

      if (
        input.networkAccountId === undefined &&
        input.externalOfferId === undefined &&
        input.name === undefined &&
        input.description === undefined &&
        input.destinationUrl === undefined &&
        input.status === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one offer field must be provided.',
        );
      }

      const status =
        input.status === undefined ? current.status : normalizeOfferStatus(input.status);
      const networkAccountId =
        input.networkAccountId === undefined
          ? current.networkAccountId
          : normalizeUuid(input.networkAccountId, 'Network account ID');

      assertOfferTransition(current.status, status);

      if (networkAccountId !== current.networkAccountId) {
        const dependencies = await repository.getOfferDependencySummary(
          context,
          companyId,
          offerId,
        );

        if (dependencies === undefined) {
          throw new ApiHttpError('OFFER_NOT_FOUND', 404, 'The requested offer was not found.');
        }

        if (hasOfferDependencies(dependencies)) {
          throw new ApiHttpError(
            'OFFER_NETWORK_CHANGE_BLOCKED',
            409,
            `The offer network cannot change while dependent records exist: ${formatOfferDependencySummary(dependencies)}.`,
          );
        }
      }

      if (status === 'active' || networkAccountId !== current.networkAccountId) {
        await requireActiveNetworkAccount(repository, context, companyId, networkAccountId);
      }

      const next = Object.freeze<OfferWriteInput>({
        networkAccountId,
        code: current.code,
        externalOfferId:
          input.externalOfferId === undefined
            ? current.externalOfferId
            : (normalizeOptionalNullableText(
                input.externalOfferId,
                'externalOfferId',
                MAX_EXTERNAL_OFFER_ID_LENGTH,
              ) ?? null),
        name:
          input.name === undefined
            ? current.name
            : normalizeRequiredText(input.name, 'name', 2, 160),
        description:
          input.description === undefined
            ? current.description
            : (normalizeOptionalNullableText(input.description, 'description', 4000) ?? null),
        destinationUrl:
          input.destinationUrl === undefined
            ? current.destinationUrl
            : normalizeUrl(input.destinationUrl, 'destinationUrl'),
        status,
      });

      if (offersAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'OFFER_UNCHANGED',
          409,
          'The offer already contains the requested values.',
        );
      }

      const updated = await repository.updateOffer(context, current, next);

      if (updated === undefined) {
        throw new ApiHttpError(
          'OFFER_UPDATE_CONFLICT',
          409,
          'The offer changed or conflicted before this request completed.',
        );
      }

      return updated;
    },

    async upsertPayoutProfile(identity, requestId, companyIdValue, membershipIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const membershipId = normalizeUuid(membershipIdValue, 'Membership ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const membership = await repository.getEligibleMembership(context, companyId, membershipId);

      if (membership?.status !== 'active') {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_MEMBER_INVALID',
          409,
          'A payout profile requires an active Manager or Publisher membership.',
        );
      }

      const normalizedInput = normalizePayoutProfileInput(input);
      const current = await repository.getPayoutProfile(context, companyId, membershipId);

      if (current === undefined) {
        const created = await repository.createPayoutProfile(
          context,
          companyId,
          membershipId,
          normalizedInput,
        );

        if (created === undefined) {
          throw new ApiHttpError(
            'PAYOUT_PROFILE_UPDATE_CONFLICT',
            409,
            'The payout profile was created by another request.',
          );
        }

        return created;
      }

      if (
        current.mode === normalizedInput.mode &&
        current.fixedPayoutAmountMinor === normalizedInput.fixedPayoutAmountMinor &&
        current.payoutCurrency === normalizedInput.payoutCurrency
      ) {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_UNCHANGED',
          409,
          'The payout profile already contains the requested values.',
        );
      }

      if (normalizedInput.mode === 'per_offer') {
        const incompleteAssignments = await repository.countOpenAssignmentsMissingManualPayout(
          context,
          companyId,
          membershipId,
        );

        if (incompleteAssignments > 0) {
          throw new ApiHttpError(
            'PAYOUT_PROFILE_ASSIGNMENTS_INCOMPLETE',
            409,
            'Every open assignment must define a manual payout before switching to per_offer mode.',
          );
        }
      }

      const updated = await repository.updatePayoutProfile(context, current, normalizedInput);

      if (updated === undefined) {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_UPDATE_CONFLICT',
          409,
          'The payout profile changed before this request completed.',
        );
      }

      return updated;
    },

    async listPayoutProfiles(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      return repository.listPayoutProfiles(context, companyId);
    },

    async getOwnPayoutProfile(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'manager',
        'publisher',
      ]);

      const membershipId = identity.companyMembership?.membershipId;

      if (membershipId === undefined) {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_NOT_FOUND',
          404,
          'The current user does not have a payout profile.',
        );
      }

      const context = createRepositoryContext(identity, requestId, companyId);

      await requireActiveCompany(repository, context, companyId);

      const profile = await repository.getPayoutProfile(context, companyId, membershipId);

      if (profile === undefined) {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_NOT_FOUND',
          404,
          'The current user does not have a payout profile.',
        );
      }

      return profile;
    },

    async createAssignment(identity, requestId, companyIdValue, offerIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const offerId = normalizeUuid(offerIdValue, 'Offer ID');
      const membershipId = normalizeUuid(input.membershipId, 'Membership ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);
      const managerMembershipId = getManagerMembershipId(identity);

      await requireActiveCompany(repository, context, companyId);

      const offer = await requireOffer(
        repository,
        context,
        companyId,
        offerId,
        managerMembershipId === undefined ? undefined : identity.actor.userId,
      );

      if (offer.status === 'archived') {
        throw new ApiHttpError(
          'OFFER_ARCHIVED',
          409,
          'An archived offer cannot receive assignments.',
        );
      }

      const membership = await repository.getEligibleMembership(context, companyId, membershipId);

      if (membership?.status !== 'active') {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_MEMBER_INVALID',
          409,
          'An offer can only be assigned to an active membership.',
        );
      }

      if (managerMembershipId === undefined) {
        if (membership.role !== 'manager') {
          throw new ApiHttpError(
            'OFFER_ASSIGNMENT_MEMBER_INVALID',
            409,
            'A Company Admin can assign Offers to active Manager memberships only.',
          );
        }
      } else {
        if (
          membership.role !== 'publisher' ||
          (membership.invitedBy !== identity.actor.userId &&
            !(
              await repository.listOfferAssignments(
                context,
                companyId,
                offerId,
                managerMembershipId,
              )
            ).some((assignment) => assignment.membershipId === membershipId))
        ) {
          throw new ApiHttpError(
            'OFFER_ASSIGNMENT_MEMBER_INVALID',
            403,
            'A Manager can assign an Offer only to a Publisher within their own scope.',
          );
        }
      }

      const profile = await repository.getPayoutProfile(context, companyId, membershipId);

      if (profile === undefined) {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_NOT_FOUND',
          409,
          'Create the member payout profile before assigning an offer.',
        );
      }

      const manualPayout = normalizeManualPayoutPair(
        input.manualPayoutAmountMinor,
        input.manualPayoutCurrency,
      );

      if (
        profile.mode === 'per_offer' &&
        (manualPayout.amountMinor === null || manualPayout.currency === null)
      ) {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_PAYOUT_REQUIRED',
          409,
          'per_offer payout mode requires a manual payout on every open assignment.',
        );
      }

      const assignment = await repository.createAssignment(
        context,
        companyId,
        offerId,
        membershipId,
        {
          managerMembershipId: managerMembershipId ?? null,
          status: 'active',
          manualPayoutAmountMinor: manualPayout.amountMinor,
          manualPayoutCurrency: manualPayout.currency,
        },
      );

      if (assignment === undefined) {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_CONFLICT',
          409,
          'This member is already assigned to the offer.',
        );
      }

      return assignment;
    },

    async listOfferAssignments(identity, requestId, companyIdValue, offerIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const offerId = normalizeUuid(offerIdValue, 'Offer ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);
      const managerMembershipId = getManagerMembershipId(identity);

      await requireActiveCompany(repository, context, companyId);
      await requireOffer(
        repository,
        context,
        companyId,
        offerId,
        managerMembershipId === undefined ? undefined : identity.actor.userId,
      );

      return repository.listOfferAssignments(context, companyId, offerId, managerMembershipId);
    },

    async updateAssignment(
      identity,
      requestId,
      companyIdValue,
      offerIdValue,
      assignmentIdValue,
      input,
    ) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const offerId = normalizeUuid(offerIdValue, 'Offer ID');
      const assignmentId = normalizeUuid(assignmentIdValue, 'Offer assignment ID');

      assertCompanyRequestContext(identity, companyId);
      assertTenantCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);

      const context = createRepositoryContext(identity, requestId, companyId);
      const managerMembershipId = getManagerMembershipId(identity);

      await requireActiveCompany(repository, context, companyId);
      await requireOffer(
        repository,
        context,
        companyId,
        offerId,
        managerMembershipId === undefined ? undefined : identity.actor.userId,
      );

      const current = await repository.getAssignment(
        context,
        companyId,
        offerId,
        assignmentId,
        managerMembershipId,
      );

      if (current === undefined) {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_NOT_FOUND',
          404,
          'The requested offer assignment was not found.',
        );
      }

      if (
        input.status === undefined &&
        input.manualPayoutAmountMinor === undefined &&
        input.manualPayoutCurrency === undefined
      ) {
        throw new ApiHttpError(
          'INVALID_REQUEST_BODY',
          400,
          'At least one offer-assignment field must be provided.',
        );
      }

      const status =
        input.status === undefined ? current.status : normalizeAssignmentStatus(input.status);

      assertAssignmentTransition(current.status, status);

      const manualPayout =
        input.manualPayoutAmountMinor === undefined && input.manualPayoutCurrency === undefined
          ? {
              amountMinor: current.manualPayoutAmountMinor,
              currency: current.manualPayoutCurrency,
            }
          : normalizeManualPayoutPair(input.manualPayoutAmountMinor, input.manualPayoutCurrency);

      const profile = await repository.getPayoutProfile(context, companyId, current.membershipId);

      if (profile === undefined) {
        throw new ApiHttpError(
          'PAYOUT_PROFILE_NOT_FOUND',
          409,
          'The assigned member payout profile is unavailable.',
        );
      }

      if (
        status !== 'revoked' &&
        profile.mode === 'per_offer' &&
        (manualPayout.amountMinor === null || manualPayout.currency === null)
      ) {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_PAYOUT_REQUIRED',
          409,
          'per_offer payout mode requires a manual payout on every open assignment.',
        );
      }

      const next = Object.freeze<OfferAssignmentWriteInput>({
        managerMembershipId: current.managerMembershipId,
        status,
        manualPayoutAmountMinor: manualPayout.amountMinor,
        manualPayoutCurrency: manualPayout.currency,
      });

      if (assignmentsAreEquivalent(current, next)) {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_UNCHANGED',
          409,
          'The offer assignment already contains the requested values.',
        );
      }

      const updated = await repository.updateAssignment(context, current, next);

      if (updated === undefined) {
        throw new ApiHttpError(
          'OFFER_ASSIGNMENT_UPDATE_CONFLICT',
          409,
          'The offer assignment changed before this request completed.',
        );
      }

      return updated;
    },
  });
}

export type {
  CreateOfferAssignmentInput,
  CreateOfferInput,
  ListOffersInput,
  OfferAssignmentRecord,
  OfferRecord,
  PayoutProfileRecord,
  UpdateOfferAssignmentInput,
  UpdateOfferInput,
  UpsertPayoutProfileInput,
} from './offers-payout.types.js';
