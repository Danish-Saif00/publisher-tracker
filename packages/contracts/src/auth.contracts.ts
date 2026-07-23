export const AUTHENTICATED_POSTGRES_ROLE = 'authenticated' as const;

export const AUTHENTICATOR_ASSURANCE_LEVELS = ['aal1', 'aal2'] as const;

export const PLATFORM_ROLES = ['platform_super_admin'] as const;

export const COMPANY_ROLES = ['company_admin', 'manager', 'publisher'] as const;

export const COMPANY_MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'revoked'] as const;

export type AuthenticatedPostgresRole = typeof AUTHENTICATED_POSTGRES_ROLE;

export type AuthenticatorAssuranceLevel = (typeof AUTHENTICATOR_ASSURANCE_LEVELS)[number];

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type CompanyRole = (typeof COMPANY_ROLES)[number];

export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];

export type JsonObject = Readonly<Record<string, unknown>>;

export interface AuthenticatedActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: AuthenticatedPostgresRole;
  readonly assuranceLevel: AuthenticatorAssuranceLevel;
  readonly isAnonymous: boolean;
  readonly issuer: string;
  readonly audience: readonly string[];
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly email?: string;
  readonly phone?: string;
  readonly appMetadata: JsonObject;
  readonly userMetadata: JsonObject;
}

export interface AuthorizationSubject {
  readonly userId: string;
  readonly platformRole?: PlatformRole;
}

export interface CompanyMembershipIdentity {
  readonly membershipId: string;
  readonly companyId: string;
  readonly userId: string;
  readonly role: CompanyRole;
  readonly status: CompanyMembershipStatus;
}

export interface RequestIdentity {
  readonly requestId: string;
  readonly actor: AuthenticatedActor;
  readonly companyMembership?: CompanyMembershipIdentity;
}
