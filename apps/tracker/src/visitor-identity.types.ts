export type VisitorIdentitySource = 'new_cookie' | 'existing_cookie' | 'renewed_cookie';

export interface ResolvedVisitorIdentity {
  readonly visitorId: string;
  readonly source: VisitorIdentitySource;
  readonly setCookieHeader: string | null;
  readonly expiresAt: string;
}

export interface VisitorIdentityService {
  resolveVisitorIdentity(cookieHeader?: string): ResolvedVisitorIdentity;
}
