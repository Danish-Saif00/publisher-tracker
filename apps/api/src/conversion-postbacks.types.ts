export type NetworkPostbackEndpointStatus = 'active' | 'paused' | 'archived';

export type ConversionStatus = 'pending' | 'approved' | 'rejected' | 'reversed';

export type ConversionSource = 'provider_postback' | 'manual';

export type ConversionPayoutMode = 'fixed_member' | 'per_offer';

export interface ConversionPostbackCompanyRecord {
  readonly id: string;
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface ConversionPostbackNetworkAccountRecord {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly status: 'active' | 'suspended' | 'archived';
}

export interface NetworkPostbackEndpointRecord {
  readonly id: string;
  readonly companyId: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly name: string;
  readonly endpointKeyLast4: string;
  readonly status: NetworkPostbackEndpointStatus;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NetworkPostbackEndpointSecretRecord {
  readonly endpoint: NetworkPostbackEndpointRecord;
  readonly endpointKey: string;
}

export interface ConversionRecord {
  readonly id: string;
  readonly publicConversionId: string;
  readonly companyId: string;
  readonly trackingClickId: string;
  readonly publicClickId: string;
  readonly trackingLinkId: string;
  readonly offerId: string;
  readonly offerCode: string;
  readonly offerName: string;
  readonly networkAccountId: string;
  readonly networkAccountName: string;
  readonly ownerMembershipId: string;
  readonly ownerUserId: string;
  readonly offerAssignmentId: string;
  readonly postbackEndpointId: string | null;
  readonly postbackEndpointName: string | null;
  readonly externalConversionId: string;
  readonly source: ConversionSource;
  readonly status: ConversionStatus;
  readonly revenueAmountMinor: number | null;
  readonly revenueCurrency: string | null;
  readonly payoutMode: ConversionPayoutMode;
  readonly payoutAmountMinor: number;
  readonly payoutCurrency: string;
  readonly convertedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateNetworkPostbackEndpointInput {
  readonly name: string;
  readonly status?: Extract<NetworkPostbackEndpointStatus, 'active' | 'paused'>;
}

export interface UpdateNetworkPostbackEndpointInput {
  readonly name?: string;
  readonly status?: NetworkPostbackEndpointStatus;
}

export interface ListNetworkPostbackEndpointsInput {
  readonly status?: NetworkPostbackEndpointStatus;
}

export interface ListConversionsInput {
  readonly networkAccountId?: string;
  readonly offerId?: string;
  readonly ownerMembershipId?: string;
  readonly status?: ConversionStatus;
  readonly limit?: number;
}

export interface ConversionPostbacksRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface NetworkPostbackEndpointWriteInput {
  readonly name: string;
  readonly endpointKeyHash: string | null;
  readonly endpointKeyLast4: string | null;
  readonly status: NetworkPostbackEndpointStatus;
}

export interface ListConversionsRepositoryInput extends ListConversionsInput {
  readonly visibleToUserId?: string;
  readonly limit: number;
}
