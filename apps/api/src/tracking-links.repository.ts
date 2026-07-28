import type { CompanyMembershipStatus } from '@affiliate-tracker/contracts';
import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  TrackingLinkAssignmentRecord,
  TrackingLinkCompanyRecord,
  TrackingLinkDomainRecord,
  TrackingLinkOfferRecord,
  TrackingLinkOwnerRecord,
  TrackingLinkOwnerRole,
  TrackingLinkQueryParameters,
  TrackingLinkRecord,
  TrackingLinksRepositoryContext,
  TrackingLinkStatus,
  TrackingLinkWriteInput,
} from './tracking-links.types.js';

type CompanyRow = Readonly<{
  id: string;
  status: string;
}> &
  Record<string, unknown>;

type OfferRow = Readonly<{
  id: string;
  company_id: string;
  code: string;
  name: string;
  destination_url: string;
  tracking_domain_id: string | null;
  status: string;
}> &
  Record<string, unknown>;

type DomainRow = Readonly<{
  id: string;
  company_id: string;
  hostname: string;
  status: string;
}> &
  Record<string, unknown>;

type OwnerRow = Readonly<{
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  status: string;
}> &
  Record<string, unknown>;

type AssignmentRow = Readonly<{
  id: string;
  company_id: string;
  offer_id: string;
  membership_id: string;
  status: string;
}> &
  Record<string, unknown>;

type TrackingLinkRow = Readonly<{
  id: string;
  company_id: string;
  offer_id: string;
  offer_code: string;
  offer_name: string;
  tracking_domain_id: string;
  hostname: string;
  owner_membership_id: string;
  owner_user_id: string;
  owner_role: string;
  owner_membership_status: string;
  tracking_code: string;
  custom_slug: string | null;
  destination_url: string;
  query_parameters: unknown;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

export interface TrackingLinksRepository {
  getCompany(
    context: TrackingLinksRepositoryContext,
    companyId: string,
  ): Promise<TrackingLinkCompanyRecord | undefined>;

  getOffer(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    offerId: string,
  ): Promise<TrackingLinkOfferRecord | undefined>;

  getTrackingDomain(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    trackingDomainId: string,
  ): Promise<TrackingLinkDomainRecord | undefined>;

  getOwnerMembership(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    membershipId: string,
  ): Promise<TrackingLinkOwnerRecord | undefined>;

  getOfferAssignment(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    offerId: string,
    membershipId: string,
  ): Promise<TrackingLinkAssignmentRecord | undefined>;

  createTrackingLink(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    input: TrackingLinkWriteInput,
  ): Promise<TrackingLinkRecord | undefined>;

  listTrackingLinks(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    query: {
      readonly offerId?: string;
      readonly ownerMembershipId?: string;
      readonly status?: TrackingLinkStatus;
      readonly visibleToUserId?: string;
    },
  ): Promise<readonly TrackingLinkRecord[]>;

  getTrackingLink(
    context: TrackingLinksRepositoryContext,
    companyId: string,
    linkId: string,
    visibleToUserId?: string,
  ): Promise<TrackingLinkRecord | undefined>;

  updateTrackingLink(
    context: TrackingLinksRepositoryContext,
    current: TrackingLinkRecord,
    input: TrackingLinkWriteInput,
  ): Promise<TrackingLinkRecord | undefined>;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid timestamp.');
  }

  return date.toISOString();
}

function parseCompanyStatus(value: string): TrackingLinkCompanyRecord['status'] {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function parseOfferStatus(value: string): TrackingLinkOfferRecord['status'] {
  switch (value) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported offer status.');
  }
}

function parseDomainStatus(value: string): TrackingLinkDomainRecord['status'] {
  switch (value) {
    case 'pending_verification':
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported tracking-domain status.');
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

function parseOwnerRole(value: string): TrackingLinkOwnerRole {
  switch (value) {
    case 'manager':
    case 'publisher':
      return value;
    default:
      throw new Error('The database returned an unsupported tracking-link owner role.');
  }
}

function parseAssignmentStatus(value: string): TrackingLinkAssignmentRecord['status'] {
  switch (value) {
    case 'active':
    case 'paused':
    case 'revoked':
      return value;
    default:
      throw new Error('The database returned an unsupported offer-assignment status.');
  }
}

function parseTrackingLinkStatus(value: string): TrackingLinkStatus {
  switch (value) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported tracking-link status.');
  }
}

function normalizeQueryParameters(value: unknown): TrackingLinkQueryParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The database returned invalid tracking-link query parameters.');
  }

  const normalizedParameters: Record<string, string> = {};

  for (const [key, parameterValue] of Object.entries(value)) {
    if (typeof parameterValue !== 'string') {
      throw new Error('The database returned a non-string tracking-link query parameter.');
    }

    normalizedParameters[key] = parameterValue;
  }

  return Object.freeze(normalizedParameters);
}

