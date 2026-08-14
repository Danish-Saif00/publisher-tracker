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
  effective_tracking_parameter: string;
  duplicate_decision: string;
  fraud_risk_level: string;
  fraud_signals: unknown;
  attribution_eligible: boolean;
  captured_at: Date | string;
}> &
  Record<string, unknown>;

export interface OfferTargetingConfiguration {
  readonly countries: readonly string[];
  readonly devices: readonly ('desktop' | 'android' | 'ios')[];
  readonly desktopUrl: string | null;
  readonly androidUrl: string | null;
  readonly iosUrl: string | null;
}

export interface TrackingLinkResolverRepository {
  getOfferTargetingConfiguration(
    companyId: string,
    offerId: string,
  ): Promise<OfferTargetingConfiguration>;
  markCountryAccessBlocked(
    trackingClickId: string,
    companyId: string,
    countryCode: string | null,
    countryName: string | null,
    allowedCountries: readonly string[],
  ): Promise<void>;
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

function normalizeTrackingParameter(value: string): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length < 1 ||
    normalizedValue.length > 120 ||
    !/^[A-Za-z0-9_.-]+$/u.test(normalizedValue)
  ) {
    throw new Error('The database returned an invalid effective tracking parameter.');
  }

  return normalizedValue;
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
    effectiveTrackingParameter: normalizeTrackingParameter(row.effective_tracking_parameter),
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
    async getOfferTargetingConfiguration(companyId, offerId) {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<{
            countries: string[];
            devices: string[];
            desktop_url: string | null;
            android_url: string | null;
            ios_url: string | null;
          }>({
            name: 'tracker-read-offer-targeting-configuration',
            text: `
              select
                coalesce(configuration.countries, array[]::text[]) as countries,
                coalesce(configuration.devices, array[]::text[]) as devices,
                configuration.desktop_url,
                configuration.android_url,
                configuration.ios_url
              from public.offers offer
              left join public.offer_operational_configurations configuration
                on configuration.offer_id = offer.id
                and configuration.company_id = offer.company_id
              where offer.id = $1
                and offer.company_id = $2
              limit 1
            `,
            values: [offerId, companyId],
          });
          const row = result.rows[0];
          const countries = (row?.countries ?? [])
            .map((country) => country.trim())
            .filter((country) => country.length > 0);
          const devices = (row?.devices ?? []).filter(
            (device): device is 'desktop' | 'android' | 'ios' =>
              device === 'desktop' || device === 'android' || device === 'ios',
          );
          return Object.freeze({
            countries: Object.freeze(countries),
            devices: Object.freeze(devices),
            desktopUrl: row?.desktop_url ?? null,
            androidUrl: row?.android_url ?? null,
            iosUrl: row?.ios_url ?? null,
          });
        },
        { readOnly: true },
      );
    },
    async markCountryAccessBlocked(
      trackingClickId,
      companyId,
      countryCode,
      countryName,
      allowedCountries,
    ) {
      await database.transaction(async (transaction) => {
        await transaction.query({
          name: 'tracker-enable-country-click-runtime-write',
          text: `
            select set_config(
              'app.tracking_click_runtime_write',
              'on',
              true
            )
          `,
          values: [],
        });

        await transaction.query({
          name: 'tracker-mark-country-access-blocked',
          text: `update public.tracking_clicks set attribution_eligible=false, proxy_decision_snapshot=coalesce(proxy_decision_snapshot,'{}'::jsonb)||jsonb_build_object('countryAccess','blocked','countryCode',$3::text,'countryName',$4::text,'allowedCountries',$5::jsonb) where id=$1 and company_id=$2`,
          values: [
            trackingClickId,
            companyId,
            countryCode,
            countryName,
            JSON.stringify(allowedCountries),
          ],
        });
      });
    },
    async captureTrackingClick(input) {
      return database.transaction(async (transaction) => {
        const usesReferenceRoute =
          input.publisherPublicId !== undefined && input.offerPublicId !== undefined;

        if (!usesReferenceRoute && input.publicToken === undefined) {
          return undefined;
        }

        const result = await transaction.query<CapturedTrackingClickRow>({
          name: usesReferenceRoute
            ? 'tracking-link-resolver-capture-reference-click'
            : 'tracking-link-resolver-capture-token-click',
          text: usesReferenceRoute
            ? `
              select
                captured.tracking_click_id,
                captured.public_click_id,
                captured.tracking_link_id,
                captured.company_id,
                captured.offer_id,
                captured.network_account_id,
                captured.tracking_domain_id,
                captured.owner_membership_id,
                captured.destination_url,
                captured.query_parameters,
                private.resolve_effective_tracking_parameter(
                  captured.company_id,
                  captured.network_account_id
                ) as effective_tracking_parameter,
                captured.duplicate_decision,
                captured.fraud_risk_level,
                captured.fraud_signals,
                captured.attribution_eligible,
                captured.captured_at
              from public.capture_reference_tracking_click(
                $1,
                $2::bigint,
                $3::bigint,
                $4,
                $5::uuid,
                $6::public.visitor_identity_source,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14::jsonb
              ) as captured
              limit 1
            `
            : `
              select
                captured.tracking_click_id,
                captured.public_click_id,
                captured.tracking_link_id,
                captured.company_id,
                captured.offer_id,
                captured.network_account_id,
                captured.tracking_domain_id,
                captured.owner_membership_id,
                captured.destination_url,
                captured.query_parameters,
                private.resolve_effective_tracking_parameter(
                  captured.company_id,
                  captured.network_account_id
                ) as effective_tracking_parameter,
                captured.duplicate_decision,
                captured.fraud_risk_level,
                captured.fraud_signals,
                captured.attribution_eligible,
                captured.captured_at
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
              ) as captured
              limit 1
            `,
          values: usesReferenceRoute
            ? [
                input.hostname,
                input.publisherPublicId,
                input.offerPublicId,
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
              ]
            : [
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
