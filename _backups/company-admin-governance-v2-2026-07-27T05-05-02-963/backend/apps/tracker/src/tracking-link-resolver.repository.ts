import type { DatabaseRuntime } from '@affiliate-tracker/database';

import type {
  CapturedTrackingClickRecord,
  CaptureTrackingClickInput,
  PublicTrackingLinkQueryParameters,
} from './tracking-link-resolver.types.js';

type CapturedTrackingClickRow = Readonly<{
  tracking_click_id: string;
  public_click_id: string;
  tracking_link_id: string;
  company_id: string;
  offer_id: string;
  network_account_id: string;
  tracking_domain_id: string;
  owner_membership_id: string;
  destination_url: string;
  query_parameters: unknown;
  duplicate_decision: string;
  fraud_risk_level: string;
  fraud_signals: unknown;
  attribution_eligible: boolean;
  captured_at: Date | string;
}> &
  Record<string, unknown>;

export interface TrackingLinkResolverRepository {
  captureTrackingClick(
    input: CaptureTrackingClickInput,
  ): Promise<CapturedTrackingClickRecord | undefined>;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid click timestamp.');
  }

  return date.toISOString();
}

function normalizeQueryParameters(value: unknown): PublicTrackingLinkQueryParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The database returned invalid public tracking-link query parameters.');
  }

  const parameters: Record<string, string> = {};

  for (const [key, parameterValue] of Object.entries(value)) {
    if (typeof parameterValue !== 'string') {
      throw new Error('The database returned a non-string public tracking-link parameter.');
    }

    parameters[key] = parameterValue;
  }

  return Object.freeze(parameters);
}

function parseDuplicateDecision(value: string): 'accepted' | 'duplicate' {
  if (value === 'accepted' || value === 'duplicate') {
    return value;
  }

  throw new Error('The database returned an unsupported duplicate decision.');
}

function parseFraudRiskLevel(value: string): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  throw new Error('The database returned an unsupported fraud-risk level.');
}

function normalizeFraudSignals(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('The database returned invalid fraud signals.');
  }

  return Object.freeze(
    value.map((signal) => {
      if (typeof signal !== 'string' || signal.trim().length === 0) {
        throw new Error('The database returned an invalid fraud signal.');
      }

      return signal;
    }),
  );
}

function mapCapturedTrackingClickRow(row: CapturedTrackingClickRow): CapturedTrackingClickRecord {
  return Object.freeze({
    trackingClickId: row.tracking_click_id,
    publicClickId: row.public_click_id,
    trackingLinkId: row.tracking_link_id,
    companyId: row.company_id,
    offerId: row.offer_id,
    networkAccountId: row.network_account_id,
    trackingDomainId: row.tracking_domain_id,
    ownerMembershipId: row.owner_membership_id,
    destinationUrl: row.destination_url,
    queryParameters: normalizeQueryParameters(row.query_parameters),
    duplicateDecision: parseDuplicateDecision(row.duplicate_decision),
    fraudRiskLevel: parseFraudRiskLevel(row.fraud_risk_level),
    fraudSignals: normalizeFraudSignals(row.fraud_signals),
    attributionEligible: row.attribution_eligible,
    capturedAt: normalizeTimestamp(row.captured_at),
  });
}

export function createTrackingLinkResolverRepository(
  database: DatabaseRuntime,
): TrackingLinkResolverRepository {
  return Object.freeze<TrackingLinkResolverRepository>({
    async captureTrackingClick(input) {
      return database.transaction(async (transaction) => {
        const result = await transaction.query<CapturedTrackingClickRow>({
          name: 'tracking-link-resolver-capture-click',
          text: `
            select
              tracking_click_id,
              public_click_id,
              tracking_link_id,
              company_id,
              offer_id,
              network_account_id,
              tracking_domain_id,
              owner_membership_id,
              destination_url,
              query_parameters,
              duplicate_decision,
              fraud_risk_level,
              fraud_signals,
              attribution_eligible,
              captured_at
            from public.capture_public_tracking_click(
              $1,
              $2,
              $3,
              $4::uuid,
              $5::public.visitor_identity_source,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $12,
              $13::jsonb
            )
            limit 1
          `,
          values: [
            input.hostname,
            input.publicToken,
            input.publicClickId,
            input.visitorId,
            input.visitorIdentitySource,
            input.ipHash,
            input.userAgent,
            input.userAgentHash,
            input.visitorFingerprint,
            input.referrerUrl,
            input.referrerHostname,
            input.requestPath,
            JSON.stringify(input.attribution),
          ],
        });

        const row = result.rows[0];

        return row === undefined ? undefined : mapCapturedTrackingClickRow(row);
      });
    },
  });
}
