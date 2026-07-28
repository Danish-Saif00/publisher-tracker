import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type {
  AccountProfileRecord,
  BillingInvoiceRecord,
  ClickLogInput,
  ClickLogRecord,
  ConversionLogInput,
  ConversionLogRecord,
  CreateManualConversionInput,
  FinalOperationsRepositoryContext,
  FinalOperationsScope,
  ManualConversionRecord,
  PerformanceReportDimension,
  PerformanceReportInput,
  PerformanceReportRow,
  SessionLogInput,
  SessionLogRecord,
  UpdateAccountProfileInput,
  UserAgentLogInput,
  UserAgentLogRecord,
} from './final-operations.types.js';

type ReportRow = Readonly<{
  dimension_id: string;
  dimension_name: string;
  dimension_status: string;
  approved_clicks: number | string;
  rejected_clicks: number | string;
  unchecked_clicks: number | string;
  total_clicks: number | string;
  approved_conversions: number | string;
  rejected_conversions: number | string;
  unchecked_conversions: number | string;
  total_conversions: number | string;
}> &
  Record<string, unknown>;

type ClickRow = Readonly<{
  id: string;
  public_click_id: string;
  offer_id: string;
  offer_name: string;
  tracking_domain_id: string;
  tracking_domain_name: string;
  network_account_id: string;
  network_account_name: string;
  owner_membership_id: string;
  publisher_name: string;
  ip_hash: string;
  country_code: string | null;
  device: string;
  browser: string;
  user_agent: string | null;
  review_status: string;
  duplicate_decision: string;
  fraud_risk_level: string;
  proxy_detection_outcome: string;
  captured_at: string | Date;
}> &
  Record<string, unknown>;

type ConversionRow = Readonly<{
  id: string;
  public_conversion_id: string;
  public_click_id: string;
  offer_id: string;
  offer_name: string;
  tracking_domain_id: string;
  tracking_domain_name: string;
  network_account_id: string;
  network_account_name: string;
  owner_membership_id: string;
  publisher_name: string;
  country_code: string | null;
  device: string;
  browser: string;
  source: string;
  status: string;
  review_status: string;
  revenue_amount_minor: number | string | null;
  revenue_currency: string | null;
  payout_amount_minor: number | string;
  payout_currency: string;
  converted_at: string | Date;
}> &
  Record<string, unknown>;

type SessionRow = Readonly<{
  visitor_id: string;
  owner_membership_id: string;
  publisher_name: string;
  ip_hash: string;
  country_code: string | null;
  device: string;
  browser: string;
  click_count: number | string;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
}> &
  Record<string, unknown>;

type UserAgentRow = Readonly<{
  user_agent_hash: string;
  user_agent: string | null;
  device: string;
  browser: string;
  click_count: number | string;
  last_seen_at: string | Date;
}> &
  Record<string, unknown>;

type ProfileRow = Readonly<{
  user_id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  updated_at: string | Date;
}> &
  Record<string, unknown>;

type InvoiceRow = Readonly<{
  id: string;
  company_id: string;
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  invoice_number: string;
  status: string;
  currency: string;
  amount_minor: number | string;
  period_starts_at: string | Date;
  period_ends_at: string | Date | null;
  issued_at: string | Date;
  due_at: string | Date | null;
  paid_at: string | Date | null;
  external_reference: string | null;
}> &
  Record<string, unknown>;

type ManualConversionRow = Readonly<{
  id: string;
  public_conversion_id: string;
  public_click_id: string;
  source: string;
  status: string;
  payout_amount_minor: number | string;
  payout_currency: string;
  converted_at: string | Date;
}> &
  Record<string, unknown>;

type ManualClickRow = Readonly<{
  id: string;
  company_id: string;
  public_click_id: string;
  tracking_link_id: string;
  offer_id: string;
  network_account_id: string;
  network_provider_id: string;
  owner_membership_id: string;
  owner_user_id: string;
  offer_assignment_id: string;
  tracking_link_snapshot: unknown;
  offer_snapshot: unknown;
  assignment_snapshot: unknown;
  payout_mode: string;
  payout_amount_minor: number | string | null;
  payout_currency: string | null;
}> &
  Record<string, unknown>;

export interface FinalOperationsRepository {
  listPerformanceReport(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    dimension: PerformanceReportDimension,
    input: PerformanceReportInput,
    scope: FinalOperationsScope,
  ): Promise<readonly PerformanceReportRow[]>;

  listClicks(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    input: ClickLogInput,
    scope: FinalOperationsScope,
  ): Promise<readonly ClickLogRecord[]>;

  listConversions(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    input: ConversionLogInput,
    scope: FinalOperationsScope,
  ): Promise<readonly ConversionLogRecord[]>;

  listSessions(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    input: SessionLogInput,
    scope: FinalOperationsScope,
  ): Promise<readonly SessionLogRecord[]>;

  listUserAgents(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    input: UserAgentLogInput,
    scope: FinalOperationsScope,
  ): Promise<readonly UserAgentLogRecord[]>;

  getAccountProfile(
    context: FinalOperationsRepositoryContext,
    userId: string,
  ): Promise<AccountProfileRecord | undefined>;

  updateAccountProfile(
    context: FinalOperationsRepositoryContext,
    userId: string,
    input: UpdateAccountProfileInput,
  ): Promise<AccountProfileRecord | undefined>;

  listBillingInvoices(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    limit: number,
  ): Promise<readonly BillingInvoiceRecord[]>;

  createManualConversion(
    context: FinalOperationsRepositoryContext,
    companyId: string,
    input: CreateManualConversionInput,
    scope: FinalOperationsScope,
  ): Promise<ManualConversionRecord | undefined>;
}

const countryCodeExpression = `
  coalesce(
    nullif(upper(click.proxy_decision_snapshot #>> '{providerSnapshot,countryCode}'), ''),
    nullif(upper(click.proxy_decision_snapshot #>> '{providerSnapshot,country_code}'), ''),
    nullif(upper(click.proxy_decision_snapshot #>> '{providerSnapshot,country}'), '')
  )
`;

