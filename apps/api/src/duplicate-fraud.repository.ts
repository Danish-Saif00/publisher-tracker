import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  DuplicateDecision,
  DuplicateFraudCompanyRecord,
  DuplicateFraudNetworkAccountRecord,
  DuplicateFraudOfferRecord,
  DuplicateFraudRepositoryContext,
  DuplicateProtectionLockMode,
  DuplicateProtectionRuleRecord,
  DuplicateProtectionRuleStatus,
  DuplicateProtectionRuleWriteInput,
  FraudClickRecord,
  FraudRiskLevel,
} from './duplicate-fraud.types.js';

type CompanyRow = Readonly<{
  id: string;
  status: string;
}> &
  Record<string, unknown>;

type NetworkAccountRow = Readonly<{
  id: string;
  company_id: string;
  status: string;
}> &
  Record<string, unknown>;

type OfferRow = Readonly<{
  id: string;
  company_id: string;
  network_account_id: string;
  status: string;
}> &
  Record<string, unknown>;

type RuleRow = Readonly<{
  id: string;
  company_id: string;
  network_account_id: string;
  network_account_name: string;
  offer_id: string | null;
  offer_code: string | null;
  offer_name: string | null;
  name: string;
  lock_mode: string;
  session_window_seconds: number | null;
  lock_duration_seconds: number | null;
  lock_until: Date | string | null;
  offer_expiry_at: Date | string | null;
  match_visitor_id: boolean;
  match_ip_and_user_agent: boolean;
  rapid_repeat_window_seconds: number;
  rapid_repeat_threshold: number;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}> &
  Record<string, unknown>;

type FraudClickRow = Readonly<{
  id: string;
  public_click_id: string;
  company_id: string;
  tracking_link_id: string;
  offer_id: string;
  network_account_id: string;
  owner_membership_id: string;
  owner_user_id: string;
  visitor_id: string;
  duplicate_decision: string;
  duplicate_reason: string | null;
  duplicate_of_click_id: string | null;
  duplicate_rule_id: string | null;
  lock_expires_at: Date | string | null;
  fraud_risk_level: string;
  fraud_signals: unknown;
  attribution_eligible: boolean;
  captured_at: Date | string;
}> &
  Record<string, unknown>;

export interface DuplicateFraudRepository {
  getCompany(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
  ): Promise<DuplicateFraudCompanyRecord | undefined>;

  getNetworkAccount(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
    networkAccountId: string,
  ): Promise<DuplicateFraudNetworkAccountRecord | undefined>;

  getOffer(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
    offerId: string,
  ): Promise<DuplicateFraudOfferRecord | undefined>;

  createRule(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
    input: DuplicateProtectionRuleWriteInput,
  ): Promise<DuplicateProtectionRuleRecord | undefined>;

  listRules(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
    query: {
      readonly networkAccountId?: string;
      readonly offerId?: string;
      readonly status?: DuplicateProtectionRuleStatus;
    },
  ): Promise<readonly DuplicateProtectionRuleRecord[]>;

  getRule(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
    ruleId: string,
  ): Promise<DuplicateProtectionRuleRecord | undefined>;

  updateRule(
    context: DuplicateFraudRepositoryContext,
    current: DuplicateProtectionRuleRecord,
    input: DuplicateProtectionRuleWriteInput,
  ): Promise<DuplicateProtectionRuleRecord | undefined>;

  listFraudClicks(
    context: DuplicateFraudRepositoryContext,
    companyId: string,
    query: {
      readonly networkAccountId?: string;
      readonly offerId?: string;
      readonly duplicateDecision?: DuplicateDecision;
      readonly fraudRiskLevel?: FraudRiskLevel;
      readonly visibleToUserId?: string;
      readonly limit: number;
    },
  ): Promise<readonly FraudClickRecord[]>;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid timestamp.');
  }

  return date.toISOString();
}

function normalizeNullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}

function parseCompanyStatus(value: string): DuplicateFraudCompanyRecord['status'] {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function parseNetworkAccountStatus(value: string): DuplicateFraudNetworkAccountRecord['status'] {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported network-account status.');
  }
}

