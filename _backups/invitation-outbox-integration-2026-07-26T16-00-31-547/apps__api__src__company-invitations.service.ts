import { createHash, randomBytes } from 'node:crypto';

import { assertCompanyRole, type SupabaseUserInvitationGateway } from '@affiliate-tracker/auth';
import type { CompanyRole } from '@affiliate-tracker/contracts';

import { ApiHttpError } from './api.errors.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { CompanyInvitationsRepository } from './company-invitations.repository.js';
import type {
  CompanyInvitationAcceptance,
  CompanyInvitationPreview,
  CompanyInvitationRecord,
  CreateCompanyInvitationInput,
  InvitationRepositoryContext,
} from './company-invitations.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,200}$/u;
const INVITATION_TTL_MS = 60 * 60 * 1000;

export interface CompanyInvitationsService {
  createInvitation(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: CreateCompanyInvitationInput,
  ): Promise<CompanyInvitationRecord>;
  listInvitations(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<readonly CompanyInvitationRecord[]>;
  resendInvitation(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    invitationId: string,
  ): Promise<CompanyInvitationRecord>;
  revokeInvitation(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    invitationId: string,
  ): Promise<CompanyInvitationRecord>;
  previewInvitation(
    identity: ResolvedApiIdentity,
    requestId: string,
    token: string,
  ): Promise<CompanyInvitationPreview>;
  acceptInvitation(
    identity: ResolvedApiIdentity,
    requestId: string,
    token: string,
  ): Promise<CompanyInvitationAcceptance>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();
  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }
  return normalizedValue;
}

function normalizeEmail(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  if (
    normalizedValue.length < 3 ||
    normalizedValue.length > 320 ||
    !EMAIL_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'email must be a valid email address.');
  }
  return normalizedValue;
}

function normalizeRole(value: CompanyRole): CompanyRole {
  return value;
}
function normalizeToken(value: string): string {
  const normalizedValue = value.trim();
  if (!TOKEN_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError(
      'INVITATION_NOT_FOUND',
      404,
      'The invitation is invalid or unavailable.',
    );
  }
  return normalizedValue;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function createToken(): string {
  return randomBytes(32).toString('base64url');
}

function createExpiry(): string {
  return new Date(Date.now() + INVITATION_TTL_MS).toISOString();
}

function createContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): InvitationRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    ...(companyId !== undefined ? { companyId } : {}),
  };
}

function assertCompanyContext(identity: ResolvedApiIdentity, companyId: string): void {
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

function requireActorEmail(identity: ResolvedApiIdentity): string {
  const email = identity.actor.email;
  if (email === undefined) {
    throw new ApiHttpError(
      'INVITATION_RECIPIENT_MISMATCH',
      403,
      'The authenticated account does not have an email address.',
    );
  }
  return normalizeEmail(email);
}

function isExpired(invitation: CompanyInvitationRecord): boolean {
  return new Date(invitation.expiresAt).getTime() <= Date.now();
}

function getDeliveryErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const code = error.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/gu, '_')
      .slice(0, 120);
    return code.length > 0 ? code : 'SUPABASE_DELIVERY_FAILED';
  }
  return 'SUPABASE_DELIVERY_FAILED';
}