const deviceExpression = `
  case
    when click.user_agent is null then 'other'
    when click.user_agent ~* '(ipad|tablet|kindle|silk)' then 'tablet'
    when click.user_agent ~* '(mobile|android|iphone|ipod)' then 'mobile'
    else 'desktop'
  end
`;

const browserExpression = `
  case
    when click.user_agent is null then 'Unknown'
    when click.user_agent ~* '(edg|edge)/' then 'Edge'
    when click.user_agent ~* '(opr|opera)/' then 'Opera'
    when click.user_agent ~* 'firefox/' then 'Firefox'
    when click.user_agent ~* '(chrome|crios)/' then 'Chrome'
    when click.user_agent ~* 'safari/' then 'Safari'
    else 'Other'
  end
`;

const clickReviewStatusExpression = `
  case
    when
      click.duplicate_decision = 'duplicate'
      or not click.attribution_eligible
      or click.proxy_detection_outcome = 'blocked'
    then 'rejected'
    when click.proxy_detection_outcome in ('not_checked', 'provider_failed')
    then 'unchecked'
    else 'approved'
  end
`;

const conversionReviewStatusExpression = `
  case
    when conversion.status = 'approved' then 'approved'
    when conversion.status = 'pending' then 'unchecked'
    else 'rejected'
  end
`;

function createSessionContext(context: FinalOperationsRepositoryContext): DatabaseExecutionContext {
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

function appendValue(values: unknown[], value: unknown): string {
  values.push(value);
  return `$${String(values.length)}`;
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

function normalizeSafeInteger(value: number | string, fieldName: string): number {
  const normalized = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`The database returned an invalid ${fieldName}.`);
  }

  return normalized;
}

function mapDevice(value: string): ClickLogRecord['device'] {
  switch (value) {
    case 'desktop':
    case 'mobile':
    case 'tablet':
    case 'other':
      return value;
    default:
      throw new Error('The database returned an unsupported device type.');
  }
}

function mapReviewStatus(value: string): ClickLogRecord['status'] {
  switch (value) {
    case 'approved':
    case 'rejected':
    case 'unchecked':
      return value;
    default:
      throw new Error('The database returned an unsupported review status.');
  }
}

function mapConversionStatus(value: string): ConversionLogRecord['status'] {
  switch (value) {
    case 'pending':
    case 'approved':
    case 'rejected':
    case 'reversed':
      return value;
    default:
      throw new Error('The database returned an unsupported conversion status.');
  }
}

function mapConversionSource(value: string): ConversionLogRecord['source'] {
  if (value === 'provider_postback' || value === 'manual') {
    return value;
  }

  throw new Error('The database returned an unsupported conversion source.');
}

function mapDuplicateDecision(value: string): ClickLogRecord['duplicateDecision'] {
  if (value === 'accepted' || value === 'duplicate') {
    return value;
  }

  throw new Error('The database returned an unsupported duplicate decision.');
}

function mapFraudRisk(value: string): ClickLogRecord['fraudRiskLevel'] {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  throw new Error('The database returned an unsupported fraud risk.');
}

function mapProxyOutcome(value: string): ClickLogRecord['proxyDetectionOutcome'] {
  switch (value) {
    case 'not_checked':
    case 'bypassed':
    case 'clean':
    case 'flagged':
    case 'blocked':
    case 'provider_failed':
      return value;
    default:
      throw new Error('The database returned an unsupported proxy outcome.');
  }
}

function mapReportRow(row: ReportRow): PerformanceReportRow {
  return Object.freeze({
    dimensionId: row.dimension_id,
    dimensionName: row.dimension_name,
    dimensionStatus: row.dimension_status,
    approvedClicks: normalizeSafeInteger(row.approved_clicks, 'approved_clicks'),
    rejectedClicks: normalizeSafeInteger(row.rejected_clicks, 'rejected_clicks'),
    uncheckedClicks: normalizeSafeInteger(row.unchecked_clicks, 'unchecked_clicks'),
    totalClicks: normalizeSafeInteger(row.total_clicks, 'total_clicks'),
    approvedConversions: normalizeSafeInteger(row.approved_conversions, 'approved_conversions'),
    rejectedConversions: normalizeSafeInteger(row.rejected_conversions, 'rejected_conversions'),
    uncheckedConversions: normalizeSafeInteger(row.unchecked_conversions, 'unchecked_conversions'),
    totalConversions: normalizeSafeInteger(row.total_conversions, 'total_conversions'),
  });
}

function mapClickRow(row: ClickRow): ClickLogRecord {
  return Object.freeze({
    id: row.id,
    publicClickId: row.public_click_id,
    offerId: row.offer_id,
    offerName: row.offer_name,
    trackingDomainId: row.tracking_domain_id,
    trackingDomainName: row.tracking_domain_name,
    networkAccountId: row.network_account_id,
    networkAccountName: row.network_account_name,
    ownerMembershipId: row.owner_membership_id,
    publisherName: row.publisher_name,
    ipHash: row.ip_hash,
    countryCode: row.country_code,
    device: mapDevice(row.device),
    browser: row.browser,
    userAgent: row.user_agent,
    status: mapReviewStatus(row.review_status),
    duplicateDecision: mapDuplicateDecision(row.duplicate_decision),
    fraudRiskLevel: mapFraudRisk(row.fraud_risk_level),
    proxyDetectionOutcome: mapProxyOutcome(row.proxy_detection_outcome),
    capturedAt: normalizeTimestamp(row.captured_at),
  });
}