function parseOfferStatus(value: string): DuplicateFraudOfferRecord['status'] {
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

function parseRuleStatus(value: string): DuplicateProtectionRuleStatus {
  switch (value) {
    case 'active':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported duplicate-protection status.');
  }
}

function parseLockMode(value: string): DuplicateProtectionLockMode {
  switch (value) {
    case 'session':
    case 'duration':
    case 'until_date':
    case 'until_offer_expiry':
    case 'permanent':
      return value;
    default:
      throw new Error('The database returned an unsupported duplicate-protection lock mode.');
  }
}

function parseDuplicateDecision(value: string): DuplicateDecision {
  switch (value) {
    case 'accepted':
    case 'duplicate':
      return value;
    default:
      throw new Error('The database returned an unsupported duplicate decision.');
  }
}

function parseFraudRiskLevel(value: string): FraudRiskLevel {
  switch (value) {
    case 'low':
    case 'medium':
    case 'high':
      return value;
    default:
      throw new Error('The database returned an unsupported fraud-risk level.');
  }
}

function normalizeFraudSignals(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('The database returned invalid fraud signals.');
  }

  const signals = value.map((signal) => {
    if (typeof signal !== 'string' || signal.trim().length === 0) {
      throw new Error('The database returned an invalid fraud signal.');
    }

    return signal;
  });

  return Object.freeze(signals);
}

function mapCompanyRow(row: CompanyRow): DuplicateFraudCompanyRecord {
  return Object.freeze({
    id: row.id,
    status: parseCompanyStatus(row.status),
  });
}

function mapNetworkAccountRow(row: NetworkAccountRow): DuplicateFraudNetworkAccountRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    status: parseNetworkAccountStatus(row.status),
  });
}

function mapOfferRow(row: OfferRow): DuplicateFraudOfferRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    networkAccountId: row.network_account_id,
    status: parseOfferStatus(row.status),
  });
}

function mapRuleRow(row: RuleRow): DuplicateProtectionRuleRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    networkAccountId: row.network_account_id,
    networkAccountName: row.network_account_name,
    offerId: row.offer_id,
    offerCode: row.offer_code,
    offerName: row.offer_name,
    name: row.name,
    lockMode: parseLockMode(row.lock_mode),
    sessionWindowSeconds: row.session_window_seconds,
    lockDurationSeconds: row.lock_duration_seconds,
    lockUntil: normalizeNullableTimestamp(row.lock_until),
    offerExpiryAt: normalizeNullableTimestamp(row.offer_expiry_at),
    matchVisitorId: row.match_visitor_id,
    matchIpAndUserAgent: row.match_ip_and_user_agent,
    rapidRepeatWindowSeconds: row.rapid_repeat_window_seconds,
    rapidRepeatThreshold: row.rapid_repeat_threshold,
    status: parseRuleStatus(row.status),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapFraudClickRow(row: FraudClickRow): FraudClickRecord {
  return Object.freeze({
    id: row.id,
    publicClickId: row.public_click_id,
    companyId: row.company_id,
    trackingLinkId: row.tracking_link_id,
    offerId: row.offer_id,
    networkAccountId: row.network_account_id,
    ownerMembershipId: row.owner_membership_id,
    ownerUserId: row.owner_user_id,
    visitorId: row.visitor_id,
    duplicateDecision: parseDuplicateDecision(row.duplicate_decision),
    duplicateReason: row.duplicate_reason,
    duplicateOfClickId: row.duplicate_of_click_id,
    duplicateRuleId: row.duplicate_rule_id,
    lockExpiresAt: normalizeNullableTimestamp(row.lock_expires_at),
    fraudRiskLevel: parseFraudRiskLevel(row.fraud_risk_level),
    fraudSignals: normalizeFraudSignals(row.fraud_signals),
    attributionEligible: row.attribution_eligible,
    capturedAt: normalizeTimestamp(row.captured_at),
  });
}

function createDatabaseSessionContext(
  context: DuplicateFraudRepositoryContext,
): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    ...(context.companyId !== undefined ? { companyId: context.companyId } : {}),
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
    name: 'duplicate-fraud-write-audit-event',
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
        'duplicate_protection_rule',
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

