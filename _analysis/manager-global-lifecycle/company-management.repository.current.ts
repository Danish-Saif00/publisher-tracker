import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';
import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  CompanyMembershipRecord,
  CompanyRecord,
  CompanyRepositoryContext,
  CompanyStatus,
  CreateCompanyInput,
  InviteCompanyMembershipInput,
  UpdateCompanyMembershipInput,
} from './company-management.types.js';

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

type CompanyMembershipRow = Readonly<{
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

export interface CompanyManagementRepository {
  createCompany(
    context: CompanyRepositoryContext,
    input: Required<CreateCompanyInput>,
  ): Promise<CompanyRecord | undefined>;

  listCompanies(context: CompanyRepositoryContext): Promise<readonly CompanyRecord[]>;

  listAccessibleCompanies(
    context: CompanyRepositoryContext,
    userId: string,
  ): Promise<readonly CompanyRecord[]>;

  getCompany(
    context: CompanyRepositoryContext,
    companyId: string,
  ): Promise<CompanyRecord | undefined>;

  getMembership(
    context: CompanyRepositoryContext,
    companyId: string,
    membershipId: string,
  ): Promise<CompanyMembershipRecord | undefined>;

  listMemberships(
    context: CompanyRepositoryContext,
    companyId: string,
  ): Promise<readonly CompanyMembershipRecord[]>;

  inviteMembership(
    context: CompanyRepositoryContext,
    companyId: string,
    input: InviteCompanyMembershipInput,
  ): Promise<CompanyMembershipRecord | undefined>;

  updateMembership(
    context: CompanyRepositoryContext,
    companyId: string,
    membershipId: string,
    input: UpdateCompanyMembershipInput,
  ): Promise<CompanyMembershipRecord | undefined>;
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

function mapMembershipRow(row: CompanyMembershipRow): CompanyMembershipRecord {
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
    name: 'company-management-write-audit-event',
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

export function createCompanyManagementRepository(
  database: DatabaseRuntime,
): CompanyManagementRepository {
  return Object.freeze<CompanyManagementRepository>({
    async createCompany(
      context: Parameters<CompanyManagementRepository['createCompany']>[0],
      input: Parameters<CompanyManagementRepository['createCompany']>[1],
    ): Promise<CompanyRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'company-management-create-company',
            text: `
                insert into public.companies (
                  slug,
                  name,
                  timezone,
                  created_by
                )
                values (
                  $1,
                  $2,
                  $3,
                  $4
                )
                on conflict (slug) do nothing
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
            values: [input.slug, input.name, input.timezone, context.actorUserId],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const company = mapCompanyRow(row);

          await writeAuditEvent(transaction, {
            companyId: company.id,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.created',
            entityType: 'company',
            entityId: company.id,
            metadata: {
              slug: company.slug,
              name: company.name,
              timezone: company.timezone,
            },
          });

          return company;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanies(context): Promise<readonly CompanyRecord[]> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'company-management-list-companies',
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
                order by created_at desc, id desc
              `,
          });

          return Object.freeze(result.rows.map(mapCompanyRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listAccessibleCompanies(context, userId): Promise<readonly CompanyRecord[]> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'company-management-list-accessible-companies',
            text: `
                select
                  company.id,
                  company.slug,
                  company.name,
                  company.status,
                  company.timezone,
                  company.created_by,
                  company.created_at,
                  company.updated_at
                from public.company_memberships as membership
                inner join public.companies as company
                  on company.id = membership.company_id
                where membership.user_id = $1
                  and membership.status = 'active'
                  and company.status = 'active'
                order by company.name asc, company.id asc
              `,
            values: [userId],
          });

          return Object.freeze(result.rows.map(mapCompanyRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getCompany(context, companyId): Promise<CompanyRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'company-management-get-company',
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

    async getMembership(
      context,
      companyId,
      membershipId,
    ): Promise<CompanyMembershipRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyMembershipRow>({
            name: 'company-management-get-membership',
            text: `
                select
                  id,
                  company_id,
                  user_id,
                  role,
                  status,
                  invited_by,
                  joined_at,
                  created_at,
                  updated_at
                from public.company_memberships
                where id = $1
                  and company_id = $2
                limit 1
              `,
            values: [membershipId, companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapMembershipRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listMemberships(context, companyId): Promise<readonly CompanyMembershipRecord[]> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyMembershipRow>({
            name: 'company-management-list-memberships',
            text: `
                select
                  id,
                  company_id,
                  user_id,
                  role,
                  status,
                  invited_by,
                  joined_at,
                  created_at,
                  updated_at
                from public.company_memberships
                where company_id = $1
                order by created_at asc, id asc
              `,
            values: [companyId],
          });

          return Object.freeze(result.rows.map(mapMembershipRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async inviteMembership(
      context,
      companyId,
      input,
    ): Promise<CompanyMembershipRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyMembershipRow>({
            name: 'company-management-invite-membership',
            text: `
                insert into public.company_memberships (
                  company_id,
                  user_id,
                  role,
                  status,
                  invited_by
                )
                values (
                  $1,
                  $2,
                  $3,
                  'invited',
                  $4
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
              `,
            values: [companyId, input.userId, input.role, context.actorUserId],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const membership = mapMembershipRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.membership.invited',
            entityType: 'company_membership',
            entityId: membership.id,
            metadata: {
              userId: membership.userId,
              role: membership.role,
              status: membership.status,
            },
          });

          return membership;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateMembership(
      context,
      companyId,
      membershipId,
      input,
    ): Promise<CompanyMembershipRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyMembershipRow>({
            name: 'company-management-update-membership',
            text: `
                update public.company_memberships
                set
                  role = coalesce(
                    $3::public.company_role,
                    role
                  ),
                  status = coalesce(
                    $4::public.company_membership_status,
                    status
                  ),
                  joined_at = case
                    when coalesce(
                      $4::public.company_membership_status,
                      status
                    ) = 'active'
                    then coalesce(joined_at, now())
                    else joined_at
                  end
                where id = $1
                  and company_id = $2
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
              `,
            values: [membershipId, companyId, input.role ?? null, input.status ?? null],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const membership = mapMembershipRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company.membership.updated',
            entityType: 'company_membership',
            entityId: membership.id,
            metadata: {
              userId: membership.userId,
              role: membership.role,
              status: membership.status,
            },
          });

          return membership;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
