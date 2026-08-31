export type InAppBrowserKind =
  'snapchat' | 'instagram' | 'facebook' | 'messenger' | 'discord' | 'telegram' | 'tiktok' | 'other';
export interface InAppBrowserPolicyRecord {
  readonly offerName: string;
  readonly socialPreviewTitle: string | null;
  readonly socialPreviewImageUrl: string | null;
  readonly companyLogoUrl: string | null;
  readonly blockedInAppBrowsers: readonly InAppBrowserKind[];
}
export interface InAppBrowserRequestContext {
  readonly userAgent: string | undefined;
  readonly secFetchSite: string | undefined;
  readonly secFetchMode: string | undefined;
  readonly secFetchDest: string | undefined;
  readonly secFetchUser: string | undefined;
  readonly secChUaMobile: string | undefined;
  readonly secChUaPlatform: string | undefined;
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
