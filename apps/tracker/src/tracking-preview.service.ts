import type { InAppBrowserPolicyRepository } from './in-app-browser-policy.repository.js';
import type {
  PublicInAppBrowserPolicyRequest,
  ReferenceInAppBrowserPolicyRequest,
} from './in-app-browser-policy.types.js';
function normalizePreviewText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

export interface TrackingPreviewMetadata {
  readonly title: string;
  readonly imageUrl: string | null;
}
export interface TrackingPreviewService {
  readonly resolvePublicPreview: (
    input: PublicInAppBrowserPolicyRequest,
  ) => Promise<TrackingPreviewMetadata | undefined>;
  readonly resolveReferencePreview: (
    input: ReferenceInAppBrowserPolicyRequest,
  ) => Promise<TrackingPreviewMetadata | undefined>;
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
export function isTrackingPreviewCrawler(userAgent: string | undefined): boolean {
  if (userAgent === undefined || userAgent.trim().length === 0) {
    return false;
  }
  const ua = userAgent.toLowerCase();
  return [
    'facebookexternalhit',
    'facebot',
    'twitterbot',
    'linkedinbot',
    'slackbot',
    'discordbot',
    'telegrambot',
    'whatsapp',
    'skypeuripreview',
    'snap url preview service',
    'tiktokspider',
  ].some((signature) => ua.includes(signature));
}
export function createTrackingPreviewService(
  repository: InAppBrowserPolicyRepository,
): TrackingPreviewService {
  return Object.freeze<TrackingPreviewService>({
    async resolvePublicPreview(input) {
      const policy = await repository.findPublicPolicy(input);
      if (policy === undefined) {
        return undefined;
      }
      return Object.freeze({
        title: normalizePreviewText(policy.socialPreviewTitle) ?? policy.offerName,
        imageUrl:
          normalizePreviewText(policy.socialPreviewImageUrl) ??
          normalizePreviewText(policy.companyLogoUrl),
      });
    },
    async resolveReferencePreview(input) {
      if (
        !isValidReferencePublicId(input.publisherPublicId) ||
        !isValidReferencePublicId(input.offerPublicId)
      ) {
        return undefined;
      }
      const policy = await repository.findReferencePolicy(input);
      if (policy === undefined) {
        return undefined;
      }
      return Object.freeze({
        title: normalizePreviewText(policy.socialPreviewTitle) ?? policy.offerName,
        imageUrl:
          normalizePreviewText(policy.socialPreviewImageUrl) ??
          normalizePreviewText(policy.companyLogoUrl),
      });
    },
  });
}
