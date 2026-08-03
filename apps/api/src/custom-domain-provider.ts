export type CustomDomainProviderVerificationStatus = 'verified' | 'unverified';

export interface CustomDomainProviderRecord {
  readonly id: string;
  readonly name: string;
  readonly verificationStatus: CustomDomainProviderVerificationStatus;
}

export interface CustomDomainProvider {
  readonly name: 'render';
  readonly dnsTarget: string;

  create(hostname: string): Promise<CustomDomainProviderRecord>;

  retrieve(customDomainNameOrId: string): Promise<CustomDomainProviderRecord>;

  verify(customDomainNameOrId: string): Promise<void>;

  delete(customDomainNameOrId: string): Promise<void>;
}

export class CustomDomainProviderError extends Error {
  public readonly code: string;
  public readonly statusCode: number | null;

  public constructor(code: string, message: string, statusCode: number | null = null) {
    super(message);
    this.name = 'CustomDomainProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
