export type PublicPostbackConversionStatus = 'pending' | 'approved' | 'rejected' | 'reversed';

export interface IngestNetworkPostbackInput {
  readonly endpointKey: string;
  readonly publicClickId: string;
  readonly externalConversionId: string;
  readonly idempotencyKey: string;
  readonly status: PublicPostbackConversionStatus;
  readonly revenueAmountMinor: number | null;
  readonly revenueCurrency: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface IngestedNetworkPostbackRecord {
  readonly conversionId: string;
  readonly publicConversionId: string;
  readonly status: PublicPostbackConversionStatus;
  readonly payoutMode: 'fixed_member' | 'per_offer';
  readonly payoutAmountMinor: number;
  readonly payoutCurrency: string;
  readonly wasIdempotent: boolean;
  readonly processedAt: string;
}

export interface NetworkPostbackResponse {
  readonly publicConversionId: string;
  readonly status: PublicPostbackConversionStatus;
  readonly wasIdempotent: boolean;
}