export function createCompanyInvitationsService(
  repository: CompanyInvitationsRepository,
  deliveryGateway: SupabaseUserInvitationGateway,
  publicAppUrl: string,
): CompanyInvitationsService {
  const normalizedAppUrl = publicAppUrl.trim().replace(/\/+$/u, '');

  async function requireActiveCompany(context: InvitationRepositoryContext, companyId: string) {
    const company = await repository.getCompany(context, companyId);
    if (company === undefined) {
      throw new ApiHttpError('COMPANY_NOT_FOUND', 404, 'The requested company was not found.');
    }
    if (company.status !== 'active') {
      throw new ApiHttpError(
        'COMPANY_OPERATIONS_COMPANY_INACTIVE',
        409,
        'The company must be active.',
      );
    }
    return company;
  }

  async function deliver(
    context: InvitationRepositoryContext,
    invitation: CompanyInvitationRecord,
    token: string,
  ): Promise<CompanyInvitationRecord> {
    const existingUser = await repository.findAuthUserByEmail(context, invitation.email);
    const redirectTo = `${normalizedAppUrl}/accept-invitation?token=${encodeURIComponent(token)}`;
    let userId = existingUser?.userId ?? null;

    try {
      if (existingUser === undefined) {
        const result = await deliveryGateway.inviteNewUser({
          email: invitation.email,
          redirectTo,
          metadata: {
            invited_company_id: invitation.companyId,
            invited_role: invitation.role,
          },
        });
        userId = result.userId;
      } else {
        await deliveryGateway.sendExistingUserLink({
          email: invitation.email,
          redirectTo,
        });
      }

      const delivered = await repository.updateDelivery(context, invitation.id, {
        deliveryStatus: 'sent',
        userId,
        errorCode: null,
      });
      if (delivered === undefined) {
        throw new Error('The invitation changed before delivery was recorded.');
      }
      return delivered;
    } catch (error: unknown) {
      await repository.updateDelivery(context, invitation.id, {
        deliveryStatus: 'failed',
        userId,
        errorCode: getDeliveryErrorCode(error),
      });
      throw new ApiHttpError(
        'INVITATION_DELIVERY_FAILED',
        502,
        'The invitation was saved, but the email could not be delivered.',
        { cause: error },
      );
    }
  }

  async function requireInvitationForRecipient(
    identity: ResolvedApiIdentity,
    requestId: string,
    tokenValue: string,
  ): Promise<{
    invitation: CompanyInvitationRecord;
    company: Awaited<ReturnType<typeof requireActiveCompany>>;
    tokenHash: string;
  }> {
    const token = normalizeToken(tokenValue);
    const tokenHash = hashToken(token);
    const context = createContext(identity, requestId);
    const invitation = await repository.getInvitationByTokenHash(context, tokenHash);
    if (invitation === undefined) {
      throw new ApiHttpError(
        'INVITATION_NOT_FOUND',
        404,
        'The invitation is invalid or unavailable.',
      );
    }
    if (invitation.status === 'accepted') {
      throw new ApiHttpError(
        'INVITATION_ALREADY_ACCEPTED',
        409,
        'This invitation has already been accepted.',
      );
    }
    if (invitation.status === 'revoked') {
      throw new ApiHttpError('INVITATION_REVOKED', 410, 'This invitation has been revoked.');
    }
    if (isExpired(invitation)) {
      throw new ApiHttpError(
        'INVITATION_EXPIRED',
        410,
        'This invitation has expired. Ask an administrator to resend it.',
      );
    }
    const actorEmail = requireActorEmail(identity);
    if (
      actorEmail !== invitation.email ||
      (invitation.userId !== null && invitation.userId !== identity.actor.userId)
    ) {
      throw new ApiHttpError(
        'INVITATION_RECIPIENT_MISMATCH',
        403,
        'This invitation belongs to a different account.',
      );
    }
    const company = await requireActiveCompany(context, invitation.companyId);
    return { invitation, company, tokenHash };
  }

  return Object.freeze<CompanyInvitationsService>({
    async createInvitation(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
      const context = createContext(identity, requestId, companyId);
      await requireActiveCompany(context, companyId);
      const email = normalizeEmail(input.email);
      const role = normalizeRole(input.role);
      const existingUser = await repository.findAuthUserByEmail(context, email);
      if (existingUser !== undefined) {
        const membership = await repository.getMembershipByUserId(
          context,
          companyId,
          existingUser.userId,
        );
        if (membership !== undefined && membership.status !== 'invited') {
          throw new ApiHttpError(
            'MEMBERSHIP_CONFLICT',
            409,
            'This user already has a non-invited membership in the company.',
          );
        }
      }
      const token = createToken();
      const invitation = await repository.createInvitation(context, companyId, {
        email,
        role,
        tokenHash: hashToken(token),
        userId: existingUser?.userId ?? null,
        requiresPasswordSetup: existingUser === undefined,
        expiresAt: createExpiry(),
      });
      if (invitation === undefined) {
        throw new ApiHttpError(
          'INVITATION_CONFLICT',
          409,
          'A pending or accepted invitation already exists for this email address.',
        );
      }
      return deliver(context, invitation, token);
    },

    async listInvitations(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
        'company_admin',
        'manager',
      ]);
      const context = createContext(identity, requestId, companyId);
      await requireActiveCompany(context, companyId);
      return repository.listInvitations(context, companyId);
    },

    async resendInvitation(identity, requestId, companyIdValue, invitationIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const invitationId = normalizeUuid(invitationIdValue, 'Invitation ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
      const context = createContext(identity, requestId, companyId);
      await requireActiveCompany(context, companyId);
      const current = await repository.getInvitationById(context, companyId, invitationId);
      if (current === undefined) {
        throw new ApiHttpError(
          'INVITATION_NOT_FOUND',
          404,
          'The requested invitation was not found.',
        );
      }
      if (current.status !== 'pending') {
        throw new ApiHttpError(
          'INVITATION_NOT_PENDING',
          409,
          'Only a pending invitation can be resent.',
        );
      }
      const existingUser = await repository.findAuthUserByEmail(context, current.email);
      const token = createToken();
      const rotated = await repository.rotateInvitation(context, companyId, invitationId, {
        tokenHash: hashToken(token),
        expiresAt: createExpiry(),
        role: current.role,
        userId: existingUser?.userId ?? current.userId,
        requiresPasswordSetup: current.requiresPasswordSetup,
      });
      if (rotated === undefined) {
        throw new ApiHttpError(
          'INVITATION_UPDATE_CONFLICT',
          409,
          'The invitation changed before it could be resent.',
        );
      }
      return deliver(context, rotated, token);
    },

    async revokeInvitation(identity, requestId, companyIdValue, invitationIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const invitationId = normalizeUuid(invitationIdValue, 'Invitation ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
      const context = createContext(identity, requestId, companyId);
      const invitation = await repository.revokeInvitation(context, companyId, invitationId);
      if (invitation === undefined) {
        throw new ApiHttpError(
          'INVITATION_NOT_PENDING',
          409,
          'Only a pending invitation can be revoked.',
        );
      }
      return invitation;
    },

    async previewInvitation(identity, requestId, token) {
      const result = await requireInvitationForRecipient(identity, requestId, token);
      return Object.freeze({
        invitationId: result.invitation.id,
        company: result.company,
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
        requiresPasswordSetup: result.invitation.requiresPasswordSetup,
      });
    },

    async acceptInvitation(identity, requestId, tokenValue) {
      const result = await requireInvitationForRecipient(identity, requestId, tokenValue);
      const accepted = await repository.acceptInvitation(
        createContext(identity, requestId),
        result.tokenHash,
        requireActorEmail(identity),
      );
      if (accepted === undefined) {
        throw new ApiHttpError(
          'INVITATION_ACCEPTANCE_CONFLICT',
          409,
          'The invitation changed before it could be accepted.',
        );
      }
      return accepted;
    },
  });
}