function mapCompanyRow(row: CompanyRow): TrackingLinkCompanyRecord {
  return Object.freeze({
    id: row.id,
    status: parseCompanyStatus(row.status),
  });
}

function mapOfferRow(row: OfferRow): TrackingLinkOfferRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    code: row.code,
    name: row.name,
    destinationUrl: row.destination_url,
    trackingDomainId: row.tracking_domain_id,
    status: parseOfferStatus(row.status),
  });
}

function mapDomainRow(row: DomainRow): TrackingLinkDomainRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    hostname: row.hostname,
    status: parseDomainStatus(row.status),
  });
}

function mapOwnerRow(row: OwnerRow): TrackingLinkOwnerRecord {
  return Object.freeze({
    membershipId: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    role: parseOwnerRole(row.role),
    status: parseMembershipStatus(row.status),
  });
}

function mapAssignmentRow(row: AssignmentRow): TrackingLinkAssignmentRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    offerId: row.offer_id,
    membershipId: row.membership_id,
    status: parseAssignmentStatus(row.status),
  });
}

function mapTrackingLinkRow(row: TrackingLinkRow): TrackingLinkRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    offerId: row.offer_id,
    offerCode: row.offer_code,
    offerName: row.offer_name,
    trackingDomainId: row.tracking_domain_id,
    hostname: row.hostname,
    ownerMembershipId: row.owner_membership_id,
    ownerUserId: row.owner_user_id,
    ownerRole: parseOwnerRole(row.owner_role),
    ownerMembershipStatus: parseMembershipStatus(row.owner_membership_status),
    trackingCode: row.tracking_code,
    customSlug: row.custom_slug,
    destinationUrl: row.destination_url,
    queryParameters: normalizeQueryParameters(row.query_parameters),
    status: parseTrackingLinkStatus(row.status),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function createDatabaseSessionContext(
  context: TrackingLinksRepositoryContext,
): DatabaseExecutionContext {
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

async function writeAuditEvent(
  transaction: DatabaseTransaction,
  input: {
    readonly companyId: string;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly eventName: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await transaction.query({
    name: 'tracking-links-write-audit-event',
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
        'tracking_link',
        $5,
        $6::jsonb
      )
    `,
    values: [
      input.companyId,
      input.actorUserId,
      input.requestId,
      input.eventName,
      input.entityId,
      JSON.stringify(input.metadata),
    ],
  });
}

const trackingLinkColumns = `
  link.id,
  link.company_id,
  link.offer_id,
  offer.code as offer_code,
  offer.name as offer_name,
  link.tracking_domain_id,
  domain.hostname,
  link.owner_membership_id,
  membership.user_id as owner_user_id,
  membership.role as owner_role,
  membership.status as owner_membership_status,
  link.tracking_code,
  link.custom_slug,
  link.destination_url,
  link.query_parameters,
  link.status,
  link.created_by,
  link.updated_by,
  link.created_at,
  link.updated_at
`;

const trackingLinkJoins = `
  inner join public.offers as offer
    on offer.id = link.offer_id
  inner join public.tracking_domains as domain
    on domain.id = link.tracking_domain_id
  inner join public.company_memberships as membership
    on membership.id = link.owner_membership_id
`;

export function createTrackingLinksRepository(database: DatabaseRuntime): TrackingLinksRepository {
  return Object.freeze<TrackingLinksRepository>({
    async getCompany(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'tracking-links-get-company',
            text: `
              select
                id,
                status
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

    async getOffer(context, companyId, offerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<OfferRow>({
            name: 'tracking-links-get-offer',
            text: `
              select
                offer.id,
                offer.company_id,
                offer.code,
                offer.name,
                offer.destination_url,
                configuration.tracking_domain_id,
                offer.status
              from public.offers as offer
              left join public.offer_operational_configurations as configuration
                on configuration.offer_id = offer.id
              where offer.id = $1
                and offer.company_id = $2
              limit 1
            `,
            values: [offerId, companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapOfferRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getTrackingDomain(context, companyId, trackingDomainId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<DomainRow>({
            name: 'tracking-links-get-domain',
            text: `
              select
                id,
                company_id,
                hostname,
                status
              from public.tracking_domains
              where id = $1
                and company_id = $2
              limit 1
            `,
            values: [trackingDomainId, companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapDomainRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getOwnerMembership(context, companyId, membershipId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<OwnerRow>({
            name: 'tracking-links-get-owner-membership',
            text: `
              select
                id,
                company_id,
                user_id,
                role,
                status
              from public.company_memberships
              where id = $1
                and company_id = $2
              limit 1
            `,
            values: [membershipId, companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapOwnerRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getOfferAssignment(context, companyId, offerId, membershipId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<AssignmentRow>({
            name: 'tracking-links-get-offer-assignment',
            text: `
              select
                id,
                company_id,
                offer_id,
                membership_id,
                status
              from public.offer_assignments
              where company_id = $1
                and offer_id = $2
                and membership_id = $3
              limit 1
            `,
            values: [companyId, offerId, membershipId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapAssignmentRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createTrackingLink(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<TrackingLinkRow>({
            name: 'tracking-links-create-link',
            text: `
              with inserted as (
                insert into public.tracking_links (
                  company_id,
                  offer_id,
                  tracking_domain_id,
                  owner_membership_id,
                  tracking_code,
                  custom_slug,
                  destination_url,
                  query_parameters,
                  status,
                  created_by,
                  updated_by
                )
                values (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8::jsonb,
                  $9::public.tracking_link_status,
                  $10,
                  $10
                )
                on conflict do nothing
                returning *
              )
              select
                ${trackingLinkColumns}
              from inserted as link
              ${trackingLinkJoins}
            `,
            values: [
              companyId,
              input.offerId,
              input.trackingDomainId,
              input.ownerMembershipId,
              input.trackingCode,
              input.customSlug,
              input.destinationUrl,
              JSON.stringify(input.queryParameters),
              input.status,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const trackingLink = mapTrackingLinkRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'tracking_link.created',
            entityId: trackingLink.id,
            metadata: {
              offerId: trackingLink.offerId,
              trackingDomainId: trackingLink.trackingDomainId,
              ownerMembershipId: trackingLink.ownerMembershipId,
              status: trackingLink.status,
              customSlug: trackingLink.customSlug,
            },
          });

          return trackingLink;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listTrackingLinks(context, companyId, query) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions: string[] = ['link.company_id = $1'];

          if (query.offerId !== undefined) {
            conditions.push(`link.offer_id = ${appendQueryValue(values, query.offerId)}::uuid`);
          }

          if (query.ownerMembershipId !== undefined) {
            conditions.push(
              `link.owner_membership_id = ${appendQueryValue(
                values,
                query.ownerMembershipId,
              )}::uuid`,
            );
          }

          if (query.status !== undefined) {
            conditions.push(
              `link.status = ${appendQueryValue(values, query.status)}::public.tracking_link_status`,
            );
          }

          if (query.visibleToUserId !== undefined) {
            conditions.push(
              `membership.user_id = ${appendQueryValue(values, query.visibleToUserId)}::uuid`,
            );
          }

          const result = await transaction.query<TrackingLinkRow>({
            name: 'tracking-links-list-links',
            text: `
              select
                ${trackingLinkColumns}
              from public.tracking_links as link
              ${trackingLinkJoins}
              where ${conditions.join('\n                and ')}
              order by
                link.created_at desc,
                link.id desc
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapTrackingLinkRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getTrackingLink(context, companyId, linkId, visibleToUserId) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [linkId, companyId];
          const visibilityCondition =
            visibleToUserId === undefined
              ? ''
              : `and membership.user_id = ${appendQueryValue(values, visibleToUserId)}::uuid`;

          const result = await transaction.query<TrackingLinkRow>({
            name: 'tracking-links-get-link',
            text: `
              select
                ${trackingLinkColumns}
              from public.tracking_links as link
              ${trackingLinkJoins}
              where link.id = $1
                and link.company_id = $2
                ${visibilityCondition}
              limit 1
            `,
            values,
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapTrackingLinkRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateTrackingLink(context, current, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<TrackingLinkRow>({
            name: 'tracking-links-update-link',
            text: `
              with updated as (
                update public.tracking_links
                set
                  tracking_domain_id = $3,
                  custom_slug = $4,
                  destination_url = $5,
                  query_parameters = $6::jsonb,
                  status = $7::public.tracking_link_status,
                  updated_by = $8
                where id = $1
                  and company_id = $2
                  and updated_at = $9::timestamptz
                returning *
              )
              select
                ${trackingLinkColumns}
              from updated as link
              ${trackingLinkJoins}
            `,
            values: [
              current.id,
              current.companyId,
              input.trackingDomainId,
              input.customSlug,
              input.destinationUrl,
              JSON.stringify(input.queryParameters),
              input.status,
              context.actorUserId,
              current.updatedAt,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const trackingLink = mapTrackingLinkRow(row);

          await writeAuditEvent(transaction, {
            companyId: trackingLink.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'tracking_link.updated',
            entityId: trackingLink.id,
            metadata: {
              previousStatus: current.status,
              status: trackingLink.status,
              trackingDomainId: trackingLink.trackingDomainId,
              customSlug: trackingLink.customSlug,
            },
          });

          return trackingLink;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
