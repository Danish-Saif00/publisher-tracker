import {
  AUTHENTICATED_POSTGRES_ROLE,
  type AuthenticatedActor,
  type AuthenticatorAssuranceLevel,
  type JsonObject,
} from '@affiliate-tracker/contracts';
import { createClient } from '@supabase/supabase-js';

import { AuthenticationConfigurationError, AuthenticationError } from './auth.errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_EXPECTED_AUDIENCE = 'authenticated';

export interface CreateSupabaseAccessTokenVerifierOptions {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly expectedAudience?: string;
}

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AuthenticatedActor>;
}

interface NormalizedSupabaseEndpoint {
  readonly baseUrl: string;
  readonly issuer: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createClaimsError(message: string): AuthenticationError {
  return new AuthenticationError('ACCESS_TOKEN_CLAIMS_INVALID', message);
}

function readRequiredString(claims: Record<string, unknown>, claimName: string): string {
  const value = claims[claimName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createClaimsError(`Access token claim "${claimName}" must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalString(
  claims: Record<string, unknown>,
  claimName: string,
): string | undefined {
  const value = claims[claimName];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw createClaimsError(`Access token claim "${claimName}" must be a string when provided.`);
  }

  const normalizedValue = value.trim();

  return normalizedValue.length === 0 ? undefined : normalizedValue;
}

function readRequiredNumber(claims: Record<string, unknown>, claimName: string): number {
  const value = claims[claimName];

  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw createClaimsError(`Access token claim "${claimName}" must be an integer.`);
  }

  return value;
}

function readRequiredBoolean(claims: Record<string, unknown>, claimName: string): boolean {
  const value = claims[claimName];

  if (typeof value !== 'boolean') {
    throw createClaimsError(`Access token claim "${claimName}" must be a boolean.`);
  }

  return value;
}

function readAudience(claims: Record<string, unknown>): readonly string[] {
  const audience = claims['aud'];

  if (typeof audience === 'string') {
    const normalizedAudience = audience.trim();

    if (normalizedAudience.length === 0) {
      throw createClaimsError('Access token audience cannot be empty.');
    }

    return Object.freeze([normalizedAudience]);
  }

  if (!Array.isArray(audience) || audience.length === 0) {
    throw createClaimsError('Access token audience must be a string or a non-empty string array.');
  }

  const normalizedAudience = audience.map((value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw createClaimsError('Every access token audience value must be a non-empty string.');
    }

    return value.trim();
  });

  return Object.freeze(normalizedAudience);
}

function readJsonObject(claims: Record<string, unknown>, claimName: string): JsonObject {
  const value = claims[claimName];

  if (value === undefined || value === null) {
    return Object.freeze({});
  }

  if (!isRecord(value)) {
    throw createClaimsError(`Access token claim "${claimName}" must be an object when provided.`);
  }

  return Object.freeze({
    ...value,
  });
}

function assertUuid(value: string, claimName: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw createClaimsError(`Access token claim "${claimName}" must be a valid UUID.`);
  }
}

function readAssuranceLevel(claims: Record<string, unknown>): AuthenticatorAssuranceLevel {
  const assuranceLevel = readRequiredString(claims, 'aal');

  if (assuranceLevel !== 'aal1' && assuranceLevel !== 'aal2') {
    throw createClaimsError('Access token assurance level must be aal1 or aal2.');
  }

  return assuranceLevel;
}

function normalizeRequiredConfigurationValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new AuthenticationConfigurationError(`${fieldName} cannot be empty.`);
  }

  return normalizedValue;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function normalizeSupabaseEndpoint(value: string): NormalizedSupabaseEndpoint {
  const normalizedValue = normalizeRequiredConfigurationValue(value, 'Supabase URL');

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch (error: unknown) {
    throw new AuthenticationConfigurationError('Supabase URL must be a valid absolute URL.', {
      cause: error,
    });
  }

  const isSecureProtocol = parsedUrl.protocol === 'https:';
  const isLocalDevelopmentUrl =
    parsedUrl.protocol === 'http:' && isLocalHostname(parsedUrl.hostname);

  if (!isSecureProtocol && !isLocalDevelopmentUrl) {
    throw new AuthenticationConfigurationError(
      'Supabase URL must use HTTPS except for localhost development.',
    );
  }

  if (
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0 ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0
  ) {
    throw new AuthenticationConfigurationError(
      'Supabase URL cannot contain credentials, query parameters, or a fragment.',
    );
  }

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '').replace(/^\/$/, '');

  const baseUrl = `${parsedUrl.origin}${normalizedPath}`;

  if (baseUrl.endsWith('/auth/v1')) {
    throw new AuthenticationConfigurationError(
      'Supabase URL must be the project base URL, not the Auth endpoint.',
    );
  }

  return Object.freeze({
    baseUrl,
    issuer: `${baseUrl}/auth/v1`,
  });
}

function createAuthenticatedActor(
  claimsValue: unknown,
  expectedIssuer: string,
  expectedAudience: string,
): AuthenticatedActor {
  if (!isRecord(claimsValue)) {
    throw createClaimsError('Verified access token claims are missing.');
  }

  const issuer = readRequiredString(claimsValue, 'iss');

  if (issuer !== expectedIssuer) {
    throw new AuthenticationError(
      'ACCESS_TOKEN_ISSUER_INVALID',
      'Access token issuer is not trusted.',
    );
  }

  const audience = readAudience(claimsValue);

  if (!audience.includes(expectedAudience)) {
    throw new AuthenticationError(
      'ACCESS_TOKEN_AUDIENCE_INVALID',
      'Access token audience is not accepted.',
    );
  }

  const role = readRequiredString(claimsValue, 'role');

  if (role !== AUTHENTICATED_POSTGRES_ROLE) {
    throw new AuthenticationError(
      'ACCESS_TOKEN_ROLE_INVALID',
      'Only authenticated user access tokens are accepted.',
    );
  }

  const userId = readRequiredString(claimsValue, 'sub');
  const sessionId = readRequiredString(claimsValue, 'session_id');

  assertUuid(userId, 'sub');
  assertUuid(sessionId, 'session_id');

  const issuedAt = readRequiredNumber(claimsValue, 'iat');
  const expiresAt = readRequiredNumber(claimsValue, 'exp');

  if (expiresAt <= issuedAt) {
    throw createClaimsError('Access token expiration must be later than its issue time.');
  }

  const email = readOptionalString(claimsValue, 'email');
  const phone = readOptionalString(claimsValue, 'phone');

  return Object.freeze({
    userId,
    sessionId,
    role: AUTHENTICATED_POSTGRES_ROLE,
    assuranceLevel: readAssuranceLevel(claimsValue),
    isAnonymous: readRequiredBoolean(claimsValue, 'is_anonymous'),
    issuer,
    audience,
    issuedAt,
    expiresAt,
    ...(email !== undefined
      ? {
          email,
        }
      : {}),
    ...(phone !== undefined
      ? {
          phone,
        }
      : {}),
    appMetadata: readJsonObject(claimsValue, 'app_metadata'),
    userMetadata: readJsonObject(claimsValue, 'user_metadata'),
  });
}

export function createSupabaseAccessTokenVerifier(
  options: CreateSupabaseAccessTokenVerifierOptions,
): AccessTokenVerifier {
  const endpoint = normalizeSupabaseEndpoint(options.supabaseUrl);
  const publishableKey = normalizeRequiredConfigurationValue(
    options.publishableKey,
    'Supabase publishable key',
  );
  const expectedAudience = normalizeRequiredConfigurationValue(
    options.expectedAudience ?? DEFAULT_EXPECTED_AUDIENCE,
    'Expected JWT audience',
  );

  const supabase = createClient(endpoint.baseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return Object.freeze({
    async verify(accessTokenValue: string): Promise<AuthenticatedActor> {
      const accessToken = normalizeRequiredConfigurationValue(accessTokenValue, 'Access token');

      try {
        const { data, error } = await supabase.auth.getClaims(accessToken);

        if (error !== null) {
          throw new AuthenticationError(
            'ACCESS_TOKEN_INVALID',
            'Access token verification failed.',
            {
              cause: error,
            },
          );
        }

        return createAuthenticatedActor(data?.claims, endpoint.issuer, expectedAudience);
      } catch (error: unknown) {
        if (error instanceof AuthenticationError) {
          throw error;
        }

        throw new AuthenticationError('ACCESS_TOKEN_INVALID', 'Access token verification failed.', {
          cause: error,
        });
      }
    },
  });
}
