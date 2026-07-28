import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';
import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type { CompanyMembershipRecord, CompanyRecord } from './company-management.types.js';
import type {
  CompanyInvitationAcceptance,
  CompanyInvitationRecord,
  CompanyInvitationWriteInput,
  InvitationAuthUserRecord,
  InvitationDeliveryUpdateInput,
  InvitationRepositoryContext,
  InvitationRotationInput,
} from './company-invitations.types.js';

type CompanyRow = Readonly<{
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type MembershipRow = Readonly<{
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by: string | null;
  joined_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type InvitationRow = Readonly<{
  id: string;
  company_id: string;
  email: string;
  role: string;
  status: string;
  delivery_status: string;
  user_id: string | null;
  requires_password_setup: boolean;
  invited_by: string | null;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  last_sent_at: Date | string | null;
  send_count: number;
  last_delivery_error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type AuthUserRow = Readonly<{
  id: string;
  email: string | null;
}> &
  Record<string, unknown>;

export interface CompanyInvitationsRepository {
  getCompany(
    context: InvitationRepositoryContext,
    companyId: string,
  ): Promise<CompanyRecord | undefined>;
  findAuthUserByEmail(
    context: InvitationRepositoryContext,
    email: string,
  ): Promise<InvitationAuthUserRecord | undefined>;
  getMembershipByUserId(
    context: InvitationRepositoryContext,
    companyId: string,
    userId: string,
  ): Promise<CompanyMembershipRecord | undefined>;
  createInvitation(
    context: InvitationRepositoryContext,
    companyId: string,
    input: CompanyInvitationWriteInput,
  ): Promise<CompanyInvitationRecord | undefined>;
  listInvitations(
    context: InvitationRepositoryContext,
    companyId: string,
  ): Promise<readonly CompanyInvitationRecord[]>;
  getInvitationById(
    context: InvitationRepositoryContext,
    companyId: string,
    invitationId: string,
  ): Promise<CompanyInvitationRecord | undefined>;
  getInvitationByTokenHash(
    context: InvitationRepositoryContext,
    tokenHash: string,
  ): Promise<CompanyInvitationRecord | undefined>;
  updateDelivery(
    context: InvitationRepositoryContext,
    invitationId: string,
    input: InvitationDeliveryUpdateInput,
  ): Promise<CompanyInvitationRecord | undefined>;
  rotateInvitation(
    context: InvitationRepositoryContext,
    companyId: string,
    invitationId: string,
    input: InvitationRotationInput,
  ): Promise<CompanyInvitationRecord | undefined>;
  revokeInvitation(
    context: InvitationRepositoryContext,
    companyId: string,
    invitationId: string,
  ): Promise<CompanyInvitationRecord | undefined>;
  acceptInvitation(
    context: InvitationRepositoryContext,
    tokenHash: string,
    actorEmail: string,
  ): Promise<CompanyInvitationAcceptance | undefined>;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid timestamp.');
  }

  return date.toISOString();
}

function normalizeOptionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}

function parseCompanyStatus(value: string): CompanyRecord['status'] {
  if (value === 'active' || value === 'suspended' || value === 'archived') {
    return value;
  }

  throw new Error('The database returned an unsupported company status.');
}

function parseCompanyRole(value: string): CompanyRole {
  if (value === 'company_admin' || value === 'manager' || value === 'publisher') {
    return value;
  }

  throw new Error('The database returned an unsupported company role.');
}

function parseMembershipStatus(value: string): CompanyMembershipStatus {
  if (value === 'invited' || value === 'active' || value === 'suspended' || value === 'revoked') {
    return value;
  }

  throw new Error('The database returned an unsupported membership status.');
}

function parseInvitationStatus(value: string): CompanyInvitationRecord['status'] {
  if (value === 'pending' || value === 'accepted' || value === 'revoked') {
    return value;
  }

  throw new Error('The database returned an unsupported invitation status.');
}

function parseDeliveryStatus(value: string): CompanyInvitationRecord['deliveryStatus'] {
  if (value === 'pending' || value === 'sent' || value === 'failed') {
    return value;
  }

  throw new Error('The database returned an unsupported invitation delivery status.');
}

function mapCompany(row: CompanyRow): CompanyRecord {
  return Object.freeze({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: parseCompanyStatus(row.status),
    timezone: row.timezone,
    createdBy: row.created_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapMembership(row: MembershipRow): CompanyMembershipRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    role: parseCompanyRole(row.role),
    status: parseMembershipStatus(row.status),
    invitedBy: row.invited_by,
    joinedAt: normalizeOptionalTimestamp(row.joined_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapInvitation(row: InvitationRow): CompanyInvitationRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    role: parseCompanyRole(row.role),
    status: parseInvitationStatus(row.status),
    deliveryStatus: parseDeliveryStatus(row.delivery_status),
    userId: row.user_id,
    requiresPasswordSetup: row.requires_password_setup,
    invitedBy: row.invited_by,
    expiresAt: normalizeTimestamp(row.expires_at),
    acceptedAt: normalizeOptionalTimestamp(row.accepted_at),
    revokedAt: normalizeOptionalTimestamp(row.revoked_at),
    lastSentAt: normalizeOptionalTimestamp(row.last_sent_at),
    sendCount: row.send_count,
    lastDeliveryErrorCode: row.last_delivery_error_code,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function createSessionContext(context: InvitationRepositoryContext): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    ...(context.companyId !== undefined ? { companyId: context.companyId } : {}),
  };
}

const companyColumns = `
  id,
  slug,
  name,
  status,
  timezone,
  created_by,
  created_at,
  updated_at
`;

const membershipColumns = `
  id,
  company_id,
  user_id,
  role,
  status,
  invited_by,
  joined_at,
  created_at,
  updated_at
`;

const invitationColumns = `
  id,
  company_id,
  email,
  role,
  status,
  delivery_status,
  user_id,
  requires_password_setup,
  invited_by,
  expires_at,
  accepted_at,
  revoked_at,
  last_sent_at,
  send_count,
  last_delivery_error_code,
  created_at,
  updated_at
`;

async function writeAuditEvent(
  transaction: DatabaseTransaction,
  input: {
    readonly companyId: string;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly eventName: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await transaction.query({
    name: 'company-invitations-write-audit-event',
    text: `
      insert into public.audit_events (
        company_id,
        actor_user_id,
        request_id,
        event_name,
        entity_type,
        entity_id,
        metadata
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    values: [
      input.companyId,
      input.actorUserId,
      input.requestId,
      input.eventName,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata),
    ],
  });
}

export function createCompanyInvitationsRepository(
  database: DatabaseRuntime,
): CompanyInvitationsRepository {
  return Object.freeze<CompanyInvitationsRepository>({
    async getCompany(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'company-invitations-get-company',
            text: `select ${companyColumns} from public.companies where id = $1 limit 1`,
            values: [companyId],
          });
          const row = result.rows[0];
          return row === undefined ? undefined : mapCompany(row);
        },
        { readOnly: true, sessionContext: createSessionContext(context) },
      );
    },

    async findAuthUserByEmail(context, email) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<AuthUserRow>({
            name: 'company-invitations-find-auth-user-by-email',
            text: `
              select id, email
              from auth.users
              where lower(email) = lower($1)
              limit 1
            `,
            values: [email],
          });
          const row = result.rows[0];
          if (row?.email === undefined || row.email === null) {
            return undefined;
          }
          return Object.freeze({
            userId: row.id,
            email: row.email.toLowerCase(),
          });
        },
        { readOnly: true, sessionContext: createSessionContext(context) },
      );
    },

    async getMembershipByUserId(context, companyId, userId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<MembershipRow>({
            name: 'company-invitations-get-membership-by-user',
            text: `
              select ${membershipColumns}
              from public.company_memberships
              where company_id = $1 and user_id = $2
              limit 1
            `,
            values: [companyId, userId],
          });
          const row = result.rows[0];
          return row === undefined ? undefined : mapMembership(row);
        },
        { readOnly: true, sessionContext: createSessionContext(context) },
      );
    },

    async createInvitation(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-create',
            text: `
              insert into public.company_invitations (
                company_id,
                email,
                role,
                token_hash,
                user_id,
                requires_password_setup,
                invited_by,
                expires_at
              ) values ($1, $2, $3, $4, $5, $6, $7, $8)
              on conflict (company_id, email) do update
              set
                role = excluded.role,
                status = 'pending',
                delivery_status = 'pending',
                token_hash = excluded.token_hash,
                user_id = excluded.user_id,
                requires_password_setup = excluded.requires_password_setup,
                invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                accepted_at = null,
                revoked_at = null,
                last_sent_at = null,
                send_count = 0,
                last_delivery_error_code = null
              where public.company_invitations.status = 'revoked'
                 or (
                   public.company_invitations.status = 'pending'
                   and public.company_invitations.expires_at <= now()
                 )
              returning ${invitationColumns}
            `,
            values: [
              companyId,
              input.email,
              input.role,
              input.tokenHash,
              input.userId,
              input.requiresPasswordSetup,
              context.actorUserId,
              input.expiresAt,
            ],
          });
          const row = result.rows[0];
          if (row === undefined) {
            return undefined;
          }
          const invitation = mapInvitation(row);
          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.invitation.created',
            entityType: 'company_invitation',
            entityId: invitation.id,
            metadata: { email: invitation.email, role: invitation.role },
          });
          return invitation;
        },
        { sessionContext: createSessionContext(context) },
      );
    },

    async listInvitations(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-list',
            text: `
              select ${invitationColumns}
              from public.company_invitations
              where company_id = $1
              order by created_at desc, id desc
            `,
            values: [companyId],
          });
          return Object.freeze(result.rows.map(mapInvitation));
        },
        { readOnly: true, sessionContext: createSessionContext(context) },
      );
    },

    async getInvitationById(context, companyId, invitationId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-get-by-id',
            text: `
              select ${invitationColumns}
              from public.company_invitations
              where id = $1 and company_id = $2
              limit 1
            `,
            values: [invitationId, companyId],
          });
          const row = result.rows[0];
          return row === undefined ? undefined : mapInvitation(row);
        },
        { readOnly: true, sessionContext: createSessionContext(context) },
      );
    },

    async getInvitationByTokenHash(context, tokenHash) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-get-by-token',
            text: `
              select ${invitationColumns}
              from public.company_invitations
              where token_hash = $1
              limit 1
            `,
            values: [tokenHash],
          });
          const row = result.rows[0];
          return row === undefined ? undefined : mapInvitation(row);
        },
        { readOnly: true, sessionContext: createSessionContext(context) },
      );
    },

    async updateDelivery(context, invitationId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-update-delivery',
            text: `
              update public.company_invitations
              set
                delivery_status = $2::public.company_invitation_delivery_status,
                user_id = coalesce($3::uuid, user_id),
                last_sent_at = case
                  when $2::public.company_invitation_delivery_status =
                    'sent'::public.company_invitation_delivery_status
                  then now()
                  else last_sent_at
                end,
                send_count = send_count + 1,
                last_delivery_error_code = $4
              where id = $1 and status = 'pending'
              returning ${invitationColumns}
            `,
            values: [invitationId, input.deliveryStatus, input.userId, input.errorCode],
          });
          const row = result.rows[0];
          return row === undefined ? undefined : mapInvitation(row);
        },
        { sessionContext: createSessionContext(context) },
      );
    },

    async rotateInvitation(context, companyId, invitationId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-rotate',
            text: `
              update public.company_invitations
              set
                role = $3,
                token_hash = $4,
                expires_at = $5,
                user_id = $6,
                requires_password_setup = $7,
                delivery_status = 'pending',
                last_delivery_error_code = null
              where id = $1 and company_id = $2 and status = 'pending'
              returning ${invitationColumns}
            `,
            values: [
              invitationId,
              companyId,
              input.role,
              input.tokenHash,
              input.expiresAt,
              input.userId,
              input.requiresPasswordSetup,
            ],
          });
          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const invitation = mapInvitation(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.invitation.resent',
            entityType: 'company_invitation',
            entityId: invitation.id,
            metadata: { email: invitation.email, role: invitation.role },
          });

          return invitation;
        },
        { sessionContext: createSessionContext(context) },
      );
    },

    async revokeInvitation(context, companyId, invitationId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvitationRow>({
            name: 'company-invitations-revoke',
            text: `
              update public.company_invitations
              set status = 'revoked', revoked_at = now()
              where id = $1 and company_id = $2 and status = 'pending'
              returning ${invitationColumns}
            `,
            values: [invitationId, companyId],
          });
          const row = result.rows[0];
          if (row === undefined) {
            return undefined;
          }
          const invitation = mapInvitation(row);
          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.invitation.revoked',
            entityType: 'company_invitation',
            entityId: invitation.id,
            metadata: { email: invitation.email, role: invitation.role },
          });
          return invitation;
        },
        { sessionContext: createSessionContext(context) },
      );
    },

    async acceptInvitation(context, tokenHash, actorEmail) {
      return database.transaction(
        async (transaction) => {
          const invitationResult = await transaction.query<InvitationRow>({
            name: 'company-invitations-lock-for-acceptance',
            text: `
              select ${invitationColumns}
              from public.company_invitations
              where token_hash = $1
                and status = 'pending'
                and expires_at > now()
                and lower(email) = lower($2)
                and (user_id is null or user_id = $3)
              for update
            `,
            values: [tokenHash, actorEmail, context.actorUserId],
          });
          const invitationRow = invitationResult.rows[0];
          if (invitationRow === undefined) {
            return undefined;
          }

          const membershipResult = await transaction.query<MembershipRow>({
            name: 'company-invitations-activate-membership',
            text: `
              insert into public.company_memberships (
                company_id,
                user_id,
                role,
                status,
                invited_by,
                joined_at
              ) values ($1, $2, $3, 'active', $4, now())
              on conflict (company_id, user_id) do update
              set
                role = excluded.role,
                status = 'active',
                joined_at = coalesce(public.company_memberships.joined_at, now())
              where public.company_memberships.status = 'invited'
              returning ${membershipColumns}
            `,
            values: [
              invitationRow.company_id,
              context.actorUserId,
              invitationRow.role,
              invitationRow.invited_by,
            ],
          });
          const membershipRow = membershipResult.rows[0];
          if (membershipRow === undefined) {
            return undefined;
          }

          const acceptedResult = await transaction.query<InvitationRow>({
            name: 'company-invitations-mark-accepted',
            text: `
              update public.company_invitations
              set status = 'accepted', accepted_at = now(), user_id = $2
              where id = $1
              returning ${invitationColumns}
            `,
            values: [invitationRow.id, context.actorUserId],
          });
          const acceptedRow = acceptedResult.rows[0];
          if (acceptedRow === undefined) {
            return undefined;
          }

          const companyResult = await transaction.query<CompanyRow>({
            name: 'company-invitations-get-accepted-company',
            text: `select ${companyColumns} from public.companies where id = $1 limit 1`,
            values: [invitationRow.company_id],
          });
          const companyRow = companyResult.rows[0];
          if (companyRow === undefined) {
            return undefined;
          }

          await writeAuditEvent(transaction, {
            companyId: invitationRow.company_id,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.invitation.accepted',
            entityType: 'company_invitation',
            entityId: invitationRow.id,
            metadata: {
              email: invitationRow.email,
              role: invitationRow.role,
              membershipId: membershipRow.id,
            },
          });

          return Object.freeze({
            invitation: mapInvitation(acceptedRow),
            membership: mapMembership(membershipRow),
            company: mapCompany(companyRow),
          });
        },
        { sessionContext: createSessionContext(context) },
      );
    },
  });
}
