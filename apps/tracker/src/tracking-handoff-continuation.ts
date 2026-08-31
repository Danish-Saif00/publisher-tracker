import { createHmac, timingSafeEqual } from 'node:crypto';
export const TRACKING_HANDOFF_CONTINUATION_QUERY_PARAMETER = '__tracker_handoff';
const TRACKING_HANDOFF_CONTINUATION_VERSION = 'v1';
const TRACKING_HANDOFF_CONTINUATION_TTL_SECONDS = 30 * 60;
function deriveSigningKey(signingSecret: string): Buffer {
  return createHmac('sha256', signingSecret)
    .update('affiliate-tracker:tracking-handoff:v1:key')
    .digest();
}
function normalizeTrackingUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = '';
  url.searchParams.delete(TRACKING_HANDOFF_CONTINUATION_QUERY_PARAMETER);
  return url.toString();
}
function createSignature(
  canonicalUrl: string,
  expiresAtSeconds: number,
  signingSecret: string,
): Buffer {
  const signingKey = deriveSigningKey(signingSecret);
  return createHmac('sha256', signingKey)
    .update(
      [
        'affiliate-tracker:tracking-handoff',
        TRACKING_HANDOFF_CONTINUATION_VERSION,
        String(expiresAtSeconds),
        canonicalUrl,
      ].join('\n'),
    )
    .digest();
}
export function stripTrackingHandoffContinuationFromUrl(rawUrl: string): string {
  return normalizeTrackingUrl(rawUrl);
}
export function createTrackingHandoffContinuationUrl(
  canonicalUrl: string,
  signingSecret: string,
  nowMilliseconds = Date.now(),
): string {
  const normalizedUrl = normalizeTrackingUrl(canonicalUrl);
  const expiresAtSeconds =
    Math.floor(nowMilliseconds / 1000) + TRACKING_HANDOFF_CONTINUATION_TTL_SECONDS;
  const signature = createSignature(normalizedUrl, expiresAtSeconds, signingSecret).toString(
    'base64url',
  );
  const continuationUrl = new URL(normalizedUrl);
  continuationUrl.searchParams.set(
    TRACKING_HANDOFF_CONTINUATION_QUERY_PARAMETER,
    [TRACKING_HANDOFF_CONTINUATION_VERSION, String(expiresAtSeconds), signature].join('.'),
  );
  return continuationUrl.toString();
}
export function verifyTrackingHandoffContinuationUrl(
  requestUrl: string,
  signingSecret: string,
  nowMilliseconds = Date.now(),
): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    return false;
  }
  const rawToken = parsedUrl.searchParams.get(TRACKING_HANDOFF_CONTINUATION_QUERY_PARAMETER);
  if (rawToken === null) {
    return false;
  }
  const tokenParts = rawToken.split('.');
  if (tokenParts.length !== 3) {
    return false;
  }
  const [version, rawExpiresAtSeconds, rawSignature] = tokenParts;
  if (
    version !== TRACKING_HANDOFF_CONTINUATION_VERSION ||
    rawExpiresAtSeconds === undefined ||
    rawSignature === undefined ||
    !/^[0-9]+$/u.test(rawExpiresAtSeconds)
  ) {
    return false;
  }
  const expiresAtSeconds = Number(rawExpiresAtSeconds);
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds < nowSeconds) {
    return false;
  }
  parsedUrl.hash = '';
  parsedUrl.searchParams.delete(TRACKING_HANDOFF_CONTINUATION_QUERY_PARAMETER);
  const canonicalUrl = parsedUrl.toString();
  const expectedSignature = createSignature(canonicalUrl, expiresAtSeconds, signingSecret);
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(rawSignature, 'base64url');
  } catch {
    return false;
  }
  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }
  return timingSafeEqual(providedSignature, expectedSignature);
}
