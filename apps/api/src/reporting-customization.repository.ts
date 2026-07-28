import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  CompanyCustomizationRecord,
  CompanyOperationsRepositoryContext,
  CompanyProxyConfigurationRecord,
  CompanyProxySecretRecord,
  CompanyProxyWriteInput,
  CompanyReportingDashboard,
  CompanySmtpConfigurationRecord,
  CompanySmtpSecretRecord,
  CompanySmtpTestStatus,
  CompanySmtpWriteInput,
  ListCompanyReportingInput,
  ListOperationalEventsInput,
  OperationalEventRecord,
  ReportingScope,
  UpdateCompanyCustomizationInput,
} from './reporting-customization.types.js';

type CompanyRow = Readonly<{
  id: string;
  status: string;
}> &
  Record<string, unknown>;

type DashboardRow = Readonly<{
  dashboard: unknown;
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
  created_at: string | Date;
}> &
  Record<string, unknown>;

type CustomizationRow = Readonly<{
  id: string;
  company_id: string;
  brand_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  support_email: string | null;
  default_currency: string | null;
  default_timezone: string | null;
  link_identifier_mode: string;
  plain_text_sharing_enabled: boolean;
  restricted_share_platforms: string[];
  default_link_query_parameters: Readonly<Record<string, string>>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}> &
  Record<string, unknown>;

type ProxyRow = Readonly<{
  id: string;
  company_id: string;
  provider_code: string;
  encrypted_api_key: string;
  api_key_iv: string;
  api_key_auth_tag: string;
  api_key_last4: string;
  status: string;
  enforcement_mode: string;
  risk_threshold: number;
  request_timeout_ms: number;
  cache_ttl_seconds: number;
  failure_behavior: string;
  detect_proxy: boolean;
  detect_vpn: boolean;
  detect_tor: boolean;
  bypass_owner_membership_ids: string[];
  api_key_updated_at: string | Date;
  last_tested_at: string | Date | null;
  last_test_status: string | null;
  last_test_error_code: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}> &
  Record<string, unknown>;
type ProxyBypassCountRow = Readonly<{
  count: number;
}> &
  Record<string, unknown>;
type SmtpRow = Readonly<{
  id: string;
  company_id: string;
  host: string;
  port: number;
  secure_mode: string;
  username: string;
  encrypted_password: string;
  password_iv: string;
  password_auth_tag: string;
  sender_email: string;
  sender_name: string;
  reply_to_email: string | null;
  status: string;
  password_updated_at: string | Date;
  last_tested_at: string | Date | null;
  last_test_status: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}> &
  Record<string, unknown>;

type SmtpTestEventRow = Readonly<{
  id: string;
  status: string;
  completed_at: string | Date | null;
}> &
  Record<string, unknown>;

export interface CompanyOperationsRepository {
  getCompany(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
  ): Promise<
    { readonly id: string; readonly status: 'active' | 'suspended' | 'archived' } | undefined
  >;

  getReportingDashboard(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    input: Required<Pick<ListCompanyReportingInput, 'from' | 'to'>> &
      Omit<ListCompanyReportingInput, 'from' | 'to'>,
    scope: ReportingScope,
  ): Promise<CompanyReportingDashboard>;

  listOperationalEvents(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    input: Required<Pick<ListOperationalEventsInput, 'limit'>> &
      Omit<ListOperationalEventsInput, 'limit'>,
    scope: ReportingScope,
  ): Promise<readonly OperationalEventRecord[]>;

  getCustomization(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
  ): Promise<CompanyCustomizationRecord | undefined>;

  upsertCustomization(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    input: UpdateCompanyCustomizationInput,
  ): Promise<CompanyCustomizationRecord>;

  getProxyConfiguration(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
  ): Promise<CompanyProxySecretRecord | undefined>;
  countValidProxyBypassMemberships(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    membershipIds: readonly string[],
  ): Promise<number>;
  upsertProxyConfiguration(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    input: CompanyProxyWriteInput,
  ): Promise<CompanyProxySecretRecord>;
  getSmtpConfiguration(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
  ): Promise<CompanySmtpSecretRecord | undefined>;

