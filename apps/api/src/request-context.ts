import type { Request } from 'express';

import type { ResolvedApiIdentity } from './identity-resolver.js';

export interface ApiRequestContext {
  readonly requestId: string;
  readonly identity?: ResolvedApiIdentity;
}

const requestContexts = new WeakMap<Request, ApiRequestContext>();

export function initializeRequestContext(request: Request, requestId: string): void {
  requestContexts.set(
    request,
    Object.freeze({
      requestId,
    }),
  );
}

export function getRequestContext(request: Request): ApiRequestContext {
  const context = requestContexts.get(request);

  if (context === undefined) {
    throw new Error('API request context has not been initialized.');
  }

  return context;
}

export function getRequestId(request: Request): string | undefined {
  return requestContexts.get(request)?.requestId;
}

export function attachResolvedIdentity(request: Request, identity: ResolvedApiIdentity): void {
  const context = getRequestContext(request);

  requestContexts.set(
    request,
    Object.freeze({
      ...context,
      identity,
    }),
  );
}

export function getResolvedIdentity(request: Request): ResolvedApiIdentity {
  const identity = getRequestContext(request).identity;

  if (identity === undefined) {
    throw new Error('Authenticated API identity is unavailable.');
  }

  return identity;
}
