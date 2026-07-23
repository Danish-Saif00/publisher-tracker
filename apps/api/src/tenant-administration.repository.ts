import type {
  CompanyMembershipStatus,
  CompanyRole,
  PlatformRole,
} from '@affiliate-tracker/contracts';
import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  AuditEventRecord,
  CompanyDirectoryUserRecord,
  CompanyRecord,
  CompanyRepositoryContext,
  CompanyStatus,
  CompanyStatusUpdateResult,
  ListAuditEventsRepositoryQuery,
  ListCompanyUsersRepositoryQuery,
  PaginationCursor,
  RepositoryPage,
  UserProfileRecord,
  UserStatus,
  UserStatusUpdateResult,
} from './tenant-administration.types.js';

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

type CompanyDirectoryUserRow = Readonly<{
  membership_id: string;
  company_id: string;
  user_id: string;
  display_name: string | null;
  avatar_path: string | null;
  user_status: string;
  role: string;
  membership_status: string;
  joined_at: Date | string | null;
  membership_created_at: Date | string;
  membership_updated_at: Date | string;
  profile_updated_at: Date | string;
}> &
  Record<string, unknown>;

type UserProfileRow = Readonly<{
  user_id: string;
  display_name: string | null;
  avatar_path: string | null;
  platform_role: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type AuditEventRow = Readonly<{
  id: string;
  company_id: string | null;
  actor_user_id: string | null;
  request_id: string | null;
  event_name: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: Date | string;
}> &
  Record<string, unknown>;

export interface TenantAdministrationRepository {
  getCompany(
    context: CompanyRepositoryContext,
    companyId: string,
  ): Promise<CompanyRecord | undefined>;

  updateCompanyStatus(
    context: CompanyRepositoryContext,
    companyId: string,
    expectedStatus: CompanyStatus,
    status: CompanyStatus,
  ): Promise<CompanyStatusUpdateResult | undefined>;

  listCompanyUsers(
    context: CompanyRepositoryContext,
    companyId: string,
    query: ListCompanyUsersRepositoryQuery,
  ): Promise<RepositoryPage<CompanyDirectoryUserRecord>>;

  getCompanyUser(
    context: CompanyRepositoryContext,
    companyId: string,
    userId: string,
  ): Promise<CompanyDirectoryUserRecord | undefined>;

  getUserProfile(
    context: CompanyRepositoryContext,
    userId: string,
  ): Promise<UserProfileRecord | undefined>;

  updateUserStatus(
    context: CompanyRepositoryContext,
    userId: string,
    expectedStatus: UserStatus,
    status: UserStatus,
  ): Promise<UserStatusUpdateResult | undefined>;

  listAuditEvents(
    context: CompanyRepositoryContext,
    companyId: string,
    query: ListAuditEventsRepositoryQuery,
  ): Promise<RepositoryPage<AuditEventRecord>>;
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

function parseCompanyStatus(value: string): CompanyStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
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

function parsePlatformRole(value: string | null): PlatformRole | null {
  if (value === null || value === 'platform_super_admin') {
    return value;
  }

  throw new Error('The database returned an unsupported platform role.');
}

function parseMetadata(value: unknown): Readonly<Record<string, unknown>> {
  let parsedValue = value;

  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value) as unknown;
    } catch (error: unknown) {
      throw new Error('The database returned invalid audit metadata.', {
        cause: error,
      });
    }
  }

  if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
    throw new Error('The database returned non-object audit metadata.');
  }

  return Object.freeze({
    ...(parsedValue as Record<string, unknown>),
  });
}

function mapCompanyRow(row: CompanyRow): CompanyRecord {
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

function mapCompanyDirectoryUserRow(row: CompanyDirectoryUserRow): CompanyDirectoryUserRecord {
  return Object.freeze({
    membershipId: row.membership_id,
    companyId: row.company_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    userStatus: parseUserStatus(row.user_status),
    role: parseCompanyRole(row.role),
    membershipStatus: parseMembershipStatus(row.membership_status),
    joinedAt: normalizeOptionalTimestamp(row.joined_at),
    membershipCreatedAt: normalizeTimestamp(row.membership_created_at),
    membershipUpdatedAt: normalizeTimestamp(row.membership_updated_at),
    profileUpdatedAt: normalizeTimestamp(row.profile_updated_at),
  });
}

function mapUserProfileRow(row: UserProfileRow): UserProfileRecord {
  return Object.freeze({
    userId: row.user_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    platformRole: parsePlatformRole(row.platform_role),
    status: parseUserStatus(row.status),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapAuditEventRow(row: AuditEventRow): AuditEventRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    requestId: row.request_id,
    eventName: row.event_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: parseMetadata(row.metadata),
    createdAt: normalizeTimestamp(row.created_at),
  });
}

function createDatabaseSessionContext(context: CompanyRepositoryContext): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    ...(context.companyId !== undefined
      ? {
          companyId: context.companyId,
        }
      : {}),
  };
}

