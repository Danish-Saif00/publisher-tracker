import { randomUUID } from 'node:crypto';

import type { RequestHandler, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RESPONSE_REQUEST_IDS = new WeakMap<Response, string>();

function resolveRequestId(value: unknown): string {
  if (typeof value !== 'string') {
    return randomUUID();
  }

  const normalizedValue = value.trim();

  return REQUEST_ID_PATTERN.test(normalizedValue) ? normalizedValue : randomUUID();
}

export const trackerRequestIdMiddleware: RequestHandler = (request, response, next): void => {
  const requestId = resolveRequestId(request.headers['x-request-id']);

  RESPONSE_REQUEST_IDS.set(response, requestId);
  response.setHeader('x-request-id', requestId);

  next();
};

export function getTrackerRequestId(response: Response): string {
  return RESPONSE_REQUEST_IDS.get(response) ?? 'unavailable';
}
