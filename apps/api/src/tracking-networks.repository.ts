import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  NetworkAccountDependencySummary,
  NetworkAccountRecord,
  NetworkAccountStatus,
  NetworkAccountWriteInput,
  NetworkProviderRecord,
  NetworkProviderStatus,
  NetworkProviderWriteInput,
  TrackingDomainRecord,
  TrackingDomainStatus,
  TrackingDomainWriteInput,
  TrackingNetworkCompanyRecord,
  TrackingNetworkRepositoryContext,
} from './tracking-networks.types.js';

type CompanyRow = Readonly<{
  id: string;
  status: string;
}> &
  Record<string, unknown>;

type TrackingDomainRow = Readonly<{
  id: string;
  company_id: string;
  hostname: string;
  status: string;
  verification_token: string;
  verified_at: Date | string | null;
  is_primary: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkProviderRow = Readonly<{
  id: string;
  company_id: string;
  code: string;
  name: string;
  status: string;
  website_url: string | null;
  documentation_url: string | null;
  default_tracking_parameter: string | null;
  postback_click_id_token: string | null;
  postback_conversion_id_token: string | null;
  postback_revenue_amount_token: string | null;
  postback_revenue_currency_token: string | null;
  postback_conversion_status: string | null;
  integration_configured: boolean;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkAccountRow = Readonly<{
  id: string;
  company_id: string;
  provider_id: string;
  provider_code: string;
  provider_name: string;
  name: string;
  external_account_id: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type NetworkAccountDependencyRow = Readonly<{
  id: string;
  offers: number | string;
  postback_endpoints: number | string;
  tracking_clicks: number | string;
  conversions: number | string;
  duplicate_protection_rules: number | string;
}> &
  Record<string, unknown>;

type CountRow = Readonly<{
  count: string | number;
}> &
  Record<string, unknown>;

export interface TrackingNetworksRepository {
  getCompany(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
  ): Promise<TrackingNetworkCompanyRecord | undefined>;

  createTrackingDomain(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    input: TrackingDomainWriteInput,
  ): Promise<TrackingDomainRecord | undefined>;

  listCompanyTrackingDomains(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
  ): Promise<readonly TrackingDomainRecord[]>;

  listPlatformTrackingDomains(
    context: TrackingNetworkRepositoryContext,
    query: {
      readonly companyId?: string;
      readonly status?: TrackingDomainStatus;
    },
  ): Promise<readonly TrackingDomainRecord[]>;

  getTrackingDomain(
    context: TrackingNetworkRepositoryContext,
    domainId: string,
    companyId?: string,
  ): Promise<TrackingDomainRecord | undefined>;

  updateTrackingDomain(
    context: TrackingNetworkRepositoryContext,
    current: TrackingDomainRecord,
    input: TrackingDomainWriteInput,
    eventName: string,
  ): Promise<TrackingDomainRecord | undefined>;

  createNetworkProvider(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    input: NetworkProviderWriteInput,
  ): Promise<NetworkProviderRecord | undefined>;

  listCompanyNetworkProviders(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    status?: NetworkProviderStatus,
  ): Promise<readonly NetworkProviderRecord[]>;

  getCompanyNetworkProvider(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    providerId: string,
  ): Promise<NetworkProviderRecord | undefined>;

  updateCompanyNetworkProvider(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    current: NetworkProviderRecord,
    input: NetworkProviderWriteInput,
  ): Promise<NetworkProviderRecord | undefined>;

  countOpenNetworkAccountsForProvider(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    providerId: string,
  ): Promise<number>;

  createNetworkAccount(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    input: NetworkAccountWriteInput,
  ): Promise<NetworkAccountRecord | undefined>;

  listCompanyNetworkAccounts(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
  ): Promise<readonly NetworkAccountRecord[]>;

  getNetworkAccount(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    accountId: string,
  ): Promise<NetworkAccountRecord | undefined>;

  getNetworkAccountDependencySummary(
    context: TrackingNetworkRepositoryContext,
    companyId: string,
    accountId: string,
  ): Promise<NetworkAccountDependencySummary | undefined>;

  updateNetworkAccount(
    context: TrackingNetworkRepositoryContext,
    current: NetworkAccountRecord,
    input: NetworkAccountWriteInput,
    eventName: string,
  ): Promise<NetworkAccountRecord | undefined>;
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

function parseCompanyStatus(value: string): TrackingNetworkCompanyRecord['status'] {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function parseTrackingDomainStatus(value: string): TrackingDomainStatus {
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

function parseNetworkProviderStatus(value: string): NetworkProviderStatus {
  switch (value) {
    case 'active':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported network-provider status.');
  }
}

function parseNetworkAccountStatus(value: string): NetworkAccountStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported network-account status.');
  }
}

function mapCompanyRow(row: CompanyRow): TrackingNetworkCompanyRecord {
  return Object.freeze({
    id: row.id,
    status: parseCompanyStatus(row.status),
  });
}

function mapTrackingDomainRow(row: TrackingDomainRow): TrackingDomainRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    hostname: row.hostname,
    status: parseTrackingDomainStatus(row.status),
    verificationToken: row.verification_token,
    verifiedAt: normalizeOptionalTimestamp(row.verified_at),
    isPrimary: row.is_primary,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapNetworkProviderRow(row: NetworkProviderRow): NetworkProviderRecord {
  const postbackConversionStatus = row.postback_conversion_status ?? 'approved';

  if (postbackConversionStatus !== 'pending' && postbackConversionStatus !== 'approved') {
    throw new Error('The database returned an unsupported provider postback status.');
  }

  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    code: row.code,
    name: row.name,
    status: parseNetworkProviderStatus(row.status),
    websiteUrl: row.website_url,
    documentationUrl: row.documentation_url,
    integration: Object.freeze({
      defaultTrackingParameter: row.default_tracking_parameter,
      postbackClickIdToken: row.postback_click_id_token,
      postbackConversionIdToken: row.postback_conversion_id_token,
      postbackRevenueAmountToken: row.postback_revenue_amount_token,
      postbackRevenueCurrencyToken: row.postback_revenue_currency_token,
      postbackConversionStatus,
      configured: row.integration_configured,
    }),
    createdBy: row.created_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapNetworkAccountRow(row: NetworkAccountRow): NetworkAccountRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    providerId: row.provider_id,
    providerCode: row.provider_code,
    providerName: row.provider_name,
    name: row.name,
    externalAccountId: row.external_account_id,
    status: parseNetworkAccountStatus(row.status),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function normalizeCount(value: number | string): number {
  const count = typeof value === 'number' ? value : Number.parseInt(value, 10);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('The database returned an invalid dependency count.');
  }

  return count;
}

function mapNetworkAccountDependencySummary(
  row: NetworkAccountDependencyRow,
): NetworkAccountDependencySummary {
  return Object.freeze({
    offers: normalizeCount(row.offers),
    postbackEndpoints: normalizeCount(row.postback_endpoints),
    trackingClicks: normalizeCount(row.tracking_clicks),
    conversions: normalizeCount(row.conversions),
    duplicateProtectionRules: normalizeCount(row.duplicate_protection_rules),
  });
}

function createDatabaseSessionContext(
  context: TrackingNetworkRepositoryContext,
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
    name: 'tracking-networks-write-audit-event',
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

const networkProviderSelection = `
  select
    provider.id,
    provider.company_id,
    provider.code,
    provider.name,
    provider.status,
    provider.website_url,
    provider.documentation_url,
    integration.default_tracking_parameter,
    integration.postback_click_id_token,
    integration.postback_conversion_id_token,
    integration.postback_revenue_amount_token,
    integration.postback_revenue_currency_token,
    integration.postback_conversion_status,
    (
      integration.postback_click_id_token is not null
      and integration.postback_conversion_id_token is not null
    ) as integration_configured,
    provider.created_by,
    provider.created_at,
    provider.updated_at
  from public.network_providers as provider
  left join public.network_provider_integration_configurations as integration
    on integration.provider_id = provider.id
   and integration.company_id = provider.company_id
`;

const networkAccountSelection = `
  select
    account.id,
    account.company_id,
    account.provider_id,
    provider.code as provider_code,
    provider.name as provider_name,
    account.name,
    account.external_account_id,
    account.status,
    account.created_by,
    account.updated_by,
    account.created_at,
    account.updated_at
  from public.network_accounts as account
  inner join public.network_providers as provider
    on provider.id = account.provider_id
    and provider.company_id = account.company_id
`;

export function createTrackingNetworksRepository(
  database: DatabaseRuntime,
): TrackingNetworksRepository {
  return Object.freeze<TrackingNetworksRepository>({
    async getCompany(context, companyId): Promise<TrackingNetworkCompanyRecord | undefined> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'tracking-networks-get-company',
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

    async createTrackingDomain(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-create-domain',
            text: `
              insert into public.tracking_domains (
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3::public.tracking_domain_status,
                $4,
                $5,
                $6,
                $7,
                $7
              )
              on conflict do nothing
              returning
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              companyId,
              input.hostname,
              input.status,
              input.verificationToken,
              input.verifiedAt,
              input.isPrimary,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const domain = mapTrackingDomainRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'tracking_domain.created',
            entityType: 'tracking_domain',
            entityId: domain.id,
            metadata: {
              hostname: domain.hostname,
              status: domain.status,
            },
          });

          return domain;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanyTrackingDomains(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-list-company-domains',
            text: `
              select
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.tracking_domains
              where company_id = $1
              order by
                is_primary desc,
                created_at desc,
                id desc
            `,
            values: [companyId],
          });

          return Object.freeze(result.rows.map(mapTrackingDomainRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listPlatformTrackingDomains(context, query) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [];
          const conditions: string[] = [];

          if (query.companyId !== undefined) {
            conditions.push(`company_id = ${appendQueryValue(values, query.companyId)}::uuid`);
          }

          if (query.status !== undefined) {
            conditions.push(
              `status = ${appendQueryValue(values, query.status)}::public.tracking_domain_status`,
            );
          }

          const whereClause =
            conditions.length === 0 ? '' : `where ${conditions.join('\n                and ')}`;

          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-list-platform-domains',
            text: `
              select
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.tracking_domains
              ${whereClause}
              order by
                created_at desc,
                id desc
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapTrackingDomainRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getTrackingDomain(context, domainId, companyId) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [domainId];
          const companyCondition =
            companyId === undefined
              ? ''
              : `and company_id = ${appendQueryValue(values, companyId)}::uuid`;

          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-get-domain',
            text: `
              select
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.tracking_domains
              where id = $1
                ${companyCondition}
              limit 1
            `,
            values,
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapTrackingDomainRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateTrackingDomain(context, current, input, eventName) {
      return database.transaction(
        async (transaction) => {
          if (input.isPrimary) {
            await transaction.query({
              name: 'tracking-networks-clear-primary-domain',
              text: `
                update public.tracking_domains
                set is_primary = false
                where company_id = $1
                  and id <> $2
                  and is_primary
              `,
              values: [current.companyId, current.id],
            });
          }

          const result = await transaction.query<TrackingDomainRow>({
            name: 'tracking-networks-update-domain',
            text: `
              update public.tracking_domains
              set
                hostname = $4,
                status = $5::public.tracking_domain_status,
                verification_token = $6,
                verified_at = $7,
                is_primary = $8,
                updated_by = $9
              where id = $1
                and company_id = $2
                and date_trunc('milliseconds', updated_at) = $3::timestamptz
                and not exists (
                  select 1
                  from public.tracking_domains as conflicting_domain
                  where conflicting_domain.hostname = $4
                    and conflicting_domain.id <> $1
                )
              returning
                id,
                company_id,
                hostname,
                status,
                verification_token,
                verified_at,
                is_primary,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              current.id,
              current.companyId,
              current.updatedAt,
              input.hostname,
              input.status,
              input.verificationToken,
              input.verifiedAt,
              input.isPrimary,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const domain = mapTrackingDomainRow(row);

          await writeAuditEvent(transaction, {
            companyId: domain.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName,
            entityType: 'tracking_domain',
            entityId: domain.id,
            metadata: {
              previousHostname: current.hostname,
              hostname: domain.hostname,
              previousStatus: current.status,
              status: domain.status,
              previousPrimary: current.isPrimary,
              isPrimary: domain.isPrimary,
              verifiedAt: domain.verifiedAt,
            },
          });

          return domain;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createNetworkProvider(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const inserted = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'tracking-networks-create-provider',
            text: `
              insert into public.network_providers (
                company_id,
                code,
                name,
                status,
                website_url,
                documentation_url,
                created_by
              )
              values ($1, $2, $3, $4::public.network_provider_status, $5, $6, $7)
              on conflict do nothing
              returning id
            `,
            values: [
              companyId,
              input.code,
              input.name,
              input.status,
              input.websiteUrl,
              input.documentationUrl,
              context.actorUserId,
            ],
          });

          const providerId = inserted.rows[0]?.id;

          if (providerId === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'tracking-networks-create-provider-integration',
            text: `
              insert into public.network_provider_integration_configurations (
                provider_id,
                company_id,
                default_tracking_parameter,
                postback_click_id_token,
                postback_conversion_id_token,
                postback_revenue_amount_token,
                postback_revenue_currency_token,
                postback_conversion_status,
                created_by,
                updated_by
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8::public.conversion_status, $9, $9)
            `,
            values: [
              providerId,
              companyId,
              input.integration.defaultTrackingParameter,
              input.integration.postbackClickIdToken,
              input.integration.postbackConversionIdToken,
              input.integration.postbackRevenueAmountToken,
              input.integration.postbackRevenueCurrencyToken,
              input.integration.postbackConversionStatus,
              context.actorUserId,
            ],
          });

          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-get-created-provider',
            text: `
              ${networkProviderSelection}
              where provider.id = $1
                and provider.company_id = $2
              limit 1
            `,
            values: [providerId, companyId],
          });
          const row = result.rows[0];

          if (row === undefined) {
            throw new Error('The created provider could not be reloaded.');
          }

          const provider = mapNetworkProviderRow(row);

          await writeAuditEvent(transaction, {
            companyId: provider.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'network_provider.created',
            entityType: 'network_provider',
            entityId: provider.id,
            metadata: {
              code: provider.code,
              name: provider.name,
              status: provider.status,
              integrationConfigured: provider.integration.configured,
            },
          });

          return provider;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanyNetworkProviders(context, companyId, status) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-list-company-providers',
            text: `
              ${networkProviderSelection}
              where provider.company_id = $1
                and (
                  $2::public.network_provider_status is null
                  or provider.status = $2::public.network_provider_status
                )
              order by
                case when provider.status = 'active' then 0 else 1 end,
                provider.name asc,
                provider.id asc
            `,
            values: [companyId, status ?? null],
          });

          return Object.freeze(result.rows.map(mapNetworkProviderRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getCompanyNetworkProvider(context, companyId, providerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-get-company-provider',
            text: `
              ${networkProviderSelection}
              where provider.company_id = $1
                and provider.id = $2
              limit 1
            `,
            values: [companyId, providerId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapNetworkProviderRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateCompanyNetworkProvider(context, companyId, current, input) {
      return database.transaction(
        async (transaction) => {
          const updated = await transaction.query<{ id: string } & Record<string, unknown>>({
            name: 'tracking-networks-update-company-provider',
            text: `
              update public.network_providers
              set
                name = $4,
                status = $5::public.network_provider_status,
                website_url = $6,
                documentation_url = $7
              where id = $1
                and company_id = $2
                and date_trunc('milliseconds', updated_at) = $3::timestamptz
              returning id
            `,
            values: [
              current.id,
              companyId,
              current.updatedAt,
              input.name,
              input.status,
              input.websiteUrl,
              input.documentationUrl,
            ],
          });

          if (updated.rows[0] === undefined) {
            return undefined;
          }

          await transaction.query({
            name: 'tracking-networks-upsert-provider-integration',
            text: `
              insert into public.network_provider_integration_configurations (
                provider_id,
                company_id,
                default_tracking_parameter,
                postback_click_id_token,
                postback_conversion_id_token,
                postback_revenue_amount_token,
                postback_revenue_currency_token,
                postback_conversion_status,
                created_by,
                updated_by
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8::public.conversion_status, $9, $9)
              on conflict (provider_id) do update
              set
                default_tracking_parameter = excluded.default_tracking_parameter,
                postback_click_id_token = excluded.postback_click_id_token,
                postback_conversion_id_token = excluded.postback_conversion_id_token,
                postback_revenue_amount_token = excluded.postback_revenue_amount_token,
                postback_revenue_currency_token = excluded.postback_revenue_currency_token,
                postback_conversion_status = excluded.postback_conversion_status,
                updated_by = excluded.updated_by
            `,
            values: [
              current.id,
              companyId,
              input.integration.defaultTrackingParameter,
              input.integration.postbackClickIdToken,
              input.integration.postbackConversionIdToken,
              input.integration.postbackRevenueAmountToken,
              input.integration.postbackRevenueCurrencyToken,
              input.integration.postbackConversionStatus,
              context.actorUserId,
            ],
          });

          const result = await transaction.query<NetworkProviderRow>({
            name: 'tracking-networks-get-updated-provider',
            text: `
              ${networkProviderSelection}
              where provider.id = $1
                and provider.company_id = $2
              limit 1
            `,
            values: [current.id, companyId],
          });
          const row = result.rows[0];

          if (row === undefined) {
            throw new Error('The updated provider could not be reloaded.');
          }

          const provider = mapNetworkProviderRow(row);

          await writeAuditEvent(transaction, {
            companyId: provider.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'network_provider.updated',
            entityType: 'network_provider',
            entityId: provider.id,
            metadata: {
              code: provider.code,
              previousStatus: current.status,
              status: provider.status,
              previousName: current.name,
              name: provider.name,
              integrationConfigured: provider.integration.configured,
            },
          });

          return provider;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async countOpenNetworkAccountsForProvider(context, companyId, providerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CountRow>({
            name: 'tracking-networks-count-company-provider-accounts',
            text: `
              select count(*) as count
              from public.network_accounts
              where company_id = $1
                and provider_id = $2
                and status <> 'archived'
            `,
            values: [companyId, providerId],
          });

          const value = result.rows[0]?.count ?? 0;
          const count = typeof value === 'number' ? value : Number.parseInt(value, 10);

          if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error('The database returned an invalid network-account count.');
          }

          return count;
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createNetworkAccount(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-create-account',
            text: `
              insert into public.network_accounts (
                company_id,
                provider_id,
                name,
                external_account_id,
                status,
                created_by,
                updated_by
              )
              select
                $1,
                provider.id,
                $3,
                $4,
                $5::public.network_account_status,
                $6,
                $6
              from public.network_providers as provider
              where provider.id = $2
                and provider.company_id = $1
                and provider.status = 'active'
              on conflict do nothing
              returning
                id,
                company_id,
                provider_id,
                (
                  select code
                  from public.network_providers
                  where id = provider_id
                ) as provider_code,
                (
                  select name
                  from public.network_providers
                  where id = provider_id
                ) as provider_name,
                name,
                external_account_id,
                status,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              companyId,
              input.providerId,
              input.name,
              input.externalAccountId,
              input.status,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const account = mapNetworkAccountRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'network_account.created',
            entityType: 'network_account',
            entityId: account.id,
            metadata: {
              providerId: account.providerId,
              providerCode: account.providerCode,
              name: account.name,
              status: account.status,
            },
          });

          return account;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listCompanyNetworkAccounts(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-list-company-accounts',
            text: `
              ${networkAccountSelection}
              where account.company_id = $1
              order by
                provider.name asc,
                account.name asc,
                account.id asc
            `,
            values: [companyId],
          });

          return Object.freeze(result.rows.map(mapNetworkAccountRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getNetworkAccount(context, companyId, accountId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-get-company-account',
            text: `
              ${networkAccountSelection}
              where account.company_id = $1
                and account.id = $2
              limit 1
            `,
            values: [companyId, accountId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapNetworkAccountRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getNetworkAccountDependencySummary(context, companyId, accountId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountDependencyRow>({
            name: 'tracking-networks-account-dependency-summary',
            text: `
              select
                account.id,
                (
                  select count(*)
                  from public.offers as offer
                  where offer.company_id = account.company_id
                    and offer.network_account_id = account.id
                ) as offers,
                (
                  select count(*)
                  from public.network_postback_endpoints as endpoint
                  where endpoint.company_id = account.company_id
                    and endpoint.network_account_id = account.id
                ) as postback_endpoints,
                (
                  select count(*)
                  from public.tracking_clicks as click
                  where click.company_id = account.company_id
                    and click.network_account_id = account.id
                ) as tracking_clicks,
                (
                  select count(*)
                  from public.conversions as conversion
                  where conversion.company_id = account.company_id
                    and conversion.network_account_id = account.id
                ) as conversions,
                (
                  select count(*)
                  from public.duplicate_protection_rules as duplicate_rule
                  where duplicate_rule.company_id = account.company_id
                    and duplicate_rule.network_account_id = account.id
                ) as duplicate_protection_rules
              from public.network_accounts as account
              where account.company_id = $1
                and account.id = $2
              limit 1
            `,
            values: [companyId, accountId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapNetworkAccountDependencySummary(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateNetworkAccount(context, current, input, eventName) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'tracking-networks-update-account',
            text: `
              update public.network_accounts
              set
                provider_id = $4,
                name = $5,
                external_account_id = $6,
                status = $7::public.network_account_status,
                updated_by = $8
              where id = $1
                and company_id = $2
                and date_trunc('milliseconds', updated_at) = $3::timestamptz
                and not exists (
                  select 1
                  from public.network_accounts as conflicting_account
                  where conflicting_account.company_id = $2
                    and conflicting_account.provider_id = $4
                    and conflicting_account.id <> $1
                    and (
                      lower(conflicting_account.name) = lower($5)
                      or (
                        $6 is not null
                        and conflicting_account.external_account_id = $6
                      )
                    )
                )
              returning
                id,
                company_id,
                provider_id,
                (
                  select code
                  from public.network_providers
                  where id = provider_id
                ) as provider_code,
                (
                  select name
                  from public.network_providers
                  where id = provider_id
                ) as provider_name,
                name,
                external_account_id,
                status,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
            values: [
              current.id,
              current.companyId,
              current.updatedAt,
              input.providerId,
              input.name,
              input.externalAccountId,
              input.status,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const account = mapNetworkAccountRow(row);

          await writeAuditEvent(transaction, {
            companyId: account.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName,
            entityType: 'network_account',
            entityId: account.id,
            metadata: {
              previousProviderId: current.providerId,
              providerId: account.providerId,
              providerCode: account.providerCode,
              previousName: current.name,
              name: account.name,
              previousStatus: current.status,
              status: account.status,
              previousExternalAccountId: current.externalAccountId,
              externalAccountId: account.externalAccountId,
            },
          });

          return account;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
