export type InAppBrowserKind =
  'snapchat' | 'instagram' | 'facebook' | 'messenger' | 'discord' | 'telegram' | 'tiktok' | 'other';
export interface InAppBrowserPolicyRecord {
  readonly offerName: string;
  readonly blockedInAppBrowsers: readonly InAppBrowserKind[];
}
export interface PublicInAppBrowserPolicyRequest {
  readonly hostname: string;
  readonly publicToken: string;
}
export interface ReferenceInAppBrowserPolicyRequest {
  readonly hostname: string;
  readonly publisherPublicId: string;
  readonly offerPublicId: string;
}
export interface InAppBrowserPreflightResult {
  readonly detectedBrowser: InAppBrowserKind | null;
  readonly blocked: boolean;
  readonly offerName: string | null;
}