const ruleColumns = `
  rule.id,
  rule.company_id,
  rule.network_account_id,
  account.name as network_account_name,
  rule.offer_id,
  offer.code as offer_code,
  offer.name as offer_name,
  rule.name,
  rule.lock_mode,
  rule.session_window_seconds,
  rule.lock_duration_seconds,
  rule.lock_until,
  rule.offer_expiry_at,
  rule.match_visitor_id,
  rule.match_ip_and_user_agent,
  rule.rapid_repeat_window_seconds,
  rule.rapid_repeat_threshold,
  rule.status,
  rule.created_by,
  rule.updated_by,
  rule.created_at,
  rule.updated_at
`;

const ruleJoins = `
  inner join public.network_accounts as account
    on account.id = rule.network_account_id
  left join public.offers as offer
    on offer.id = rule.offer_id
`;

export function createDuplicateFraudRepository(
  database: DatabaseRuntime,
): DuplicateFraudRepository {
  return Object.freeze<DuplicateFraudRepository>({
    async getCompany(context, companyId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<CompanyRow>({
            name: 'duplicate-fraud-get-company',
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

    async getNetworkAccount(context, companyId, networkAccountId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<NetworkAccountRow>({
            name: 'duplicate-fraud-get-network-account',
            text: `
              select
                id,
                company_id,
                status
              from public.network_accounts
              where id = $1
                and company_id = $2
              limit 1
            `,
            values: [networkAccountId, companyId],
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

    async getOffer(context, companyId, offerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<OfferRow>({
            name: 'duplicate-fraud-get-offer',
            text: `
              select
                id,
                company_id,
                network_account_id,
                status
              from public.offers
              where id = $1
                and company_id = $2
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

    async createRule(context, companyId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<RuleRow>({
            name: 'duplicate-fraud-create-rule',
            text: `
              with inserted as (
                insert into public.duplicate_protection_rules (
                  company_id,
                  network_account_id,
                  offer_id,
                  name,
                  lock_mode,
                  session_window_seconds,
                  lock_duration_seconds,
                  lock_until,
                  offer_expiry_at,
                  match_visitor_id,
                  match_ip_and_user_agent,
                  rapid_repeat_window_seconds,
                  rapid_repeat_threshold,
                  status,
                  created_by,
                  updated_by
                )
                values (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5::public.duplicate_protection_lock_mode,
                  $6,
                  $7,
                  $8::timestamptz,
                  $9::timestamptz,
                  $10,
                  $11,
                  $12,
                  $13,
                  $14::public.duplicate_protection_rule_status,
                  $15,
                  $15
                )
                on conflict do nothing
                returning *
              )
              select
                ${ruleColumns}
              from inserted as rule
              ${ruleJoins}
            `,
            values: [
              companyId,
              input.networkAccountId,
              input.offerId,
              input.name,
              input.lockMode,
              input.sessionWindowSeconds,
              input.lockDurationSeconds,
              input.lockUntil,
              input.offerExpiryAt,
              input.matchVisitorId,
              input.matchIpAndUserAgent,
              input.rapidRepeatWindowSeconds,
              input.rapidRepeatThreshold,
              input.status,
              context.actorUserId,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const rule = mapRuleRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'duplicate_protection_rule.created',
            entityId: rule.id,
            metadata: {
              networkAccountId: rule.networkAccountId,
              offerId: rule.offerId,
              lockMode: rule.lockMode,
              status: rule.status,
            },
          });

          return rule;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listRules(context, companyId, query) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions: string[] = ['rule.company_id = $1'];

          if (query.networkAccountId !== undefined) {
            conditions.push(
              `rule.network_account_id = ${appendQueryValue(values, query.networkAccountId)}::uuid`,
            );
          }

          if (query.offerId !== undefined) {
            conditions.push(`rule.offer_id = ${appendQueryValue(values, query.offerId)}::uuid`);
          }

          if (query.status !== undefined) {
            conditions.push(
              `rule.status = ${appendQueryValue(
                values,
                query.status,
              )}::public.duplicate_protection_rule_status`,
            );
          }

          const result = await transaction.query<RuleRow>({
            name: 'duplicate-fraud-list-rules',
            text: `
              select
                ${ruleColumns}
              from public.duplicate_protection_rules as rule
              ${ruleJoins}
              where ${conditions.join('\n                and ')}
              order by
                rule.created_at desc,
                rule.id desc
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapRuleRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async getRule(context, companyId, ruleId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<RuleRow>({
            name: 'duplicate-fraud-get-rule',
            text: `
              select
                ${ruleColumns}
              from public.duplicate_protection_rules as rule
              ${ruleJoins}
              where rule.id = $1
                and rule.company_id = $2
              limit 1
            `,
            values: [ruleId, companyId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapRuleRow(row);
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async updateRule(context, current, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<RuleRow>({
            name: 'duplicate-fraud-update-rule',
            text: `
              with updated as (
                update public.duplicate_protection_rules
                set
                  name = $3,
                  lock_mode = $4::public.duplicate_protection_lock_mode,
                  session_window_seconds = $5,
                  lock_duration_seconds = $6,
                  lock_until = $7::timestamptz,
                  offer_expiry_at = $8::timestamptz,
                  match_visitor_id = $9,
                  match_ip_and_user_agent = $10,
                  rapid_repeat_window_seconds = $11,
                  rapid_repeat_threshold = $12,
                  status = $13::public.duplicate_protection_rule_status,
                  updated_by = $14
                where id = $1
                  and company_id = $2
                  and updated_at = $15::timestamptz
                returning *
              )
              select
                ${ruleColumns}
              from updated as rule
              ${ruleJoins}
            `,
            values: [
              current.id,
              current.companyId,
              input.name,
              input.lockMode,
              input.sessionWindowSeconds,
              input.lockDurationSeconds,
              input.lockUntil,
              input.offerExpiryAt,
              input.matchVisitorId,
              input.matchIpAndUserAgent,
              input.rapidRepeatWindowSeconds,
              input.rapidRepeatThreshold,
              input.status,
              context.actorUserId,
              current.updatedAt,
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const rule = mapRuleRow(row);

          await writeAuditEvent(transaction, {
            companyId: rule.companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'duplicate_protection_rule.updated',
            entityId: rule.id,
            metadata: {
              previousStatus: current.status,
              status: rule.status,
              previousLockMode: current.lockMode,
              lockMode: rule.lockMode,
            },
          });

          return rule;
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listFraudClicks(context, companyId, query) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions: string[] = ['click.company_id = $1'];

          if (query.networkAccountId !== undefined) {
            conditions.push(
              `click.network_account_id = ${appendQueryValue(
                values,
                query.networkAccountId,
              )}::uuid`,
            );
          }

          if (query.offerId !== undefined) {
            conditions.push(`click.offer_id = ${appendQueryValue(values, query.offerId)}::uuid`);
          }

          if (query.duplicateDecision !== undefined) {
            conditions.push(
              `click.duplicate_decision = ${appendQueryValue(
                values,
                query.duplicateDecision,
              )}::public.duplicate_decision`,
            );
          }

          if (query.fraudRiskLevel !== undefined) {
            conditions.push(
              `click.fraud_risk_level = ${appendQueryValue(
                values,
                query.fraudRiskLevel,
              )}::public.fraud_risk_level`,
            );
          }

          if (query.visibleToUserId !== undefined) {
            conditions.push(
              `click.owner_user_id = ${appendQueryValue(values, query.visibleToUserId)}::uuid`,
            );
          }

          values.push(query.limit);

          const result = await transaction.query<FraudClickRow>({
            name: 'duplicate-fraud-list-clicks',
            text: `
              select
                click.id,
                click.public_click_id,
                click.company_id,
                click.tracking_link_id,
                click.offer_id,
                click.network_account_id,
                click.owner_membership_id,
                click.owner_user_id,
                click.visitor_id,
                click.duplicate_decision,
                click.duplicate_reason,
                click.duplicate_of_click_id,
                click.duplicate_rule_id,
                click.lock_expires_at,
                click.fraud_risk_level,
                click.fraud_signals,
                click.attribution_eligible,
                click.captured_at
              from public.tracking_clicks as click
              where ${conditions.join('\n                and ')}
              order by
                click.captured_at desc,
                click.id desc
              limit $${String(values.length)}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapFraudClickRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
