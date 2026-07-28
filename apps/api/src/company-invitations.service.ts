import { createHash, randomBytes } from 'node:crypto';

import {
  assertCompanyRole,
  isPlatformSuperAdmin,
  type SupabaseUserInvitationGateway,
  type SupabaseUserInvitationLink,
} from '@affiliate-tracker/auth';
import type { CompanyRole } from '@affiliate-tracker/contracts';

import { ApiHttpError } from './api.errors.js';
import type { EmailPayloadCipher } from './email-payload-cipher.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { InvitationEmailOutboxRepository } from './invitation-email-outbox.repository.js';
import { renderCompanyInvitationEmail } from './invitation-email-template.js';
import type { CompanyInvitationsRepository } from './company-invitations.repository.js';
import type {
  CompanyInvitationAcceptance,
  CompanyInvitationPreview,
  CompanyInvitationRecord,
  CreateCompanyInvitationInput,
  InvitationRepositoryContext,
} from './company-invitations.types.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,200}$/u;
const INVITATION_TTL_MS = 60 * 60 * 1000;
const EMAIL_NOTIFICATION_MAX_ATTEMPTS = 5;

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
    throw new ApiHttpError(
      'INVALID_PATH_PARAMETER',
      400,
      `${fieldName} must be a valid UUID.`,
    );
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
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'email must be a valid email address.',
    );
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
    ...(companyId === undefined ? {} : { companyId }),
  };
}

