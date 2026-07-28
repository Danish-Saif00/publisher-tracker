import {
  authenticatedApiRequest,
  isRecord,
  readNullableString,
  readRequiredNumber,
  readRequiredString,
} from '../../lib/api-client';
import type {
  CompanyReportingDashboard,
  OperationalEvent,
  ReportingMonetaryTotal,
  ReportingPerformanceRow,
  ReportingTotals,
} from './reporting.types';

function readArray(value: unknown, fieldName: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function parseMonetaryTotal(value: unknown): ReportingMonetaryTotal {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid monetary total.');
  }

  return {
    currency: readRequiredString(value.currency, 'currency'),
    revenueAmountMinor: readRequiredNumber(
      value.revenueAmountMinor,
      'revenue amount',
    ),
    payoutAmountMinor: readRequiredNumber(value.payoutAmountMinor, 'payout amount'),
  };
}

function parseMonetaryTotals(value: unknown): readonly ReportingMonetaryTotal[] {
  return readArray(value, 'monetary totals').map(parseMonetaryTotal);
}

function parsePerformanceRow(value: unknown): ReportingPerformanceRow {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid performance row.');
  }

  return {
    dimensionId: readRequiredString(value.dimensionId, 'dimension id'),
    dimensionName: readRequiredString(value.dimensionName, 'dimension name'),
    clicks: readRequiredNumber(value.clicks, 'click count'),
    conversions: readRequiredNumber(value.conversions, 'conversion count'),
    approvedConversions: readRequiredNumber(
      value.approvedConversions,
      'approved conversion count',
    ),
    monetaryTotals: parseMonetaryTotals(value.monetaryTotals),
  };
}

function parseTotals(value: unknown): ReportingTotals {
  if (!isRecord(value)) {
    throw new Error('The API returned invalid reporting totals.');
  }

  return {
    clicks: readRequiredNumber(value.clicks, 'total clicks'),
    uniqueVisitors: readRequiredNumber(value.uniqueVisitors, 'unique visitors'),
    duplicateClicks: readRequiredNumber(value.duplicateClicks, 'duplicate clicks'),
    highRiskClicks: readRequiredNumber(value.highRiskClicks, 'high-risk clicks'),
    conversions: readRequiredNumber(value.conversions, 'total conversions'),
    approvedConversions: readRequiredNumber(
      value.approvedConversions,
      'approved conversions',
    ),
    monetaryTotals: parseMonetaryTotals(value.monetaryTotals),
  };
}

function parseDashboard(value: unknown): CompanyReportingDashboard {
  if (!isRecord(value) || !isRecord(value.period)) {
    throw new Error('The API returned an invalid reporting dashboard.');
  }

  return {
    companyId: readRequiredString(value.companyId, 'dashboard company id'),
    period: {
      from: readRequiredString(value.period.from, 'reporting period start'),
      to: readRequiredString(value.period.to, 'reporting period end'),
    },
    totals: parseTotals(value.totals),
    offers: readArray(value.offers, 'offer performance').map(parsePerformanceRow),
    networkAccounts: readArray(
      value.networkAccounts,
      'network-account performance',
    ).map(parsePerformanceRow),
    members: readArray(value.members, 'member performance').map(parsePerformanceRow),
  };
}

function parseEvent(value: unknown): OperationalEvent {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid operational event.');
  }

  return {
    id: readRequiredString(value.id, 'event id'),
    companyId: readNullableString(value.companyId, 'event company id'),
    actorUserId: readNullableString(value.actorUserId, 'event actor id'),
    requestId: readNullableString(value.requestId, 'event request id'),
    eventName: readRequiredString(value.eventName, 'event name'),
    entityType: readRequiredString(value.entityType, 'event entity type'),
    entityId: readNullableString(value.entityId, 'event entity id'),
    metadata: isRecord(value.metadata) ? value.metadata : {},
    createdAt: readRequiredString(value.createdAt, 'event created time'),
  };
}

export async function fetchReportingDashboard(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<CompanyReportingDashboard> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${encodeURIComponent(companyId)}/reporting/dashboard`,
    {
      companyId,
      ...(signal !== undefined ? { signal } : {}),
    },
  );

  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('The API returned an invalid reporting response.');
  }

  return parseDashboard(payload.data.dashboard);
}

export async function fetchOperationalEvents(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<readonly OperationalEvent[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${encodeURIComponent(companyId)}/operations/events?limit=8`,
    {
      companyId,
      ...(signal !== undefined ? { signal } : {}),
    },
  );

  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('The API returned an invalid operations response.');
  }

  return readArray(payload.data.events, 'operational events').map(parseEvent);
}
