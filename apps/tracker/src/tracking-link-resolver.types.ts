import type { ProxyDetectionOutcome } from './proxy-detection.runtime.js';
import type { VisitorIdentitySource } from './visitor-identity.types.js';

export type PublicTrackingLinkQueryParameters = Readonly<Record<string, string>>;
export type TrackingAttributionParameters = Readonly<Record<string, string>>;

export interface CaptureTrackingClickInput {
  readonly hostname: string;
  readonly publicToken?: string;
  readonly publisherPublicId?: number;
  readonly offerPublicId?: number;
  readonly publicClickId: string;
  readonly visitorId: string;
  readonly visitorIdentitySource: VisitorIdentitySource;
  readonly ipHash: string;
  readonly userAgent: string | null;
  readonly userAgentHash: string;
  readonly visitorFingerprint: string;
  readonly referrerUrl: string | null;
  readonly referrerHostname: string | null;
  readonly requestPath: string;
  readonly attribution: TrackingAttributionParameters;
}

export interface CapturedTrackingClickRecord {
  readonly trackingClickId: string;
  readonly publicClickId: string;
  readonly trackingLinkId: string;
  readonly companyId: string;
  readonly offerId: string;
  readonly networkAccountId: string;
  readonly trackingDomainId: string;
  readonly ownerMembershipId: string;
  readonly destinationUrl: string;
  readonly queryParameters: PublicTrackingLinkQueryParameters;
  readonly effectiveTrackingParameter: string;
  readonly duplicateDecision: 'accepted' | 'duplicate';
  readonly fraudRiskLevel: 'low' | 'medium' | 'high';
  readonly fraudSignals: readonly string[];
  readonly attributionEligible: boolean;
  readonly capturedAt: string;
}

export interface TrackingRedirectRequest {
  readonly hostname: string;
  readonly publicToken?: string;
  readonly publisherPublicId?: string;
  readonly offerPublicId?: string;
  readonly ipAddress: string;
  readonly userAgent?: string;
  readonly referrer?: string;
  readonly requestPath: string;
  readonly cookieHeader?: string;
  readonly query: unknown;
}

export interface TrackingRedirectResult {
  readonly trackingClickId: string;
  readonly publicClickId: string;
  readonly trackingLinkId: string;
  readonly visitorId: string;
  readonly duplicateDecision: 'accepted' | 'duplicate';
  readonly fraudRiskLevel: 'low' | 'medium' | 'high';
  readonly fraudSignals: readonly string[];
  readonly attributionEligible: boolean;
  readonly blocked: boolean;
  readonly proxyDetectionOutcome: ProxyDetectionOutcome;
  readonly location: string;
  readonly setCookieHeader: string | null;
}
