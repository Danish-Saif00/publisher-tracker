import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';
import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  CompanyDirectoryUserRecord,
  CreateActiveManagedMembershipInput,
  ManagedUserRepositoryContext,
} from './managed-users.types.js';
import type { UserStatus } from './tenant-administration.types.js';

type ManagedUserRow = Readonly<{
  membership_id: string;
  company_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_path: string | null;
  user_status: string;
  role: string;
  membership_status: string;
  invited_by: string | null;
  joined_at: Date | string | null;
  membership_created_at: Date | string;
  membership_updated_at: Date | string;
  profile_updated_at: Date | string;
}> &
  Record<string, unknown>;

export interface ManagedUsersRepository {
  createActiveMembership(
    context: ManagedUserRepositoryContext,
    companyId: string,
    input: CreateActiveManagedMembershipInput,
  ): Promise<CompanyDirectoryUserRecord | undefined>;

  recordPasswordReset(
    context: ManagedUserRepositoryContext,
    user: CompanyDirectoryUserRecord,
  ): Promise<void>;
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

function parseCompanyRole(value: string): CompanyRole {
  switch (value) {
    case 'company_admin':
    case 'manager':
    case 'publisher':
      return value;
    default:
      throw new Error('The database returned an unsupported company role.');
  }
}

function parseMembershipStatus(value: string): CompanyMembershipStatus {
  switch (value) {
    case 'invited':
    case 'active':
    case 'suspended':
    case 'revoked':
      return value;
    default:
      throw new Error('The database returned an unsupported membership status.');
  }
}

function parseUserStatus(value: string): UserStatus {
  switch (value) {
    case 'active':
    case 'suspended':
      return value;
    default:
      throw new Error('The database returned an unsupported user status.');
  }
}

function mapManagedUserRow(row: ManagedUserRow): CompanyDirectoryUserRecord {
  return Object.freeze({
    membershipId: row.membership_id,
    companyId: row.company_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    userStatus: parseUserStatus(row.user_status),
    role: parseCompanyRole(row.role),
    membershipStatus: parseMembershipStatus(row.membership_status),
    invitedBy: row.invited_by,
    joinedAt: normalizeOptionalTimestamp(row.joined_at),
    membershipCreatedAt: normalizeTimestamp(row.membership_created_at),
    membershipUpdatedAt: normalizeTimestamp(row.membership_updated_at),
    profileUpdatedAt: normalizeTimestamp(row.profile_updated_at),
  });
}

function createDatabaseSessionContext(
  context: ManagedUserRepositoryContext,
): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    companyId: context.companyId,
  };
}

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
    name: 'managed-users-write-audit-event',
    text: `
      insert into public.audit_events (
        company_id,
        actor_user_id,
        request_id,
        event_name,
        entity_type,
        entity_id,
        metadata
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
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

export function createManagedUsersRepository(database: DatabaseRuntime): ManagedUsersRepository {
  return Object.freeze<ManagedUsersRepository>({
    async createActiveMembership(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ManagedUserRow>({
            name: 'managed-users-create-active-membership',
            text: `
              with inserted_membership as (
                insert into public.company_memberships (
                  company_id,
                  user_id,
                  role,
                  status,
                  invited_by,
                  joined_at
                )
                values (
                  $1,
                  $2,
                  $3::public.company_role,
                  'active',
                  $4,
                  now()
                )
                on conflict (
                  company_id,
                  user_id
                ) do nothing
                returning
                  id,
                  company_id,
                  user_id,
                  role,
                  status,
                  invited_by,
                  joined_at,
                  created_at,
                  updated_at
              )
              select
                membership.id as membership_id,
                membership.company_id,
                membership.user_id,
                auth_user.email,
                profile.display_name,
                profile.avatar_path,
                profile.status as user_status,
                membership.role,
                membership.status as membership_status,
                membership.invited_by,
                membership.joined_at,
                membership.created_at as membership_created_at,
                membership.updated_at as membership_updated_at,
                profile.updated_at as profile_updated_at
              from inserted_membership as membership
              inner join public.user_profiles as profile
                on profile.user_id = membership.user_id
              inner join auth.users as auth_user
                on auth_user.id = membership.user_id
            `,
            values: [companyId, input.userId, input.role, context.actorUserId],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const user = mapManagedUserRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'managed_user.created',
            entityType: 'company_membership',
            entityId: user.membershipId,
            metadata: {
              userId: user.userId,
              role: user.role,
              membershipStatus: user.membershipStatus,
              credentialProvisioning: 'administrator_set',
            },
          });

          return user;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async recordPasswordReset(context, user): Promise<void> {
      await database.transaction(
        async (transaction) => {
          await writeAuditEvent(transaction, {
            companyId: context.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'managed_user.password_reset',
            entityType: 'user',
            entityId: user.userId,
            metadata: {
              membershipId: user.membershipId,
              targetRole: user.role,
              passwordValueRecorded: false,
            },
          });
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
