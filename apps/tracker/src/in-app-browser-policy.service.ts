import type { InAppBrowserPolicyRepository } from './in-app-browser-policy.repository.js';
import type {
  InAppBrowserKind,
  InAppBrowserPreflightResult,
  PublicInAppBrowserPolicyRequest,
  ReferenceInAppBrowserPolicyRequest,
} from './in-app-browser-policy.types.js';
export interface InAppBrowserPolicyService {
  readonly evaluatePublicRequest: (
    input: PublicInAppBrowserPolicyRequest,
    userAgent: string | undefined,
  ) => Promise<InAppBrowserPreflightResult>;
  readonly evaluateReferenceRequest: (
    input: ReferenceInAppBrowserPolicyRequest,
    userAgent: string | undefined,
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
export function detectInAppBrowser(userAgent: string | undefined): InAppBrowserKind | null {
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
    async evaluatePublicRequest(input, userAgent) {
      const detectedBrowser = detectInAppBrowser(userAgent);
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
    async evaluateReferenceRequest(input, userAgent) {
      const detectedBrowser = detectInAppBrowser(userAgent);
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
