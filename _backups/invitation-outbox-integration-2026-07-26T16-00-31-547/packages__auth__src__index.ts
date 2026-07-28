export {
  AuthenticationConfigurationError,
  AuthenticationError,
  AuthorizationError,
} from './auth.errors.js';

export {
  assertCompanyAccess,
  assertCompanyRole,
  assertPlatformSuperAdmin,
  hasCompanyAccess,
  hasCompanyRole,
  isPlatformSuperAdmin,
} from './authorization.js';

export { extractBearerToken } from './bearer-token.js';

export { createSupabaseAccessTokenVerifier } from './supabase-token-verifier.js';

export { createSupabaseUserInvitationGateway } from './supabase-user-invitations.js';

export type {
  AuthenticationErrorCode,
  AuthenticationErrorOptions,
  AuthorizationErrorCode,
  AuthorizationErrorOptions,
} from './auth.errors.js';

export type { AuthorizationHeaderValue } from './bearer-token.js';

export type {
  AccessTokenVerifier,
  CreateSupabaseAccessTokenVerifierOptions,
} from './supabase-token-verifier.js';

export type {
  CreateSupabaseUserInvitationGatewayOptions,
  InviteNewSupabaseUserInput,
  SendExistingSupabaseUserLinkInput,
  SupabaseUserInvitationGateway,
} from './supabase-user-invitations.js';
