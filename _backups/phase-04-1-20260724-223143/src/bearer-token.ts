import { AuthenticationError } from './auth.errors.js';

export type AuthorizationHeaderValue = string | readonly string[] | undefined;

export function extractBearerToken(authorizationHeader: AuthorizationHeaderValue): string {
  if (authorizationHeader === undefined) {
    throw new AuthenticationError(
      'AUTHORIZATION_HEADER_MISSING',
      'Authorization header is required.',
    );
  }

  if (typeof authorizationHeader !== 'string') {
    throw new AuthenticationError(
      'AUTHORIZATION_HEADER_INVALID',
      'Authorization header must contain one Bearer token.',
    );
  }

  const normalizedHeader = authorizationHeader.trim();

  if (normalizedHeader.length === 0) {
    throw new AuthenticationError(
      'AUTHORIZATION_HEADER_MISSING',
      'Authorization header is required.',
    );
  }

  const bearerMatch = /^Bearer[ \t]+(\S+)$/i.exec(normalizedHeader);
  const accessToken = bearerMatch?.[1];

  if (accessToken === undefined || accessToken.length === 0) {
    throw new AuthenticationError(
      'AUTHORIZATION_HEADER_INVALID',
      'Authorization header must use the Bearer authentication scheme.',
    );
  }

  return accessToken;
}