function appendQueryValue(values: unknown[], value: unknown): string {
  values.push(value);

  return `$${String(values.length)}`;
}

function createNextCursor(
  hasMore: boolean,
  lastItem:
    | {
        readonly createdAt: string;
        readonly id: string;
      }
    | undefined,
): PaginationCursor | undefined {
  if (!hasMore || lastItem === undefined) {
    return undefined;
  }

  return Object.freeze({
    createdAt: lastItem.createdAt,
    id: lastItem.id,
  });
}

async function writeAuditEvent(
  transaction: DatabaseTransaction,
  input: {
    readonly companyId: string | null;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly eventName: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await transaction.query({
    name: 'tenant-administration-write-audit-event',
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

export function createTenantAdministrationRepository(
  database: DatabaseRuntime,
): TenantAdministrationRepository {
  return Object.freeze<TenantAdministrationRepository>({
    async getCompany(context, companyId): Promise<CompanyRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'tenant-administration-get-company',
            text: `
                select
                  id,
                  slug,
                  name,
                  status,
                  timezone,
                  created_by,
                  created_at,
                  updated_at
                from public.companies
                where id = $1
                limit 1
              `,
            values: [companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapCompanyRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateCompanyStatus(
      context,
      companyId,
      expectedStatus,
      status,
    ): Promise<CompanyStatusUpdateResult | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'tenant-administration-update-company-status',
            text: `
                update public.companies
                set status = $3::public.company_status
                where id = $1
                  and status = $2::public.company_status
                returning
                  id,
                  slug,
                  name,
                  status,
                  timezone,
                  created_by,
                  created_at,
                  updated_at
              `,
            values: [companyId, expectedStatus, status],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const company = mapCompanyRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.status.updated',
            entityType: 'company',
            entityId: companyId,
            metadata: {
              previousStatus: expectedStatus,
              status: company.status,
            },
          });

          return Object.freeze({
            previousStatus: expectedStatus,
            company,
          });
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanyUsers(
      context,
      companyId,
      query,
    ): Promise<RepositoryPage<CompanyDirectoryUserRecord>> {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['membership.company_id = $1'];

          if (query.role !== undefined) {
            const parameter = appendQueryValue(values, query.role);

            conditions.push(`membership.role = ${parameter}::public.company_role`);
          }

          if (query.membershipStatus !== undefined) {
            const parameter = appendQueryValue(values, query.membershipStatus);

            conditions.push(`membership.status = ${parameter}::public.company_membership_status`);
          }

          if (query.userStatus !== undefined) {
            const parameter = appendQueryValue(values, query.userStatus);

            conditions.push(`profile.status = ${parameter}::public.user_status`);
          }

          if (query.search !== undefined) {
            const parameter = appendQueryValue(values, `%${query.search}%`);

            conditions.push(
              `(coalesce(profile.display_name, '') ilike ${parameter} or membership.user_id::text ilike ${parameter})`,
            );
          }

          if (query.cursor !== undefined) {
            const createdAtParameter = appendQueryValue(values, query.cursor.createdAt);

            const idParameter = appendQueryValue(values, query.cursor.id);

            conditions.push(
              `(membership.created_at, membership.id) < (${createdAtParameter}::timestamptz, ${idParameter}::uuid)`,
            );
          }

          const limitParameter = appendQueryValue(values, query.limit + 1);

          const result = await transaction.query<CompanyDirectoryUserRow>({
            name: 'tenant-administration-list-company-users',
            text: `
                  select
                    membership.id as membership_id,
                    membership.company_id,
                    membership.user_id,
                    profile.display_name,
                    profile.avatar_path,
                    profile.status as user_status,
                    membership.role,
                    membership.status as membership_status,
                    membership.joined_at,
                    membership.created_at as membership_created_at,
                    membership.updated_at as membership_updated_at,
                    profile.updated_at as profile_updated_at
                  from public.company_memberships as membership
                  inner join public.user_profiles as profile
                    on profile.user_id = membership.user_id
                  where ${conditions.join('\n                    and ')}
                  order by
                    membership.created_at desc,
                    membership.id desc
                  limit ${limitParameter}
                `,
            values,
          });

          const hasMore = result.rows.length > query.limit;

          const selectedRows = result.rows.slice(0, query.limit);

          const items = Object.freeze(selectedRows.map(mapCompanyDirectoryUserRow));

          const lastRow = selectedRows.at(-1);

          const nextCursor = createNextCursor(
            hasMore,
            lastRow === undefined
              ? undefined
              : {
                  createdAt: normalizeTimestamp(lastRow.membership_created_at),
                  id: lastRow.membership_id,
                },
          );

          return Object.freeze({
            items,
            ...(nextCursor !== undefined
              ? {
                  nextCursor,
                }
              : {}),
          });
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getCompanyUser(
      context,
      companyId,
      userId,
    ): Promise<CompanyDirectoryUserRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyDirectoryUserRow>({
            name: 'tenant-administration-get-company-user',
            text: `
                  select
                    membership.id as membership_id,
                    membership.company_id,
                    membership.user_id,
                    profile.display_name,
                    profile.avatar_path,
                    profile.status as user_status,
                    membership.role,
                    membership.status as membership_status,
                    membership.joined_at,
                    membership.created_at as membership_created_at,
                    membership.updated_at as membership_updated_at,
                    profile.updated_at as profile_updated_at
                  from public.company_memberships as membership
                  inner join public.user_profiles as profile
                    on profile.user_id = membership.user_id
                  where membership.company_id = $1
                    and membership.user_id = $2
                  limit 1
                `,
            values: [companyId, userId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapCompanyDirectoryUserRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getUserProfile(context, userId): Promise<UserProfileRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<UserProfileRow>({
            name: 'tenant-administration-get-user-profile',
            text: `
                select
                  user_id,
                  display_name,
                  avatar_path,
                  platform_role,
                  status,
                  created_at,
                  updated_at
                from public.user_profiles
                where user_id = $1
                limit 1
              `,
            values: [userId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapUserProfileRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateUserStatus(
      context,
      userId,
      expectedStatus,
      status,
    ): Promise<UserStatusUpdateResult | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<UserProfileRow>({
            name: 'tenant-administration-update-user-status',
            text: `
                update public.user_profiles
                set status = $3::public.user_status
                where user_id = $1
                  and status = $2::public.user_status
                returning
                  user_id,
                  display_name,
                  avatar_path,
                  platform_role,
                  status,
                  created_at,
                  updated_at
              `,
            values: [userId, expectedStatus, status],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const profile = mapUserProfileRow(row);

          await writeAuditEvent(transaction, {
            companyId: null,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'user.status.updated',
            entityType: 'user_profile',
            entityId: userId,
            metadata: {
              previousStatus: expectedStatus,
              status: profile.status,
            },
          });

          return Object.freeze({
            previousStatus: expectedStatus,
            profile,
          });
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listAuditEvents(context, companyId, query): Promise<RepositoryPage<AuditEventRecord>> {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['audit_event.company_id = $1'];

          if (query.eventName !== undefined) {
            const parameter = appendQueryValue(values, query.eventName);

            conditions.push(`audit_event.event_name = ${parameter}`);
          }

          if (query.entityType !== undefined) {
            const parameter = appendQueryValue(values, query.entityType);

            conditions.push(`audit_event.entity_type = ${parameter}`);
          }

          if (query.entityId !== undefined) {
            const parameter = appendQueryValue(values, query.entityId);

            conditions.push(`audit_event.entity_id = ${parameter}`);
          }

          if (query.actorUserId !== undefined) {
            const parameter = appendQueryValue(values, query.actorUserId);

            conditions.push(`audit_event.actor_user_id = ${parameter}::uuid`);
          }

          if (query.cursor !== undefined) {
            const createdAtParameter = appendQueryValue(values, query.cursor.createdAt);

            const idParameter = appendQueryValue(values, query.cursor.id);

            conditions.push(
              `(audit_event.created_at, audit_event.id) < (${createdAtParameter}::timestamptz, ${idParameter}::uuid)`,
            );
          }

          const limitParameter = appendQueryValue(values, query.limit + 1);

          const result = await transaction.query<AuditEventRow>({
            name: 'tenant-administration-list-audit-events',
            text: `
                select
                  audit_event.id,
                  audit_event.company_id,
                  audit_event.actor_user_id,
                  audit_event.request_id,
                  audit_event.event_name,
                  audit_event.entity_type,
                  audit_event.entity_id,
                  audit_event.metadata,
                  audit_event.created_at
                from public.audit_events as audit_event
                where ${conditions.join('\n                  and ')}
                order by
                  audit_event.created_at desc,
                  audit_event.id desc
                limit ${limitParameter}
              `,
            values,
          });

          const hasMore = result.rows.length > query.limit;

          const selectedRows = result.rows.slice(0, query.limit);

          const items = Object.freeze(selectedRows.map(mapAuditEventRow));

          const lastRow = selectedRows.at(-1);

          const nextCursor = createNextCursor(
            hasMore,
            lastRow === undefined
              ? undefined
              : {
                  createdAt: normalizeTimestamp(lastRow.created_at),
                  id: lastRow.id,
                },
          );

          return Object.freeze({
            items,
            ...(nextCursor !== undefined
              ? {
                  nextCursor,
                }
              : {}),
          });
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