function assertCompanyContext(
  identity: ResolvedApiIdentity,
  companyId: string,
): void {
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

function assertInvitationRolePermission(
  identity: ResolvedApiIdentity,
  companyId: string,
  targetRole: CompanyRole,
): void {
  assertCompanyRole(
    identity.subject,
    identity.companyMembership,
    companyId,
    ['company_admin', 'manager'],
  );

  if (isPlatformSuperAdmin(identity.subject)) {
    if (targetRole === 'company_admin') {
      return;
    }

    throw new ApiHttpError(
      'PLATFORM_SUPER_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN',
      403,
      'A Platform Super Admin can only create or manage Company Admin invitations.',
    );
  }

  const actorRole = identity.companyMembership?.role;

  if (actorRole === 'company_admin' && targetRole === 'manager') {
    return;
  }

  if (
    actorRole === 'manager' &&
    targetRole === 'publisher'
  ) {
    return;
  }

  throw new ApiHttpError(
    'INVITATION_ROLE_ASSIGNMENT_FORBIDDEN',
    403,
    'The current role cannot create or manage an invitation for the requested role.',
  );
}

export function createCompanyInvitationsService(
  repository: CompanyInvitationsRepository,
  linkGateway: SupabaseUserInvitationGateway,
  outboxRepository: InvitationEmailOutboxRepository,
  payloadCipher: EmailPayloadCipher,
  publicAppUrl: string,
): CompanyInvitationsService {
  const normalizedAppUrl = publicAppUrl.trim().replace(/\/+$/u, '');

  async function requireActiveCompany(
    context: InvitationRepositoryContext,
    companyId: string,
  ) {
    const company = await repository.getCompany(context, companyId);

    if (company === undefined) {
      throw new ApiHttpError(
        'COMPANY_NOT_FOUND',
        404,
        'The requested company was not found.',
      );
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

  async function queueDelivery(
    context: InvitationRepositoryContext,
    companyName: string,
    invitation: CompanyInvitationRecord,
    token: string,
  ): Promise<CompanyInvitationRecord> {
    const existingUser = await repository.findAuthUserByEmail(
      context,
      invitation.email,
    );
    const redirectTo =
      `${normalizedAppUrl}/accept-invitation?token=${encodeURIComponent(token)}`;

    let generatedLink: SupabaseUserInvitationLink;

    try {
      if (existingUser === undefined) {
        generatedLink = await linkGateway.generateNewUserInviteLink({
          email: invitation.email,
          redirectTo,
          metadata: {
            invited_company_id: invitation.companyId,
            invited_role: invitation.role,
          },
        });
      } else if (invitation.requiresPasswordSetup) {
        generatedLink = await linkGateway.generatePasswordSetupLink({
          email: invitation.email,
          redirectTo,
        });
      } else {
        generatedLink = await linkGateway.generateExistingUserMagicLink({
          email: invitation.email,
          redirectTo,
        });
      }
    } catch (error: unknown) {
      throw new ApiHttpError(
        'INVITATION_LINK_GENERATION_FAILED',
        502,
        'The invitation was saved, but its secure access link could not be generated.',
        {
          cause: error,
        },
      );
    }

    const renderedEmail = renderCompanyInvitationEmail({
      companyName,
      role: invitation.role,
      actionLink: generatedLink.actionLink,
      expiresAt: invitation.expiresAt,
    });
    const encryptedPayload = payloadCipher.encrypt({
      htmlContent: renderedEmail.htmlContent,
      textContent: renderedEmail.textContent,
    });
    const idempotencyKey =
      `company-invitation:${invitation.id}:${hashToken(token)}`;

    await outboxRepository.enqueue(context, {
      invitationId: invitation.id,
      companyId: invitation.companyId,
      recipientEmail: invitation.email,
      recipientName: null,
      subject: renderedEmail.subject,
      encryptedPayload,
      idempotencyKey,
      userId: generatedLink.userId,
      maxAttempts: EMAIL_NOTIFICATION_MAX_ATTEMPTS,
    });

    const queuedInvitation = await repository.getInvitationById(
      context,
      invitation.companyId,
      invitation.id,
    );

    if (queuedInvitation === undefined) {
      throw new Error(
        'The invitation changed after its email notification was queued.',
      );
    }

    return queuedInvitation;
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
    const invitation = await repository.getInvitationByTokenHash(
      context,
      tokenHash,
    );

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
      throw new ApiHttpError(
        'INVITATION_REVOKED',
        410,
        'This invitation has been revoked.',
      );
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
      (invitation.userId !== null &&
        invitation.userId !== identity.actor.userId)
    ) {
      throw new ApiHttpError(
        'INVITATION_RECIPIENT_MISMATCH',
        403,
        'This invitation belongs to a different account.',
      );
    }

    const company = await requireActiveCompany(
      context,
      invitation.companyId,
    );

    return {
      invitation,
      company,
      tokenHash,
    };
  }

  return Object.freeze<CompanyInvitationsService>({
    async createInvitation(
      identity,
      requestId,
      companyIdValue,
      input,
    ): Promise<CompanyInvitationRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      assertCompanyContext(identity, companyId);
      const context = createContext(identity, requestId, companyId);
      const company = await requireActiveCompany(context, companyId);
      const email = normalizeEmail(input.email);
      const role = normalizeRole(input.role);

      assertInvitationRolePermission(identity, companyId, role);

      const existingUser = await repository.findAuthUserByEmail(
        context,
        email,
      );

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
      const invitation = await repository.createInvitation(
        context,
        companyId,
        {
          email,
          role,
          tokenHash: hashToken(token),
          userId: existingUser?.userId ?? null,
          requiresPasswordSetup: existingUser === undefined,
          expiresAt: createExpiry(),
        },
      );

      if (invitation === undefined) {
        throw new ApiHttpError(
          'INVITATION_CONFLICT',
          409,
          'A pending or accepted invitation already exists for this email address.',
        );
      }

      return queueDelivery(
        context,
        company.name,
        invitation,
        token,
      );
    },

    async listInvitations(
      identity,
      requestId,
      companyIdValue,
    ): Promise<readonly CompanyInvitationRecord[]> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(
        identity.subject,
        identity.companyMembership,
        companyId,
        ['company_admin', 'manager'],
      );
      const context = createContext(identity, requestId, companyId);

      await requireActiveCompany(context, companyId);

      const invitations = await repository.listInvitations(context, companyId);

      if (isPlatformSuperAdmin(identity.subject)) {
        return invitations.filter((invitation) => invitation.role === 'company_admin');
      }

      return identity.companyMembership?.role === 'company_admin'
        ? invitations.filter((invitation) => invitation.role === 'manager')
        : invitations.filter((invitation) => invitation.role === 'publisher');
    },

    async resendInvitation(
      identity,
      requestId,
      companyIdValue,
      invitationIdValue,
    ): Promise<CompanyInvitationRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const invitationId = normalizeUuid(invitationIdValue, 'Invitation ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(
        identity.subject,
        identity.companyMembership,
        companyId,
        ['company_admin', 'manager'],
      );

      const context = createContext(identity, requestId, companyId);
      const company = await requireActiveCompany(context, companyId);
      const current = await repository.getInvitationById(
        context,
        companyId,
        invitationId,
      );

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

      assertInvitationRolePermission(identity, companyId, current.role);

      const existingUser = await repository.findAuthUserByEmail(
        context,
        current.email,
      );
      const token = createToken();
      const rotated = await repository.rotateInvitation(
        context,
        companyId,
        invitationId,
        {
          tokenHash: hashToken(token),
          expiresAt: createExpiry(),
          role: current.role,
          userId: existingUser?.userId ?? current.userId,
          requiresPasswordSetup: current.requiresPasswordSetup,
        },
      );

      if (rotated === undefined) {
        throw new ApiHttpError(
          'INVITATION_UPDATE_CONFLICT',
          409,
          'The invitation changed before it could be resent.',
        );
      }

      return queueDelivery(
        context,
        company.name,
        rotated,
        token,
      );
    },

    async revokeInvitation(
      identity,
      requestId,
      companyIdValue,
      invitationIdValue,
    ): Promise<CompanyInvitationRecord> {
      const companyId = normalizeUuid(companyIdValue, 'Company ID');
      const invitationId = normalizeUuid(invitationIdValue, 'Invitation ID');
      assertCompanyContext(identity, companyId);
      assertCompanyRole(
        identity.subject,
        identity.companyMembership,
        companyId,
        ['company_admin', 'manager'],
      );

      const context = createContext(identity, requestId, companyId);
      const current = await repository.getInvitationById(
        context,
        companyId,
        invitationId,
      );

      if (current === undefined) {
        throw new ApiHttpError(
          'INVITATION_NOT_FOUND',
          404,
          'The requested invitation was not found.',
        );
      }

      assertInvitationRolePermission(identity, companyId, current.role);

      const invitation = await repository.revokeInvitation(
        context,
        companyId,
        invitationId,
      );

      if (invitation === undefined) {
        throw new ApiHttpError(
          'INVITATION_NOT_PENDING',
          409,
          'Only a pending invitation can be revoked.',
        );
      }

      await outboxRepository.cancelPending(
        context,
        invitation.id,
      );

      return invitation;
    },

    async previewInvitation(
      identity,
      requestId,
      token,
    ): Promise<CompanyInvitationPreview> {
      const result = await requireInvitationForRecipient(
        identity,
        requestId,
        token,
      );

      return Object.freeze({
        invitationId: result.invitation.id,
        company: result.company,
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
        requiresPasswordSetup: result.invitation.requiresPasswordSetup,
      });
    },

    async acceptInvitation(
      identity,
      requestId,
      tokenValue,
    ): Promise<CompanyInvitationAcceptance> {
      const result = await requireInvitationForRecipient(
        identity,
        requestId,
        tokenValue,
      );
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