function mapConversionRow(row: ConversionRow): ConversionLogRecord {
  return Object.freeze({
    id: row.id,
    publicConversionId: row.public_conversion_id,
    publicClickId: row.public_click_id,
    offerId: row.offer_id,
    offerName: row.offer_name,
    trackingDomainId: row.tracking_domain_id,
    trackingDomainName: row.tracking_domain_name,
    networkAccountId: row.network_account_id,
    networkAccountName: row.network_account_name,
    ownerMembershipId: row.owner_membership_id,
    publisherName: row.publisher_name,
    countryCode: row.country_code,
    device: mapDevice(row.device),
    browser: row.browser,
    source: mapConversionSource(row.source),
    status: mapConversionStatus(row.status),
    reviewStatus: mapReviewStatus(row.review_status),
    revenueAmountMinor:
      row.revenue_amount_minor === null
        ? null
        : normalizeSafeInteger(row.revenue_amount_minor, 'revenue_amount_minor'),
    revenueCurrency: row.revenue_currency,
    payoutAmountMinor: normalizeSafeInteger(row.payout_amount_minor, 'payout_amount_minor'),
    payoutCurrency: row.payout_currency,
    convertedAt: normalizeTimestamp(row.converted_at),
  });
}

function mapSessionRow(row: SessionRow): SessionLogRecord {
  return Object.freeze({
    visitorId: row.visitor_id,
    ownerMembershipId: row.owner_membership_id,
    publisherName: row.publisher_name,
    ipHash: row.ip_hash,
    countryCode: row.country_code,
    device: mapDevice(row.device),
    browser: row.browser,
    clickCount: normalizeSafeInteger(row.click_count, 'click_count'),
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
  });
}

function mapUserAgentRow(row: UserAgentRow): UserAgentLogRecord {
  return Object.freeze({
    userAgentHash: row.user_agent_hash,
    userAgent: row.user_agent,
    device: mapDevice(row.device),
    browser: row.browser,
    clickCount: normalizeSafeInteger(row.click_count, 'click_count'),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
  });
}

function mapProfileRow(row: ProfileRow): AccountProfileRecord {
  return Object.freeze({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    updatedAt: normalizeTimestamp(row.updated_at),
  });
}

function mapInvoiceStatus(value: string): BillingInvoiceRecord['status'] {
  switch (value) {
    case 'issued':
    case 'paid':
    case 'overdue':
    case 'void':
      return value;
    default:
      throw new Error('The database returned an unsupported invoice status.');
  }
}

function mapInvoiceRow(row: InvoiceRow): BillingInvoiceRecord {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    subscriptionId: row.subscription_id,
    planId: row.plan_id,
    planName: row.plan_name,
    invoiceNumber: row.invoice_number,
    status: mapInvoiceStatus(row.status),
    currency: row.currency,
    amountMinor: normalizeSafeInteger(row.amount_minor, 'amount_minor'),
    periodStartsAt: normalizeTimestamp(row.period_starts_at),
    periodEndsAt: normalizeNullableTimestamp(row.period_ends_at),
    issuedAt: normalizeTimestamp(row.issued_at),
    dueAt: normalizeNullableTimestamp(row.due_at),
    paidAt: normalizeNullableTimestamp(row.paid_at),
    externalReference: row.external_reference,
  });
}

function mapManualConversionRow(row: ManualConversionRow): ManualConversionRecord {
  const status = mapConversionStatus(row.status);

  if (status === 'reversed') {
    throw new Error('A new manual conversion cannot be reversed.');
  }

  if (row.source !== 'manual') {
    throw new Error('The database returned a non-manual conversion.');
  }

  return Object.freeze({
    id: row.id,
    publicConversionId: row.public_conversion_id,
    publicClickId: row.public_click_id,
    source: 'manual',
    status,
    payoutAmountMinor: normalizeSafeInteger(row.payout_amount_minor, 'payout_amount_minor'),
    payoutCurrency: row.payout_currency,
    convertedAt: normalizeTimestamp(row.converted_at),
  });
}

function addCommonClickFilters(
  values: unknown[],
  conditions: string[],
  input: {
    readonly from?: string;
    readonly to?: string;
    readonly search?: string;
    readonly status?: string;
    readonly offerId?: string;
    readonly networkAccountId?: string;
    readonly ownerMembershipId?: string;
    readonly countryCode?: string;
    readonly device?: string;
  },
  scope: FinalOperationsScope,
): void {
  if (input.from !== undefined) {
    conditions.push(`click.captured_at >= ${appendValue(values, input.from)}::timestamptz`);
  }

  if (input.to !== undefined) {
    conditions.push(`click.captured_at < ${appendValue(values, input.to)}::timestamptz`);
  }

  if (input.offerId !== undefined) {
    conditions.push(`click.offer_id = ${appendValue(values, input.offerId)}::uuid`);
  }

  if (input.networkAccountId !== undefined) {
    conditions.push(
      `click.network_account_id = ${appendValue(values, input.networkAccountId)}::uuid`,
    );
  }

  if (input.ownerMembershipId !== undefined) {
    conditions.push(
      `click.owner_membership_id = ${appendValue(values, input.ownerMembershipId)}::uuid`,
    );
  }

  if (scope.ownerUserId !== undefined) {
    conditions.push(`click.owner_user_id = ${appendValue(values, scope.ownerUserId)}::uuid`);
  }

  if (scope.managerMembershipId !== undefined) {
    const managerPlaceholder = appendValue(values, scope.managerMembershipId);
    conditions.push(`
      exists (
        select 1
        from public.offer_assignments as manager_assignment
        where manager_assignment.company_id = click.company_id
          and manager_assignment.offer_id = click.offer_id
          and manager_assignment.membership_id = ${managerPlaceholder}::uuid
          and manager_assignment.manager_membership_id is null
          and manager_assignment.status = 'active'
      )
    `);
    conditions.push(`
      exists (
        select 1
        from public.offer_assignments as publisher_assignment
        where publisher_assignment.company_id = click.company_id
          and publisher_assignment.offer_id = click.offer_id
          and publisher_assignment.membership_id = click.owner_membership_id
          and publisher_assignment.manager_membership_id =
            ${managerPlaceholder}::uuid
          and publisher_assignment.status = 'active'
      )
    `);
  }

  if (input.countryCode !== undefined) {
    conditions.push(
      `${countryCodeExpression} = ${appendValue(values, input.countryCode.toUpperCase())}`,
    );
  }

  if (input.device !== undefined) {
    conditions.push(`${deviceExpression} = ${appendValue(values, input.device)}`);
  }

  if (input.status !== undefined) {
    conditions.push(`${clickReviewStatusExpression} = ${appendValue(values, input.status)}`);
  }

  if (input.search !== undefined) {
    const placeholder = appendValue(values, `%${input.search}%`);
    conditions.push(`
      (
        click.public_click_id ilike ${placeholder}
        or offer.name ilike ${placeholder}
        or account.name ilike ${placeholder}
        or domain.hostname ilike ${placeholder}
        or coalesce(profile.display_name, auth_user.email, '') ilike ${placeholder}
      )
    `);
  }
}