  upsertSmtpConfiguration(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    input: CompanySmtpWriteInput,
  ): Promise<CompanySmtpSecretRecord>;

  createSmtpTestEvent(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    smtpConfigurationId: string,
    recipientEmail: string,
  ): Promise<string>;

  completeSmtpTestEvent(
    context: CompanyOperationsRepositoryContext,
    companyId: string,
    smtpConfigurationId: string,
    eventId: string,
    status: Exclude<CompanySmtpTestStatus, 'pending'>,
    errorCode: string | null,
  ): Promise<string>;
}

function createDatabaseSessionContext(
  context: CompanyOperationsRepositoryContext,
): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    companyId: context.companyId,
  };
}

function normalizeTimestamp(value: string | Date): string {
  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('The database returned an invalid timestamp.');
  }

  return timestamp.toISOString();
}

function normalizeNullableTimestamp(value: string | Date | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`The database reporting field "${fieldName}" is invalid.`);
  }

  return value;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`The database reporting field "${fieldName}" is invalid.`);
  }

  return numberValue;
}

function readRequiredArray(value: unknown, fieldName: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The database reporting field "${fieldName}" is invalid.`);
  }

  return value;
}

function parseMonetaryTotals(
  value: unknown,
): CompanyReportingDashboard['totals']['monetaryTotals'] {
  return Object.freeze(
    readRequiredArray(value, 'monetaryTotals').map((entry) => {
      if (!isRecord(entry)) {
        throw new Error('The database returned an invalid monetary total.');
      }

      return Object.freeze({
        currency: readRequiredString(entry['currency'], 'currency'),
        revenueAmountMinor: readRequiredNumber(entry['revenueAmountMinor'], 'revenueAmountMinor'),
        payoutAmountMinor: readRequiredNumber(entry['payoutAmountMinor'], 'payoutAmountMinor'),
      });
    }),
  );
}

function parsePerformanceRows(
  value: unknown,
  fieldName: string,
): CompanyReportingDashboard['offers'] {
  return Object.freeze(
    readRequiredArray(value, fieldName).map((entry) => {
      if (!isRecord(entry)) {
        throw new Error(`The database returned an invalid ${fieldName} performance row.`);
      }

      return Object.freeze({
        dimensionId: readRequiredString(entry['dimensionId'], 'dimensionId'),
        dimensionName: readRequiredString(entry['dimensionName'], 'dimensionName'),
        clicks: readRequiredNumber(entry['clicks'], 'clicks'),
        conversions: readRequiredNumber(entry['conversions'], 'conversions'),
        approvedConversions: readRequiredNumber(
          entry['approvedConversions'],
          'approvedConversions',
        ),
        monetaryTotals: parseMonetaryTotals(entry['monetaryTotals']),
      });
    }),
  );
}

function parseReportingDashboard(value: unknown): CompanyReportingDashboard {
  if (!isRecord(value)) {
    throw new Error('The database returned an invalid reporting dashboard.');
  }

  const period = value['period'];
  const totals = value['totals'];

  if (!isRecord(period) || !isRecord(totals)) {
    throw new Error('The database returned an incomplete reporting dashboard.');
  }

  return Object.freeze({
    companyId: readRequiredString(value['companyId'], 'companyId'),
    period: Object.freeze({
      from: readRequiredString(period['from'], 'period.from'),
      to: readRequiredString(period['to'], 'period.to'),
    }),
    totals: Object.freeze({
      clicks: readRequiredNumber(totals['clicks'], 'totals.clicks'),
      uniqueVisitors: readRequiredNumber(totals['uniqueVisitors'], 'totals.uniqueVisitors'),
      duplicateClicks: readRequiredNumber(totals['duplicateClicks'], 'totals.duplicateClicks'),
      highRiskClicks: readRequiredNumber(totals['highRiskClicks'], 'totals.highRiskClicks'),
      conversions: readRequiredNumber(totals['conversions'], 'totals.conversions'),
      approvedConversions: readRequiredNumber(
        totals['approvedConversions'],
        'totals.approvedConversions',
      ),
      monetaryTotals: parseMonetaryTotals(totals['monetaryTotals']),
    }),
    offers: parsePerformanceRows(value['offers'], 'offers'),
    networkAccounts: parsePerformanceRows(value['networkAccounts'], 'networkAccounts'),
    members: parsePerformanceRows(value['members'], 'members'),
  });
}

function normalizeMetadata(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error('The database returned invalid audit metadata.');
  }

  return Object.freeze({ ...value });
}

function mapCompanyStatus(value: string): 'active' | 'suspended' | 'archived' {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function mapCustomizationRow(row: CustomizationRow): CompanyCustomizationRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    brandName: row.brand_name,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    supportEmail: row.support_email,
    defaultCurrency: row.default_currency,
    defaultTimezone: row.default_timezone,
    linkIdentifierMode:
      row.link_identifier_mode as CompanyCustomizationRecord['linkIdentifierMode'],
    plainTextSharingEnabled: row.plain_text_sharing_enabled,
    restrictedSharePlatforms:
      row.restricted_share_platforms as CompanyCustomizationRecord['restrictedSharePlatforms'],
    defaultLinkQueryParameters: row.default_link_query_parameters,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapProxyProviderCode(value: string): CompanyProxyConfigurationRecord['providerCode'] {
  if (value === 'ipqualityscore' || value === 'proxycheck') {
    return value;
  }
  throw new Error('The database returned an unsupported proxy provider.');
}
function mapProxyStatus(value: string): CompanyProxyConfigurationRecord['status'] {
  if (value === 'active' || value === 'disabled') {
    return value;
  }
  throw new Error('The database returned an unsupported proxy status.');
}
function mapProxyEnforcementMode(
  value: string,
): CompanyProxyConfigurationRecord['enforcementMode'] {
  if (value === 'monitor' || value === 'enforce') {
    return value;
  }
  throw new Error('The database returned an unsupported proxy enforcement mode.');
}
function mapProxyFailureBehavior(
  value: string,
): CompanyProxyConfigurationRecord['failureBehavior'] {
  if (value === 'allow' || value === 'flag' || value === 'block') {
    return value;
  }
  throw new Error('The database returned an unsupported proxy failure behavior.');
}
function mapProxyTestStatus(
  value: string | null,
): CompanyProxyConfigurationRecord['lastTestStatus'] {
  if (value === null || value === 'passed' || value === 'failed') {
    return value;
  }
  throw new Error('The database returned an unsupported proxy test status.');
}
function mapProxyRow(row: ProxyRow): CompanyProxySecretRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    providerCode: mapProxyProviderCode(row.provider_code),
    encryptedApiKey: row.encrypted_api_key,
    apiKeyIv: row.api_key_iv,
    apiKeyAuthTag: row.api_key_auth_tag,
    apiKeyLast4: row.api_key_last4,
    hasApiKey: row.encrypted_api_key.length > 0,
    status: mapProxyStatus(row.status),
    enforcementMode: mapProxyEnforcementMode(row.enforcement_mode),
    riskThreshold: row.risk_threshold,
    requestTimeoutMs: row.request_timeout_ms,
    cacheTtlSeconds: row.cache_ttl_seconds,
    failureBehavior: mapProxyFailureBehavior(row.failure_behavior),
    detectProxy: row.detect_proxy,
    detectVpn: row.detect_vpn,
    detectTor: row.detect_tor,
    bypassOwnerMembershipIds: Object.freeze([...row.bypass_owner_membership_ids]),
    apiKeyUpdatedAt: normalizeTimestamp(row.api_key_updated_at),
    lastTestedAt: normalizeNullableTimestamp(row.last_tested_at),
    lastTestStatus: mapProxyTestStatus(row.last_test_status),
    lastTestErrorCode: row.last_test_error_code,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}
function mapSmtpStatus(value: string): CompanySmtpConfigurationRecord['status'] {
  if (value === 'active' || value === 'disabled') {
    return value;
  }

  throw new Error('The database returned an unsupported SMTP configuration status.');
}

function mapSmtpSecureMode(value: string): CompanySmtpConfigurationRecord['secureMode'] {
  if (value === 'plain' || value === 'starttls' || value === 'tls') {
    return value;
  }

  throw new Error('The database returned an unsupported SMTP secure mode.');
}

function mapSmtpTestStatus(value: string | null): CompanySmtpTestStatus | null {
  if (value === null || value === 'pending' || value === 'sent' || value === 'failed') {
    return value;
  }

  throw new Error('The database returned an unsupported SMTP test status.');
}

function mapSmtpRow(row: SmtpRow): CompanySmtpSecretRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    host: row.host,
    port: row.port,
    secureMode: mapSmtpSecureMode(row.secure_mode),
    username: row.username,
    encryptedPassword: row.encrypted_password,
    passwordIv: row.password_iv,
    passwordAuthTag: row.password_auth_tag,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    replyToEmail: row.reply_to_email,
    status: mapSmtpStatus(row.status),
    hasPassword: row.encrypted_password.length > 0,
    passwordUpdatedAt: normalizeTimestamp(row.password_updated_at),
    lastTestedAt: normalizeNullableTimestamp(row.last_tested_at),
    lastTestStatus: mapSmtpTestStatus(row.last_test_status),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapAuditRow(row: AuditEventRow): OperationalEventRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    requestId: row.request_id,
    eventName: row.event_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: normalizeMetadata(row.metadata),
    createdAt: normalizeTimestamp(row.created_at),
  });
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
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await transaction.query({
    name: 'company-operations-write-audit-event',
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

const proxyProjection = `
  id,
  company_id,
  provider_code,
  encrypted_api_key,
  api_key_iv,
  api_key_auth_tag,
  api_key_last4,
  status,
  enforcement_mode,
  risk_threshold,
  request_timeout_ms,
  cache_ttl_seconds,
  failure_behavior,
  detect_proxy,
  detect_vpn,
  detect_tor,
  bypass_owner_membership_ids,
  api_key_updated_at,
  last_tested_at,
  last_test_status,
  last_test_error_code,
  created_by,
  updated_by,
  created_at,
  updated_at
`;
const smtpProjection = `
  id,
  company_id,
  host,
  port,
  secure_mode,
  username,
  encrypted_password,
  password_iv,
  password_auth_tag,
  sender_email,
  sender_name,
  reply_to_email,
  status,
  password_updated_at,
  last_tested_at,
  last_test_status,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const customizationProjection = `
  id,
  company_id,
  brand_name,
  tagline,
  logo_url,
  primary_color,
  secondary_color,
  support_email,
  default_currency,
  default_timezone,
  link_identifier_mode,
  plain_text_sharing_enabled,
  restricted_share_platforms,
  default_link_query_parameters,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

export function createCompanyOperationsRepository(
  database: DatabaseRuntime,
): CompanyOperationsRepository {
  return Object.freeze<CompanyOperationsRepository>({
    async getCompany(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'company-operations-get-company',
            text: `
              select id, status
              from public.companies
              where id = $1
              limit 1
            `,
            values: [companyId],
          });

          const row = result.rows[0];

          return row === undefined
            ? undefined
            : Object.freeze({
                id: row.id,
                status: mapCompanyStatus(row.status),
              });
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getReportingDashboard(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<DashboardRow>({
            name: 'company-operations-reporting-dashboard',
            text: `
              select public.get_company_reporting_dashboard(
                $1::uuid,
                $2::timestamptz,
                $3::timestamptz,
                $4::uuid,
                $5::uuid,
                $6::uuid,
                $7::uuid,
                $8::uuid
              ) as dashboard
            `,
            values: [
              companyId,
              input.from,
              input.to,
              input.offerId ?? null,
              input.networkAccountId ?? null,
              input.ownerMembershipId ?? null,
              scope.ownerUserId ?? null,
              scope.managerMembershipId ?? null,
            ],
          });

          return parseReportingDashboard(result.rows[0]?.dashboard);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listOperationalEvents(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['event.company_id = $1'];

          if (scope.managerMembershipId !== undefined && scope.managerUserId !== undefined) {
            const managerMembershipPlaceholder = appendQueryValue(
              values,
              scope.managerMembershipId,
            );
            const managerUserPlaceholder = appendQueryValue(values, scope.managerUserId);

            conditions.push(`
              (
                event.actor_user_id = ${managerUserPlaceholder}::uuid
                or exists (
                  select 1
                  from public.company_memberships as publisher
                  where publisher.company_id = event.company_id
                    and publisher.user_id = event.actor_user_id
                    and publisher.role = 'publisher'
                    and (
                      publisher.invited_by = ${managerUserPlaceholder}::uuid
                      or exists (
                        select 1
                        from public.offer_assignments as assignment
                        where assignment.company_id = publisher.company_id
                          and assignment.membership_id = publisher.id
                          and assignment.manager_membership_id =
                            ${managerMembershipPlaceholder}::uuid
                      )
                    )
                )
              )
            `);
          }

          if (input.eventName !== undefined) {
            conditions.push(`event.event_name = ${appendQueryValue(values, input.eventName)}`);
          }

          if (input.entityType !== undefined) {
            conditions.push(`event.entity_type = ${appendQueryValue(values, input.entityType)}`);
          }

          if (input.from !== undefined) {
            conditions.push(
              `event.created_at >= ${appendQueryValue(values, input.from)}::timestamptz`,
            );
          }

          if (input.to !== undefined) {
            conditions.push(
              `event.created_at < ${appendQueryValue(values, input.to)}::timestamptz`,
            );
          }

          const limitPlaceholder = appendQueryValue(values, input.limit);

          const result = await transaction.query<AuditEventRow>({
            name: 'company-operations-list-audit-events',
            text: `
              select
                event.id,
                event.company_id,
                event.actor_user_id,
                event.request_id,
                event.event_name,
                event.entity_type,
                event.entity_id,
                event.metadata,
                event.created_at
              from public.audit_events as event
              where ${conditions.join('\n                and ')}
              order by event.created_at desc, event.id desc
              limit ${limitPlaceholder}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapAuditRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getCustomization(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CustomizationRow>({
            name: 'company-operations-get-customization',
            text: `
              select ${customizationProjection}
              from public.company_customizations
              where company_id = $1
              limit 1
            `,
            values: [companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapCustomizationRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async upsertCustomization(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CustomizationRow>({
            name: 'company-operations-upsert-customization',
            text: `
              insert into public.company_customizations (
                company_id,
                brand_name,
                tagline,
                logo_url,
                primary_color,
                secondary_color,
                support_email,
                default_currency,
                default_timezone,
                link_identifier_mode,
                plain_text_sharing_enabled,
                restricted_share_platforms,
                default_link_query_parameters,
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
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $14
              )
              on conflict (company_id)
              do update set
                brand_name = excluded.brand_name,
                tagline = excluded.tagline,
                logo_url = excluded.logo_url,
                primary_color = excluded.primary_color,
                secondary_color = excluded.secondary_color,
                support_email = excluded.support_email,
                default_currency = excluded.default_currency,
                default_timezone = excluded.default_timezone,
                link_identifier_mode =
                  excluded.link_identifier_mode,
                plain_text_sharing_enabled =
                  excluded.plain_text_sharing_enabled,
                restricted_share_platforms =
                  excluded.restricted_share_platforms,
                default_link_query_parameters =
                  excluded.default_link_query_parameters,
                updated_by = excluded.updated_by
              returning ${customizationProjection}
            `,
            values: [
              companyId,
              input.brandName ?? null,
              input.tagline ?? null,
              input.logoUrl ?? null,
              input.primaryColor ?? null,
              input.secondaryColor ?? null,
              input.supportEmail ?? null,
              input.defaultCurrency ?? null,
              input.defaultTimezone ?? null,
              input.linkIdentifierMode ?? 'slug_or_code',
              input.plainTextSharingEnabled ?? true,
              [...(input.restrictedSharePlatforms ?? ['snapchat', 'instagram', 'facebook'])],
              JSON.stringify(input.defaultLinkQueryParameters ?? {}),
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            throw new Error('The company customization could not be saved.');
          }

          const customization = mapCustomizationRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company_customization.updated',
            entityType: 'company_customization',
            entityId: customization.id,
            metadata: {
              brandName: customization.brandName,
              taglineConfigured: customization.tagline !== null,
              logoUrlConfigured: customization.logoUrl !== null,
              supportEmailConfigured: customization.supportEmail !== null,
              defaultCurrency: customization.defaultCurrency,
              defaultTimezone: customization.defaultTimezone,
              linkIdentifierMode: customization.linkIdentifierMode,
              plainTextSharingEnabled: customization.plainTextSharingEnabled,
              restrictedSharePlatforms: customization.restrictedSharePlatforms,
              defaultLinkQueryParameterCount: Object.keys(customization.defaultLinkQueryParameters)
                .length,
            },
          });

          return customization;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getProxyConfiguration(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ProxyRow>({
            name: 'company-operations-get-proxy-configuration',
            text: `
                select ${proxyProjection}
                from public.company_proxy_configurations
                where company_id = $1
                limit 1
              `,
            values: [companyId],
          });
          const row = result.rows[0];
          return row === undefined ? undefined : mapProxyRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
    async countValidProxyBypassMemberships(context, companyId, membershipIds) {
      if (membershipIds.length === 0) {
        return 0;
      }
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ProxyBypassCountRow>({
            name: 'company-operations-count-proxy-bypass-memberships',
            text: `
                select
                  count(*)::integer as count
                from public.company_memberships
                where company_id = $1
                  and id = any($2::uuid[])
                  and status = 'active'
                  and role in (
                    'manager',
                    'publisher'
                  )
              `,
            values: [companyId, [...membershipIds]],
          });
          return result.rows[0]?.count ?? 0;
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
    async upsertProxyConfiguration(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ProxyRow>({
            name: 'company-operations-upsert-proxy-configuration',
            text: `
                insert into public.company_proxy_configurations (
                  company_id,
                  provider_code,
                  encrypted_api_key,
                  api_key_iv,
                  api_key_auth_tag,
                  api_key_last4,
                  status,
                  enforcement_mode,
                  risk_threshold,
                  request_timeout_ms,
                  cache_ttl_seconds,
                  failure_behavior,
                  detect_proxy,
                  detect_vpn,
                  detect_tor,
                  bypass_owner_membership_ids,
                  api_key_updated_at,
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
                  $7::public.company_proxy_configuration_status,
                  $8::public.company_proxy_enforcement_mode,
                  $9,
                  $10,
                  $11,
                  $12::public.company_proxy_failure_behavior,
                  $13,
                  $14,
                  $15,
                  $16::uuid[],
                  $17::timestamptz,
                  $18,
                  $18
                )
                on conflict (company_id)
                do update set
                  provider_code =
                    excluded.provider_code,
                  encrypted_api_key =
                    excluded.encrypted_api_key,
                  api_key_iv =
                    excluded.api_key_iv,
                  api_key_auth_tag =
                    excluded.api_key_auth_tag,
                  api_key_last4 =
                    excluded.api_key_last4,
                  status =
                    excluded.status,
                  enforcement_mode =
                    excluded.enforcement_mode,
                  risk_threshold =
                    excluded.risk_threshold,
                  request_timeout_ms =
                    excluded.request_timeout_ms,
                  cache_ttl_seconds =
                    excluded.cache_ttl_seconds,
                  failure_behavior =
                    excluded.failure_behavior,
                  detect_proxy =
                    excluded.detect_proxy,
                  detect_vpn =
                    excluded.detect_vpn,
                  detect_tor =
                    excluded.detect_tor,
                  bypass_owner_membership_ids =
                    excluded.bypass_owner_membership_ids,
                  api_key_updated_at =
                    excluded.api_key_updated_at,
                  last_tested_at =
                    case
                      when
                        company_proxy_configurations.provider_code
                          is distinct from
                        excluded.provider_code
                        or
                        company_proxy_configurations.encrypted_api_key
                          is distinct from
                        excluded.encrypted_api_key
                      then null
                      else company_proxy_configurations.last_tested_at
                    end,
                  last_test_status =
                    case
                      when
                        company_proxy_configurations.provider_code
                          is distinct from
                        excluded.provider_code
                        or
                        company_proxy_configurations.encrypted_api_key
                          is distinct from
                        excluded.encrypted_api_key
                      then null
                      else company_proxy_configurations.last_test_status
                    end,
                  last_test_error_code =
                    case
                      when
                        company_proxy_configurations.provider_code
                          is distinct from
                        excluded.provider_code
                        or
                        company_proxy_configurations.encrypted_api_key
                          is distinct from
                        excluded.encrypted_api_key
                      then null
                      else company_proxy_configurations.last_test_error_code
                    end,
                  updated_by =
                    excluded.updated_by
                returning ${proxyProjection}
              `,
            values: [
              companyId,
              input.providerCode,
              input.encryptedApiKey,
              input.apiKeyIv,
              input.apiKeyAuthTag,
              input.apiKeyLast4,
              input.status,
              input.enforcementMode,
              input.riskThreshold,
              input.requestTimeoutMs,
              input.cacheTtlSeconds,
              input.failureBehavior,
              input.detectProxy,
              input.detectVpn,
              input.detectTor,
              [...input.bypassOwnerMembershipIds],
              input.apiKeyUpdatedAt,
              context.actorUserId,
            ],
          });
          const row = result.rows[0];
          if (row === undefined) {
            throw new Error('The proxy configuration could not be saved.');
          }
          const configuration = mapProxyRow(row);
          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company_proxy_configuration.updated',
            entityType: 'company_proxy_configuration',
            entityId: configuration.id,
            metadata: {
              providerCode: configuration.providerCode,
              status: configuration.status,
              enforcementMode: configuration.enforcementMode,
              riskThreshold: configuration.riskThreshold,
              requestTimeoutMs: configuration.requestTimeoutMs,
              cacheTtlSeconds: configuration.cacheTtlSeconds,
              failureBehavior: configuration.failureBehavior,
              detectProxy: configuration.detectProxy,
              detectVpn: configuration.detectVpn,
              detectTor: configuration.detectTor,
              bypassOwnerMembershipCount: configuration.bypassOwnerMembershipIds.length,
              apiKeyLast4: configuration.apiKeyLast4,
            },
          });
          return configuration;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
    async getSmtpConfiguration(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<SmtpRow>({
            name: 'company-operations-get-smtp-configuration',
            text: `
              select ${smtpProjection}
              from public.company_smtp_configurations
              where company_id = $1
              limit 1
            `,
            values: [companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapSmtpRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async upsertSmtpConfiguration(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<SmtpRow>({
            name: 'company-operations-upsert-smtp-configuration',
            text: `
              insert into public.company_smtp_configurations (
                company_id,
                host,
                port,
                secure_mode,
                username,
                encrypted_password,
                password_iv,
                password_auth_tag,
                sender_email,
                sender_name,
                reply_to_email,
                status,
                password_updated_at,
                created_by,
                updated_by
              )
              values (
                $1,
                $2,
                $3,
                $4::public.company_smtp_secure_mode,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12::public.company_smtp_configuration_status,
                $13::timestamptz,
                $14,
                $14
              )
              on conflict (company_id)
              do update set
                host = excluded.host,
                port = excluded.port,
                secure_mode = excluded.secure_mode,
                username = excluded.username,
                encrypted_password = excluded.encrypted_password,
                password_iv = excluded.password_iv,
                password_auth_tag = excluded.password_auth_tag,
                sender_email = excluded.sender_email,
                sender_name = excluded.sender_name,
                reply_to_email = excluded.reply_to_email,
                status = excluded.status,
                password_updated_at = excluded.password_updated_at,
                updated_by = excluded.updated_by
              returning ${smtpProjection}
            `,
            values: [
              companyId,
              input.host,
              input.port,
              input.secureMode,
              input.username,
              input.encryptedPassword,
              input.passwordIv,
              input.passwordAuthTag,
              input.senderEmail,
              input.senderName,
              input.replyToEmail,
              input.status,
              input.passwordUpdatedAt,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            throw new Error('The company SMTP configuration could not be saved.');
          }

          const configuration = mapSmtpRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'company_smtp_configuration.updated',
            entityType: 'company_smtp_configuration',
            entityId: configuration.id,
            metadata: {
              host: configuration.host,
              port: configuration.port,
              secureMode: configuration.secureMode,
              status: configuration.status,
              passwordUpdatedAt: configuration.passwordUpdatedAt,
            },
          });

          return configuration;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async createSmtpTestEvent(context, companyId, smtpConfigurationId, recipientEmail) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<SmtpTestEventRow>({
            name: 'company-operations-create-smtp-test-event',
            text: `
              insert into public.company_smtp_test_events (
                company_id,
                smtp_configuration_id,
                recipient_email,
                status,
                requested_by
              )
              values (
                $1,
                $2,
                $3,
                'pending',
                $4
              )
              returning id, status, completed_at
            `,
            values: [companyId, smtpConfigurationId, recipientEmail, context.actorUserId],
          });

          const event = result.rows[0];

          if (event?.status !== 'pending') {
            throw new Error('The SMTP test event could not be created.');
          }

          return event.id;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async completeSmtpTestEvent(
      context,
      companyId,
      smtpConfigurationId,
      eventId,
      status,
      errorCode,
    ) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<SmtpTestEventRow>({
            name: 'company-operations-complete-smtp-test-event',
            text: `
              update public.company_smtp_test_events
              set
                status = $4::public.company_smtp_test_status,
                error_code = $5,
                completed_at = now()
              where id = $1
                and company_id = $2
                and smtp_configuration_id = $3
                and status = 'pending'
              returning id, status, completed_at
            `,
            values: [eventId, companyId, smtpConfigurationId, status, errorCode],
          });

          const event = result.rows[0];

          if (event === undefined) {
            throw new Error('The SMTP test event could not be completed.');
          }

          if (event.completed_at === null) {
            throw new Error('The SMTP test event completion timestamp is missing.');
          }

          await transaction.query({
            name: 'company-operations-update-smtp-last-test',
            text: `
              update public.company_smtp_configurations
              set
                last_tested_at = $3::timestamptz,
                last_test_status = $4::public.company_smtp_test_status,
                updated_by = $5
              where id = $1
                and company_id = $2
            `,
            values: [
              smtpConfigurationId,
              companyId,
              normalizeTimestamp(event.completed_at),
              status,
              context.actorUserId,
            ],
          });

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: status === 'sent' ? 'company_smtp_test.sent' : 'company_smtp_test.failed',
            entityType: 'company_smtp_test_event',
            entityId: event.id,
            metadata: {
              smtpConfigurationId,
              status,
              errorCode,
            },
          });

          return normalizeTimestamp(event.completed_at);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
