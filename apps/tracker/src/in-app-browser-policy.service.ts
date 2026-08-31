import type { InAppBrowserPolicyRepository } from './in-app-browser-policy.repository.js';
import type {
  InAppBrowserKind,
  InAppBrowserPreflightResult,
  InAppBrowserRequestContext,
  PublicInAppBrowserPolicyRequest,
  ReferenceInAppBrowserPolicyRequest,
} from './in-app-browser-policy.types.js';
export interface InAppBrowserPolicyService {
  readonly evaluatePublicRequest: (
    input: PublicInAppBrowserPolicyRequest,
    requestContext: InAppBrowserRequestContext,
  ) => Promise<InAppBrowserPreflightResult>;
  readonly evaluateReferenceRequest: (
    input: ReferenceInAppBrowserPolicyRequest,
    requestContext: InAppBrowserRequestContext,
  ) => Promise<InAppBrowserPreflightResult>;
}
const MAX_BIGINT_PUBLIC_ID = BigInt('9223372036854775807');
function isValidReferencePublicId(value: string): boolean {
  const normalized = value.trim();
  if (!/^[0-9]{1,19}$/u.test(normalized)) {
    return false;
  }
  try {
    const parsed = BigInt(normalized);
    return parsed > BigInt(0) && parsed <= MAX_BIGINT_PUBLIC_ID;
  } catch {
    return false;
  }
}
function isAndroidChromeCustomTabNavigation(
  input: InAppBrowserRequestContext,
  normalizedUserAgent: string,
): boolean {
  const mobileChrome =
    normalizedUserAgent.includes('android') &&
    normalizedUserAgent.includes('chrome/') &&
    normalizedUserAgent.includes('mobile safari/') &&
    !normalizedUserAgent.includes('; wv)') &&
    !normalizedUserAgent.includes('version/4.0');
  if (!mobileChrome) {
    return false;
  }
  const secFetchSite = input.secFetchSite?.trim().toLowerCase();
  const secFetchMode = input.secFetchMode?.trim().toLowerCase();
  const secFetchDest = input.secFetchDest?.trim().toLowerCase();
  const secFetchUser = input.secFetchUser?.trim().toLowerCase();
  const secChUaMobile = input.secChUaMobile?.trim();
  const secChUaPlatform = input.secChUaPlatform?.trim().toLowerCase();
  return (
    secFetchSite === 'cross-site' &&
    secFetchMode === 'navigate' &&
    secFetchDest === 'document' &&
    (secFetchUser === undefined || secFetchUser.length === 0) &&
    secChUaMobile === '?1' &&
    secChUaPlatform?.includes('android') === true
  );
}
export function detectInAppBrowser(
  input: InAppBrowserRequestContext,
): InAppBrowserKind | null {
  const userAgent = input.userAgent;
  if (userAgent === undefined || userAgent.trim().length === 0) {
    return null;
  }
  const ua = userAgent.toLowerCase();
  if (ua.includes('instagram')) {
    return 'instagram';
  }
  if (ua.includes('fban/messenger') || (ua.includes('fbav') && ua.includes('messenger'))) {
    return 'messenger';
  }
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) {
    return 'facebook';
  }
  if (ua.includes('snapchat') || ua.includes('snapkit')) {
    return 'snapchat';
  }
  if (ua.includes('discord')) {
    return 'discord';
  }
  if (ua.includes('telegram')) {
    return 'telegram';
  }
  if (ua.includes('tiktok') || ua.includes('musical_ly') || ua.includes('bytedancewebview')) {
    return 'tiktok';
  }
  const androidWebView =
    ua.includes('; wv)') ||
    (ua.includes('version/4.0') && ua.includes('chrome/') && ua.includes('mobile safari/'));
  if (androidWebView) {
    return 'other';
  }
  if (isAndroidChromeCustomTabNavigation(input, ua)) {
    return 'other';
  }
  return null;
}
function createResult(
  detectedBrowser: InAppBrowserKind | null,
  offerName: string | null,
  blockedBrowsers: readonly InAppBrowserKind[],
): InAppBrowserPreflightResult {
  return Object.freeze({
    detectedBrowser,
    blocked: detectedBrowser !== null && blockedBrowsers.includes(detectedBrowser),
    offerName,
  });
}
export function createInAppBrowserPolicyService(
  repository: InAppBrowserPolicyRepository,
): InAppBrowserPolicyService {
  return Object.freeze<InAppBrowserPolicyService>({
    async evaluatePublicRequest(input, requestContext) {
      const detectedBrowser = detectInAppBrowser(requestContext);
      if (detectedBrowser === null) {
        return createResult(null, null, []);
      }
      const policy = await repository.findPublicPolicy(input);
      return createResult(
        detectedBrowser,
        policy?.offerName ?? null,
        policy?.blockedInAppBrowsers ?? [],
      );
    },
    async evaluateReferenceRequest(input, requestContext) {
      const detectedBrowser = detectInAppBrowser(requestContext);
      if (detectedBrowser === null) {
        return createResult(null, null, []);
      }
      if (
        !isValidReferencePublicId(input.publisherPublicId) ||
        !isValidReferencePublicId(input.offerPublicId)
      ) {
        return createResult(detectedBrowser, null, []);
      }
      const policy = await repository.findReferencePolicy(input);
      return createResult(
        detectedBrowser,
        policy?.offerName ?? null,
        policy?.blockedInAppBrowsers ?? [],
      );
    },
  });
}
