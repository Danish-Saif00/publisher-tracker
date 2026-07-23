import type { DatabaseRuntime } from '@affiliate-tracker/database';

import type {
  IngestedNetworkPostbackRecord,
  PublicPostbackConversionStatus,
} from './network-postback.types.js';

type IngestedNetworkPostbackRow = Readonly<{
  conversion_id: string;
  public_conversion_id: string;
  conversion_status: string;
  payout_mode: string;
  payout_amount_minor: number | string;
  payout_currency: string;
  was_idempotent: boolean;
  processed_at: Date | string;
}> &
  Record<string, unknown>;

export interface IngestNetworkPostbackRepositoryInput {
  readonly endpointKeyHash: string;
  readonly publicClickId: string;
  readonly externalConversionId: string;
  readonly idempotencyKey: string;
  readonly status: PublicPostbackConversionStatus;
  readonly revenueAmountMinor: number | null;
  readonly revenueCurrency: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface NetworkPostbackRepository {
  ingestPostback(
    input: IngestNetworkPostbackRepositoryInput,
  ): Promise<IngestedNetworkPostbackRecord | undefined>;
}

function normalizeSafeInteger(value: number | string, columnName: string): number {
  const normalizedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(normalizedValue)) {
    throw new Error(`The database returned an invalid ${columnName} value.`);
  }

  return normalizedValue;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid postback timestamp.');
  }

  return date.toISOString();
}

function parseStatus(value: string): PublicPostbackConversionStatus {
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

function parsePayoutMode(value: string): IngestedNetworkPostbackRecord['payoutMode'] {
  if (value === 'fixed_member' || value === 'per_offer') {
    return value;
  }

  throw new Error('The database returned an unsupported payout mode.');
}

function mapRow(row: IngestedNetworkPostbackRow): IngestedNetworkPostbackRecord {
  return Object.freeze({
    conversionId: row.conversion_id,
    publicConversionId: row.public_conversion_id,
    status: parseStatus(row.conversion_status),
    payoutMode: parsePayoutMode(row.payout_mode),
    payoutAmountMinor: normalizeSafeInteger(row.payout_amount_minor, 'payout_amount_minor'),
    payoutCurrency: row.payout_currency,
    wasIdempotent: row.was_idempotent,
    processedAt: normalizeTimestamp(row.processed_at),
  });
}

export function createNetworkPostbackRepository(
  database: DatabaseRuntime,
): NetworkPostbackRepository {
  return Object.freeze<NetworkPostbackRepository>({
    async ingestPostback(input) {
      const result = await database.query<IngestedNetworkPostbackRow>({
        name: 'network-postback-ingest',
        text: `
          select
            conversion_id,
            public_conversion_id,
            conversion_status,
            payout_mode,
            payout_amount_minor,
            payout_currency,
            was_idempotent,
            processed_at
          from public.ingest_public_network_postback(
            $1,
            $2,
            $3,
            $4,
            $5::public.conversion_status,
            $6,
            $7,
            $8::jsonb
          )
          limit 1
        `,
        values: [
          input.endpointKeyHash,
          input.publicClickId,
          input.externalConversionId,
          input.idempotencyKey,
          input.status,
          input.revenueAmountMinor,
          input.revenueCurrency,
          JSON.stringify(input.payload),
        ],
      });

      const row = result.rows[0];

      return row === undefined ? undefined : mapRow(row);
    },
  });
}