function addManagerConversionScope(
  values: unknown[],
  conditions: string[],
  scope: FinalOperationsScope,
): void {
  if (scope.managerMembershipId === undefined) {
    return;
  }

  const managerPlaceholder = appendValue(values, scope.managerMembershipId);

  conditions.push(`
    exists (
      select 1
      from public.offer_assignments as manager_assignment
      where manager_assignment.company_id = conversion.company_id
        and manager_assignment.offer_id = conversion.offer_id
        and manager_assignment.membership_id = ${managerPlaceholder}::uuid
        and manager_assignment.manager_membership_id is null
        and manager_assignment.status = 'active'
    )
  `);
  conditions.push(`
    exists (
      select 1
      from public.offer_assignments as publisher_assignment
      where publisher_assignment.company_id = conversion.company_id
        and publisher_assignment.offer_id = conversion.offer_id
        and publisher_assignment.membership_id = conversion.owner_membership_id
        and publisher_assignment.manager_membership_id =
          ${managerPlaceholder}::uuid
        and publisher_assignment.status = 'active'
    )
  `);
}

function buildDimensionQuery(dimension: PerformanceReportDimension): {
  readonly dimensionSource: string;
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly dimensionStatus: string;
  readonly clickJoin: string;
  readonly conversionJoin: string;
} {
  switch (dimension) {
    case 'offers':
      return {
        dimensionSource: `
          public.offers as dimension
        `,
        dimensionId: 'dimension.id',
        dimensionName: 'dimension.name',
        dimensionStatus: 'dimension.status::text',
        clickJoin: 'click.offer_id = dimension.id',
        conversionJoin: 'conversion.offer_id = dimension.id',
      };
    case 'networks':
      return {
        dimensionSource: `
          public.network_accounts as dimension
        `,
        dimensionId: 'dimension.id',
        dimensionName: 'dimension.name',
        dimensionStatus: 'dimension.status::text',
        clickJoin: 'click.network_account_id = dimension.id',
        conversionJoin: 'conversion.network_account_id = dimension.id',
      };
    case 'managers':
      return {
        dimensionSource: `
          public.company_memberships as dimension
          left join public.user_profiles as dimension_profile
            on dimension_profile.user_id = dimension.user_id
          left join auth.users as dimension_user
            on dimension_user.id = dimension.user_id
        `,
        dimensionId: 'dimension.id',
        dimensionName:
          "coalesce(dimension_profile.display_name, dimension_user.email, 'Unknown Manager')",
        dimensionStatus: 'dimension.status::text',
        clickJoin: `
          exists (
            select 1
            from public.offer_assignments as publisher_assignment
            where publisher_assignment.company_id = dimension.company_id
              and publisher_assignment.offer_id = click.offer_id
              and publisher_assignment.membership_id = click.owner_membership_id
              and publisher_assignment.manager_membership_id = dimension.id
              and publisher_assignment.status = 'active'
          )
        `,
        conversionJoin: `
          exists (
            select 1
            from public.offer_assignments as publisher_assignment
            where publisher_assignment.company_id = dimension.company_id
              and publisher_assignment.offer_id = conversion.offer_id
              and publisher_assignment.membership_id = conversion.owner_membership_id
              and publisher_assignment.manager_membership_id = dimension.id
              and publisher_assignment.status = 'active'
          )
        `,
      };
    case 'publishers':
      return {
        dimensionSource: `
          public.company_memberships as dimension
          left join public.user_profiles as dimension_profile
            on dimension_profile.user_id = dimension.user_id
          left join auth.users as dimension_user
            on dimension_user.id = dimension.user_id
        `,
        dimensionId: 'dimension.id',
        dimensionName:
          "coalesce(dimension_profile.display_name, dimension_user.email, 'Unknown publisher')",
        dimensionStatus: 'dimension.status::text',
        clickJoin: 'click.owner_membership_id = dimension.id',
        conversionJoin: 'conversion.owner_membership_id = dimension.id',
      };
  }
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
    name: 'final-operations-write-audit-event',
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
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
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

export function createFinalOperationsRepository(
  database: DatabaseRuntime,
): FinalOperationsRepository {
  return Object.freeze<FinalOperationsRepository>({
    async listPerformanceReport(context, companyId, dimension, input, scope) {
      const dimensionQuery = buildDimensionQuery(dimension);

      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const clickConditions = ['click.company_id = $1'];

          addCommonClickFilters(
            values,
            clickConditions,
            {
              ...(input.from !== undefined ? { from: input.from } : {}),
              ...(input.to !== undefined ? { to: input.to } : {}),
              ...(input.offerId !== undefined ? { offerId: input.offerId } : {}),
              ...(input.networkAccountId !== undefined
                ? { networkAccountId: input.networkAccountId }
                : {}),
              ...(input.ownerMembershipId !== undefined
                ? { ownerMembershipId: input.ownerMembershipId }
                : {}),
              ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
              ...(input.device !== undefined ? { device: input.device } : {}),
            },
            scope,
          );

          const conversionConditions = ['conversion.company_id = $1'];

          if (input.from !== undefined) {
            conversionConditions.push(
              `conversion.converted_at >= ${appendValue(values, input.from)}::timestamptz`,
            );
          }

          if (input.to !== undefined) {
            conversionConditions.push(
              `conversion.converted_at < ${appendValue(values, input.to)}::timestamptz`,
            );
          }

          if (input.offerId !== undefined) {
            conversionConditions.push(
              `conversion.offer_id = ${appendValue(values, input.offerId)}::uuid`,
            );
          }

          if (input.networkAccountId !== undefined) {
            conversionConditions.push(
              `conversion.network_account_id = ${appendValue(
                values,
                input.networkAccountId,
              )}::uuid`,
            );
          }

          if (input.ownerMembershipId !== undefined) {
            conversionConditions.push(
              `conversion.owner_membership_id = ${appendValue(
                values,
                input.ownerMembershipId,
              )}::uuid`,
            );
          }

          if (scope.ownerUserId !== undefined) {
            conversionConditions.push(
              `conversion.owner_user_id = ${appendValue(values, scope.ownerUserId)}::uuid`,
            );
          }

          addManagerConversionScope(values, conversionConditions, scope);

          if (input.countryCode !== undefined) {
            conversionConditions.push(
              `${countryCodeExpression} = ${appendValue(values, input.countryCode.toUpperCase())}`,
            );
          }

          if (input.device !== undefined) {
            conversionConditions.push(`${deviceExpression} = ${appendValue(values, input.device)}`);
          }

          const searchPlaceholder =
            input.search === undefined ? null : appendValue(values, `%${input.search}%`);
          const statusPlaceholder =
            input.status === undefined ? null : appendValue(values, input.status);
          const publisherScopePlaceholder =
            dimension === 'publishers' && scope.ownerUserId !== undefined
              ? appendValue(values, scope.ownerUserId)
              : null;
          const limitPlaceholder = appendValue(values, input.limit);

          const managerDimensionCondition =
            scope.managerMembershipId === undefined
              ? null
              : (() => {
                  const managerPlaceholder = appendValue(values, scope.managerMembershipId);

                  switch (dimension) {
                    case 'offers':
                      return `
                        exists (
                          select 1
                          from public.offer_assignments as manager_assignment
                          where manager_assignment.company_id = dimension.company_id
                            and manager_assignment.offer_id = dimension.id
                            and manager_assignment.membership_id =
                              ${managerPlaceholder}::uuid
                            and manager_assignment.manager_membership_id is null
                            and manager_assignment.status = 'active'
                        )
                      `;
                    case 'networks':
                      return `
                        exists (
                          select 1
                          from public.offers as managed_offer
                          inner join public.offer_assignments as manager_assignment
                            on manager_assignment.offer_id = managed_offer.id
                           and manager_assignment.company_id = managed_offer.company_id
                          where managed_offer.company_id = dimension.company_id
                            and managed_offer.network_account_id = dimension.id
                            and manager_assignment.membership_id =
                              ${managerPlaceholder}::uuid
                            and manager_assignment.manager_membership_id is null
                            and manager_assignment.status = 'active'
                        )
                      `;
                    case 'managers':
                      return `dimension.id = ${managerPlaceholder}::uuid`;
                    case 'publishers':
                      return `
                        exists (
                          select 1
                          from public.offer_assignments as publisher_assignment
                          where publisher_assignment.company_id = dimension.company_id
                            and publisher_assignment.membership_id = dimension.id
                            and publisher_assignment.manager_membership_id =
                              ${managerPlaceholder}::uuid
                            and publisher_assignment.status = 'active'
                        )
                      `;
                  }
                })();

          const dimensionWhere = [
            'dimension.company_id = $1',
            ...(managerDimensionCondition === null ? [] : [managerDimensionCondition]),
            ...(dimension === 'publishers'
              ? ["dimension.role = 'publisher'"]
              : dimension === 'managers'
                ? ["dimension.role = 'manager'"]
                : []),
            ...(publisherScopePlaceholder === null
              ? []
              : [`dimension.user_id = ${publisherScopePlaceholder}::uuid`]),
            ...(searchPlaceholder === null
              ? []
              : [`${dimensionQuery.dimensionName} ilike ${searchPlaceholder}`]),
            ...(statusPlaceholder === null
              ? []
              : [`${dimensionQuery.dimensionStatus} = ${statusPlaceholder}`]),
          ];

          const result = await transaction.query<ReportRow>({
            name: `final-operations-report-${dimension}`,
            text: `
              with scoped_clicks as (
                select click.*
                from public.tracking_clicks as click
                inner join public.offers as offer
                  on offer.id = click.offer_id
                inner join public.network_accounts as account
                  on account.id = click.network_account_id
                inner join public.tracking_domains as domain
                  on domain.id = click.tracking_domain_id
                left join public.user_profiles as profile
                  on profile.user_id = click.owner_user_id
                left join auth.users as auth_user
                  on auth_user.id = click.owner_user_id
                where ${clickConditions.join('\n                  and ')}
              ),
              scoped_conversions as (
                select conversion.*
                from public.conversions as conversion
                inner join public.tracking_clicks as click
                  on click.id = conversion.tracking_click_id
                where ${conversionConditions.join('\n                  and ')}
              )
              select
                ${dimensionQuery.dimensionId} as dimension_id,
                ${dimensionQuery.dimensionName} as dimension_name,
                ${dimensionQuery.dimensionStatus} as dimension_status,
                count(distinct click.id) filter (
                  where ${clickReviewStatusExpression} = 'approved'
                )::bigint as approved_clicks,
                count(distinct click.id) filter (
                  where ${clickReviewStatusExpression} = 'rejected'
                )::bigint as rejected_clicks,
                count(distinct click.id) filter (
                  where ${clickReviewStatusExpression} = 'unchecked'
                )::bigint as unchecked_clicks,
                count(distinct click.id)::bigint as total_clicks,
                count(distinct conversion.id) filter (
                  where conversion.status = 'approved'
                )::bigint as approved_conversions,
                count(distinct conversion.id) filter (
                  where conversion.status in ('rejected', 'reversed')
                )::bigint as rejected_conversions,
                count(distinct conversion.id) filter (
                  where conversion.status = 'pending'
                )::bigint as unchecked_conversions,
                count(distinct conversion.id)::bigint as total_conversions
              from ${dimensionQuery.dimensionSource}
              left join scoped_clicks as click
                on ${dimensionQuery.clickJoin}
              left join scoped_conversions as conversion
                on ${dimensionQuery.conversionJoin}
              where ${dimensionWhere.join('\n                and ')}
              group by
                ${dimensionQuery.dimensionId},
                ${dimensionQuery.dimensionName},
                ${dimensionQuery.dimensionStatus}
              order by total_clicks desc, dimension_name asc
              limit ${limitPlaceholder}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapReportRow));
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async listClicks(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['click.company_id = $1'];

          addCommonClickFilters(values, conditions, input, scope);

          const limitPlaceholder = appendValue(values, input.limit);

          const result = await transaction.query<ClickRow>({
            name: 'final-operations-list-clicks',
            text: `
              select
                click.id,
                click.public_click_id,
                click.offer_id,
                offer.name as offer_name,
                click.tracking_domain_id,
                domain.hostname as tracking_domain_name,
                click.network_account_id,
                account.name as network_account_name,
                click.owner_membership_id,
                coalesce(profile.display_name, auth_user.email, 'Unknown publisher')
                  as publisher_name,
                click.ip_hash,
                ${countryCodeExpression} as country_code,
                ${deviceExpression} as device,
                ${browserExpression} as browser,
                click.user_agent,
                ${clickReviewStatusExpression} as review_status,
                click.duplicate_decision,
                click.fraud_risk_level,
                click.proxy_detection_outcome,
                click.captured_at
              from public.tracking_clicks as click
              inner join public.offers as offer
                on offer.id = click.offer_id
              inner join public.network_accounts as account
                on account.id = click.network_account_id
              inner join public.tracking_domains as domain
                on domain.id = click.tracking_domain_id
              left join public.user_profiles as profile
                on profile.user_id = click.owner_user_id
              left join auth.users as auth_user
                on auth_user.id = click.owner_user_id
              where ${conditions.join('\n                and ')}
              order by click.captured_at desc, click.id desc
              limit ${limitPlaceholder}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapClickRow));
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async listConversions(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['conversion.company_id = $1'];

          if (input.from !== undefined) {
            conditions.push(
              `conversion.converted_at >= ${appendValue(values, input.from)}::timestamptz`,
            );
          }

          if (input.to !== undefined) {
            conditions.push(
              `conversion.converted_at < ${appendValue(values, input.to)}::timestamptz`,
            );
          }

          if (input.offerId !== undefined) {
            conditions.push(`conversion.offer_id = ${appendValue(values, input.offerId)}::uuid`);
          }

          if (input.networkAccountId !== undefined) {
            conditions.push(
              `conversion.network_account_id = ${appendValue(
                values,
                input.networkAccountId,
              )}::uuid`,
            );
          }

          if (input.ownerMembershipId !== undefined) {
            conditions.push(
              `conversion.owner_membership_id = ${appendValue(
                values,
                input.ownerMembershipId,
              )}::uuid`,
            );
          }

          if (scope.ownerUserId !== undefined) {
            conditions.push(
              `conversion.owner_user_id = ${appendValue(values, scope.ownerUserId)}::uuid`,
            );
          }

          addManagerConversionScope(values, conditions, scope);

          if (input.conversionStatus !== undefined) {
            conditions.push(
              `conversion.status = ${appendValue(values, input.conversionStatus)}::public.conversion_status`,
            );
          }

          if (input.status !== undefined) {
            conditions.push(
              `${conversionReviewStatusExpression} = ${appendValue(values, input.status)}`,
            );
          }

          if (input.countryCode !== undefined) {
            conditions.push(
              `${countryCodeExpression} = ${appendValue(values, input.countryCode.toUpperCase())}`,
            );
          }

          if (input.device !== undefined) {
            conditions.push(`${deviceExpression} = ${appendValue(values, input.device)}`);
          }

          if (input.search !== undefined) {
            const placeholder = appendValue(values, `%${input.search}%`);
            conditions.push(`
              (
                conversion.public_conversion_id ilike ${placeholder}
                or conversion.public_click_id ilike ${placeholder}
                or offer.name ilike ${placeholder}
                or account.name ilike ${placeholder}
                or domain.hostname ilike ${placeholder}
                or coalesce(profile.display_name, auth_user.email, '') ilike ${placeholder}
              )
            `);
          }

          const limitPlaceholder = appendValue(values, input.limit);

          const result = await transaction.query<ConversionRow>({
            name: 'final-operations-list-conversions',
            text: `
              select
                conversion.id,
                conversion.public_conversion_id,
                conversion.public_click_id,
                conversion.offer_id,
                offer.name as offer_name,
                click.tracking_domain_id,
                domain.hostname as tracking_domain_name,
                conversion.network_account_id,
                account.name as network_account_name,
                conversion.owner_membership_id,
                coalesce(profile.display_name, auth_user.email, 'Unknown publisher')
                  as publisher_name,
                ${countryCodeExpression} as country_code,
                ${deviceExpression} as device,
                ${browserExpression} as browser,
                conversion.source,
                conversion.status,
                ${conversionReviewStatusExpression} as review_status,
                conversion.revenue_amount_minor,
                conversion.revenue_currency,
                conversion.payout_amount_minor,
                conversion.payout_currency,
                conversion.converted_at
              from public.conversions as conversion
              inner join public.tracking_clicks as click
                on click.id = conversion.tracking_click_id
              inner join public.offers as offer
                on offer.id = conversion.offer_id
              inner join public.network_accounts as account
                on account.id = conversion.network_account_id
              inner join public.tracking_domains as domain
                on domain.id = click.tracking_domain_id
              left join public.user_profiles as profile
                on profile.user_id = conversion.owner_user_id
              left join auth.users as auth_user
                on auth_user.id = conversion.owner_user_id
              where ${conditions.join('\n                and ')}
              order by conversion.converted_at desc, conversion.id desc
              limit ${limitPlaceholder}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapConversionRow));
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async listSessions(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['click.company_id = $1'];

          addCommonClickFilters(
            values,
            conditions,
            {
              ...input,
            },
            scope,
          );

          const limitPlaceholder = appendValue(values, input.limit);

          const result = await transaction.query<SessionRow>({
            name: 'final-operations-list-sessions',
            text: `
              select
                click.visitor_id,
                click.owner_membership_id,
                coalesce(profile.display_name, auth_user.email, 'Unknown publisher')
                  as publisher_name,
                (array_agg(click.ip_hash order by click.captured_at desc, click.id desc))[1]
                  as ip_hash,
                (array_agg(${countryCodeExpression} order by click.captured_at desc, click.id desc))[1]
                  as country_code,
                (array_agg(${deviceExpression} order by click.captured_at desc, click.id desc))[1]
                  as device,
                (array_agg(${browserExpression} order by click.captured_at desc, click.id desc))[1]
                  as browser,
                count(*)::bigint as click_count,
                min(click.captured_at) as first_seen_at,
                max(click.captured_at) as last_seen_at
              from public.tracking_clicks as click
              inner join public.offers as offer
                on offer.id = click.offer_id
              inner join public.network_accounts as account
                on account.id = click.network_account_id
              inner join public.tracking_domains as domain
                on domain.id = click.tracking_domain_id
              left join public.user_profiles as profile
                on profile.user_id = click.owner_user_id
              left join auth.users as auth_user
                on auth_user.id = click.owner_user_id
              where ${conditions.join('\n                and ')}
              group by
                click.visitor_id,
                click.owner_membership_id,
                profile.display_name,
                auth_user.email
              order by last_seen_at desc, click.visitor_id desc
              limit ${limitPlaceholder}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapSessionRow));
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async listUserAgents(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const values: unknown[] = [companyId];
          const conditions = ['click.company_id = $1'];

          addCommonClickFilters(values, conditions, input, scope);

          const limitPlaceholder = appendValue(values, input.limit);

          const result = await transaction.query<UserAgentRow>({
            name: 'final-operations-list-user-agents',
            text: `
              select
                click.user_agent_hash,
                max(click.user_agent) as user_agent,
                ${deviceExpression} as device,
                ${browserExpression} as browser,
                count(*)::bigint as click_count,
                max(click.captured_at) as last_seen_at
              from public.tracking_clicks as click
              inner join public.offers as offer
                on offer.id = click.offer_id
              inner join public.network_accounts as account
                on account.id = click.network_account_id
              inner join public.tracking_domains as domain
                on domain.id = click.tracking_domain_id
              left join public.user_profiles as profile
                on profile.user_id = click.owner_user_id
              left join auth.users as auth_user
                on auth_user.id = click.owner_user_id
              where ${conditions.join('\n                and ')}
              group by
                click.user_agent_hash,
                ${deviceExpression},
                ${browserExpression}
              order by click_count desc, last_seen_at desc
              limit ${limitPlaceholder}
            `,
            values,
          });

          return Object.freeze(result.rows.map(mapUserAgentRow));
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async getAccountProfile(context, userId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ProfileRow>({
            name: 'final-operations-get-account-profile',
            text: `
              select
                profile.user_id,
                auth_user.email,
                profile.display_name,
                profile.timezone,
                profile.updated_at
              from public.user_profiles as profile
              inner join auth.users as auth_user
                on auth_user.id = profile.user_id
              where profile.user_id = $1
              limit 1
            `,
            values: [userId],
          });

          const row = result.rows[0];

          return row === undefined ? undefined : mapProfileRow(row);
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async updateAccountProfile(context, userId, input) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ProfileRow>({
            name: 'final-operations-update-account-profile',
            text: `
              with updated_profile as (
                update public.user_profiles
                set
                  display_name = $2,
                  timezone = $3
                where user_id = $1
                returning
                  user_id,
                  display_name,
                  timezone,
                  updated_at
              )
              select
                profile.user_id,
                auth_user.email,
                profile.display_name,
                profile.timezone,
                profile.updated_at
              from updated_profile as profile
              inner join auth.users as auth_user
                on auth_user.id = profile.user_id
            `,
            values: [userId, input.displayName, input.timezone],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const profile = mapProfileRow(row);

          await writeAuditEvent(transaction, {
            companyId: null,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'account.profile.updated',
            entityType: 'user_profile',
            entityId: userId,
            metadata: {
              displayNameConfigured: profile.displayName !== null,
              timezone: profile.timezone,
            },
          });

          return profile;
        },
        {
          sessionContext: createSessionContext(context),
        },
      );
    },

    async listBillingInvoices(context, companyId, limit) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<InvoiceRow>({
            name: 'final-operations-list-billing-invoices',
            text: `
              select
                invoice.id,
                invoice.company_id,
                invoice.subscription_id,
                invoice.plan_id,
                plan.name as plan_name,
                invoice.invoice_number,
                invoice.status,
                invoice.currency,
                invoice.amount_minor,
                invoice.period_starts_at,
                invoice.period_ends_at,
                invoice.issued_at,
                invoice.due_at,
                invoice.paid_at,
                invoice.external_reference
              from public.billing_invoices as invoice
              inner join public.billing_plans as plan
                on plan.id = invoice.plan_id
              where invoice.company_id = $1
              order by invoice.issued_at desc, invoice.id desc
              limit $2
            `,
            values: [companyId, limit],
          });

          return Object.freeze(result.rows.map(mapInvoiceRow));
        },
        {
          readOnly: true,
          sessionContext: createSessionContext(context),
        },
      );
    },

    async createManualConversion(context, companyId, input, scope) {
      return database.transaction(
        async (transaction) => {
          const clickResult = await transaction.query<ManualClickRow>({
            name: 'final-operations-get-manual-conversion-click',
            text: `
              select
                click.id,
                click.company_id,
                click.public_click_id,
                click.tracking_link_id,
                click.offer_id,
                click.network_account_id,
                click.network_provider_id,
                click.owner_membership_id,
                click.owner_user_id,
                click.offer_assignment_id,
                click.tracking_link_snapshot,
                click.offer_snapshot,
                click.assignment_snapshot,
                case
                  when assignment.manual_payout_amount_minor is not null
                    then 'per_offer'
                  when payout.mode = 'fixed_member'
                    then 'fixed_member'
                  else 'per_offer'
                end as payout_mode,
                coalesce(
                  assignment.manual_payout_amount_minor,
                  case
                    when payout.mode = 'fixed_member'
                      then payout.fixed_payout_amount_minor
                    else null
                  end,
                  configuration.default_payout_amount_minor
                ) as payout_amount_minor,
                coalesce(
                  assignment.manual_payout_currency,
                  case
                    when payout.mode = 'fixed_member'
                      then payout.payout_currency
                    else null
                  end,
                  configuration.payout_currency
                ) as payout_currency
              from public.tracking_clicks as click
              inner join public.offer_assignments as assignment
                on assignment.id = click.offer_assignment_id
              left join public.member_payout_profiles as payout
                on payout.membership_id = click.owner_membership_id
              left join public.offer_operational_configurations as configuration
                on configuration.offer_id = click.offer_id
              where click.company_id = $1
                and click.public_click_id = $2
                and click.attribution_eligible
                and (
                  $3::uuid is null
                  or (
                    exists (
                      select 1
                      from public.offer_assignments as manager_assignment
                      where manager_assignment.company_id = click.company_id
                        and manager_assignment.offer_id = click.offer_id
                        and manager_assignment.membership_id = $3::uuid
                        and manager_assignment.manager_membership_id is null
                        and manager_assignment.status = 'active'
                    )
                    and exists (
                      select 1
                      from public.offer_assignments as publisher_assignment
                      where publisher_assignment.company_id = click.company_id
                        and publisher_assignment.offer_id = click.offer_id
                        and publisher_assignment.membership_id =
                          click.owner_membership_id
                        and publisher_assignment.manager_membership_id = $3::uuid
                        and publisher_assignment.status = 'active'
                    )
                  )
                )
              limit 1
            `,
            values: [companyId, input.publicClickId, scope.managerMembershipId ?? null],
          });

          const click = clickResult.rows[0];

          if (
            click?.payout_amount_minor === undefined ||
            click.payout_amount_minor === null ||
            click.payout_currency === null
          ) {
            return undefined;
          }

          const payoutAmountMinor = normalizeSafeInteger(
            click.payout_amount_minor,
            'payout_amount_minor',
          );

          if (payoutAmountMinor < 1) {
            return undefined;
          }

          const result = await transaction.query<ManualConversionRow>({
            name: 'final-operations-create-manual-conversion',
            text: `
              insert into public.conversions (
                company_id,
                tracking_click_id,
                public_click_id,
                tracking_link_id,
                offer_id,
                network_account_id,
                network_provider_id,
                owner_membership_id,
                owner_user_id,
                offer_assignment_id,
                postback_endpoint_id,
                external_conversion_id,
                source,
                status,
                revenue_amount_minor,
                revenue_currency,
                payout_mode,
                payout_amount_minor,
                payout_currency,
                provider_payload,
                click_snapshot,
                payout_snapshot,
                converted_at
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
                null,
                'manual_' || replace(gen_random_uuid()::text, '-', ''),
                'manual',
                $11::public.conversion_status,
                $12,
                $13,
                $14::public.payout_mode,
                $15,
                $16,
                jsonb_build_object(
                  'source',
                  'manual_ui',
                  'requestId',
                  $17
                ),
                jsonb_build_object(
                  'trackingLink',
                  $18::jsonb,
                  'offer',
                  $19::jsonb,
                  'assignment',
                  $20::jsonb
                ),
                jsonb_build_object(
                  'mode',
                  $14,
                  'amountMinor',
                  $15,
                  'currency',
                  $16
                ),
                now()
              )
              on conflict (tracking_click_id)
                where source = 'manual'
              do nothing
              returning
                id,
                public_conversion_id,
                public_click_id,
                source,
                status,
                payout_amount_minor,
                payout_currency,
                converted_at
            `,
            values: [
              companyId,
              click.id,
              click.public_click_id,
              click.tracking_link_id,
              click.offer_id,
              click.network_account_id,
              click.network_provider_id,
              click.owner_membership_id,
              click.owner_user_id,
              click.offer_assignment_id,
              input.status,
              input.revenueAmountMinor ?? null,
              input.revenueCurrency ?? null,
              click.payout_mode,
              payoutAmountMinor,
              click.payout_currency,
              context.requestId,
              JSON.stringify(click.tracking_link_snapshot),
              JSON.stringify(click.offer_snapshot),
              JSON.stringify(click.assignment_snapshot),
            ],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return undefined;
          }

          const conversion = mapManualConversionRow(row);

          await writeAuditEvent(transaction, {
            companyId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            eventName: 'conversion.manual.created',
            entityType: 'conversion',
            entityId: conversion.id,
            metadata: {
              publicClickId: conversion.publicClickId,
              status: conversion.status,
              payoutAmountMinor: conversion.payoutAmountMinor,
              payoutCurrency: conversion.payoutCurrency,
            },
          });

          return conversion;
        },
        {
          sessionContext: createSessionContext(context),
        },
      );
    },
  });
}
