import { extractBearerToken, type AccessTokenVerifier } from '@affiliate-tracker/auth';
import type { RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import type { ApiIdentityResolver } from './identity-resolver.js';
import { attachResolvedIdentity, getRequestContext } from './request-context.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateAuthenticationMiddlewareOptions {
  readonly tokenVerifier: AccessTokenVerifier;
  readonly identityResolver: ApiIdentityResolver;
}

function readRequestedCompanyId(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_COMPANY_ID',
      400,
      'The x-company-id header must contain one valid UUID.',
    );
  }

  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError(
      'INVALID_COMPANY_ID',
      400,
      'The x-company-id header must contain a valid UUID.',
    );
  }

  return normalizedValue;
}

export function createAuthenticationMiddleware(
  options: CreateAuthenticationMiddlewareOptions,
): RequestHandler {
  return (request, _response, next): void => {
    void (async (): Promise<void> => {
      const context = getRequestContext(request);
      const accessToken = extractBearerToken(request.headers.authorization);
      const actor = await options.tokenVerifier.verify(accessToken);
      const requestedCompanyId = readRequestedCompanyId(request.headers['x-company-id']);

      const identity = await options.identityResolver.resolve({
        actor,
        requestId: context.requestId,
        ...(requestedCompanyId !== undefined
          ? {
              requestedCompanyId,
            }
          : {}),
      });

      attachResolvedIdentity(request, identity);
      next();
    })().catch(next);
  };
}
