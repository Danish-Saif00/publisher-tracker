import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import { initializeRequestContext } from './request-context.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function resolveRequestId(value: unknown): string {
  if (typeof value !== 'string') {
    return randomUUID();
  }

  const normalizedValue = value.trim();

  if (!REQUEST_ID_PATTERN.test(normalizedValue)) {
    return randomUUID();
  }

  return normalizedValue;
}

export const requestIdMiddleware: RequestHandler = (request, response, next): void => {
  const requestId = resolveRequestId(request.headers['x-request-id']);

  initializeRequestContext(request, requestId);
  response.setHeader('x-request-id', requestId);

  next();
};
