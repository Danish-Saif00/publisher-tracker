export type TrackingDomainStatus =
  | 'pending_verification'
  | 'active'
  | 'suspended'
  | 'archived';

export type NetworkProviderStatus = 'active' | 'archived';

export type NetworkAccountStatus = 'active' | 'suspended' | 'archived';

export type TrackingModuleLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'forbidden';

export type TrackingDomain = {
  id: string;
  companyId: string;
  hostname: string;
  status: TrackingDomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  isPrimary: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NetworkProvider = {
  id: string;
  code: string;
  name: string;
  status: NetworkProviderStatus;
  websiteUrl: string | null;
  documentationUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NetworkAccount = {
  id: string;
  companyId: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  name: string;
  externalAccountId: string | null;
  status: NetworkAccountStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTrackingDomainInput = {
  hostname: string;
};

export type UpdateTrackingDomainInput = {
  domainId: string;
  hostname?: string;
  status?: 'suspended' | 'archived';
  isPrimary?: boolean;
};

export type UpdatePlatformTrackingDomainStatusInput = {
  domainId: string;
  status: 'active' | 'suspended' | 'archived';
};

export type CreateNetworkProviderInput = {
  code: string;
  name: string;
  websiteUrl?: string | null;
  documentationUrl?: string | null;
};

export type UpdateNetworkProviderInput = {
  providerId: string;
  name?: string;
  status?: NetworkProviderStatus;
  websiteUrl?: string | null;
  documentationUrl?: string | null;
};

export type CreateNetworkAccountInput = {
  providerId: string;
  name: string;
  externalAccountId?: string | null;
};

export type UpdateNetworkAccountInput = {
  accountId: string;
  name?: string;
  externalAccountId?: string | null;
  status?: NetworkAccountStatus;
};
