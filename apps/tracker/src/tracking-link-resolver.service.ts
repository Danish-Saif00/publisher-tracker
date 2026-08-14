import { createHmac, randomBytes } from 'node:crypto';

import type { ProxyDetectionService } from './proxy-detection.runtime.js';
import type { TrackingLinkResolverRepository } from './tracking-link-resolver.repository.js';
import type {
  TrackingAttributionParameters,
  TrackingRedirectRequest,
  TrackingRedirectResult,
} from './tracking-link-resolver.types.js';
import type { VisitorIdentityService } from './visitor-identity.types.js';

const PUBLIC_TOKEN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_CLICK_ID_PATTERN = /^clk_[a-f0-9]{32}$/;
const MAX_USER_AGENT_LENGTH = 1_024;
const MAX_REFERRER_URL_LENGTH = 2_048;
const MAX_REQUEST_PATH_LENGTH = 1_024;
const MAX_ATTRIBUTION_VALUE_LENGTH = 500;
const MAX_IP_ADDRESS_LENGTH = 128;

const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'sub_id',
  'sub1',
  'sub2',
  'sub3',
  'sub4',
  'sub5',
] as const;

export class TrackingRedirectNotFoundError extends Error {
  public constructor() {
    super('The requested tracking link is unavailable.');
    this.name = 'TrackingRedirectNotFoundError';
  }
}

export interface TrackingLinkResolverServiceOptions {
  readonly ipHashSecret: string;
  readonly proxyDetectionService: ProxyDetectionService;
  readonly createPublicClickId?: () => string;
}

export interface TrackingLinkResolverService {
  resolveRedirect(input: TrackingRedirectRequest): Promise<TrackingRedirectResult>;
}

interface NormalizedReferrer {
  readonly url: string | null;
  readonly hostname: string | null;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);

    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function sanitizeText(value: string | undefined, maximumLength: number): string | null {
  if (value === undefined) {
    return null;
  }

  const normalizedValue = Array.from(value.trim())
    .map((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f) ? ' ' : character;
    })
    .join('')
    .split(/\s+/u)
    .filter((segment) => segment.length > 0)
    .join(' ');

  if (normalizedValue.length === 0) {
    return null;
  }

  return Array.from(normalizedValue).slice(0, maximumLength).join('');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeHostname(value: string): string {
  const normalizedValue = value.trim().toLowerCase().replace(/\.+$/u, '');

  if (
    normalizedValue.length === 0 ||
    normalizedValue.length > 253 ||
    normalizedValue.includes(':') ||
    normalizedValue.includes('/') ||
    normalizedValue.includes('\\')
  ) {
    throw new TrackingRedirectNotFoundError();
  }

  return normalizedValue;
}

function normalizePublicToken(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 2 ||
    normalizedValue.length > 80 ||
    !PUBLIC_TOKEN_PATTERN.test(normalizedValue)
  ) {
    throw new TrackingRedirectNotFoundError();
  }

  return normalizedValue;
}

function normalizePublicNumericId(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]{0,18}$/u.test(value.trim())) {
    throw new TrackingRedirectNotFoundError();
  }

  const normalized = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new TrackingRedirectNotFoundError();
  }

  return normalized;
}

function normalizePublicClickId(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!PUBLIC_CLICK_ID_PATTERN.test(normalizedValue)) {
    throw new Error('Public click ID generator returned an invalid value.');
  }

  return normalizedValue;
}

function normalizeIpAddress(value: string): string {
  const normalizedValue = (sanitizeText(value, MAX_IP_ADDRESS_LENGTH) ?? 'unknown').toLowerCase();

  return normalizedValue.startsWith('::ffff:') ? normalizedValue.slice(7) : normalizedValue;
}

function normalizeRequestPath(value: string): string {
  const normalizedValue = sanitizeText(value, MAX_REQUEST_PATH_LENGTH) ?? '/';

  return normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`;
}

function normalizeReferrer(value: string | undefined): NormalizedReferrer {
  const normalizedValue = sanitizeText(value, MAX_REFERRER_URL_LENGTH);

  if (normalizedValue === null) {
    return Object.freeze({
      url: null,
      hostname: null,
    });
  }

  try {
    const url = new URL(normalizedValue);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return Object.freeze({
        url: null,
        hostname: null,
      });
    }

    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';

    const urlValue = url.toString();

    if (urlValue.length > MAX_REFERRER_URL_LENGTH) {
      return Object.freeze({
        url: null,
        hostname: null,
      });
    }

    return Object.freeze({
      url: urlValue,
      hostname: url.hostname.toLowerCase(),
    });
  } catch {
    return Object.freeze({
      url: null,
      hostname: null,
    });
  }
}

function readAttributionValue(value: unknown): string | undefined {
  const candidate =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.find((entry): entry is string => typeof entry === 'string')
        : undefined;

  if (candidate === undefined) {
    return undefined;
  }

  const normalizedValue = candidate.trim();

  if (
    normalizedValue.length === 0 ||
    normalizedValue.length > MAX_ATTRIBUTION_VALUE_LENGTH ||
    containsControlCharacter(normalizedValue)
  ) {
    return undefined;
  }

  return normalizedValue;
}

function normalizeAttribution(value: unknown): TrackingAttributionParameters {
  if (!isRecord(value)) {
    return Object.freeze({});
  }

  const attribution: Record<string, string> = {};

  for (const key of ATTRIBUTION_KEYS) {
    const parameterValue = readAttributionValue(value[key]);

    if (parameterValue !== undefined) {
      attribution[key] = parameterValue;
    }
  }

  return Object.freeze(attribution);
}

function normalizeSecret(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length < 32) {
    throw new Error('IP hash secret must contain at least 32 characters.');
  }

  return normalizedValue;
}

function createScopedHash(secret: string, scope: string, value: string): string {
  return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
}

function buildDestinationUrl(
  destinationUrl: string,
  queryParameters: Readonly<Record<string, string>>,
  attribution: TrackingAttributionParameters,
  publicClickId: string,
  effectiveTrackingParameter: string,
): string {
  const url = new URL(destinationUrl);

  for (const [key, value] of Object.entries(queryParameters)) {
    url.searchParams.set(key, value);
  }

  for (const [key, value] of Object.entries(attribution)) {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.delete('click_id');
  url.searchParams.delete(effectiveTrackingParameter);
  url.searchParams.set(effectiveTrackingParameter, publicClickId);

  return url.toString();
}

type CountryAccessDecision = Readonly<{
  blocked: boolean;
  reason: 'worldwide' | 'allowed' | 'not_allowed' | 'unknown';
}>;

type TrackingDevice = 'desktop' | 'android' | 'ios';

type DeviceAccessDecision = Readonly<{
  blocked: boolean;
  device: TrackingDevice | null;
}>;

function detectTrackingDevice(userAgent: string | null): TrackingDevice | null {
  if (userAgent === null) {
    return null;
  }
  if (/android/iu.test(userAgent)) {
    return 'android';
  }
  if (/(iphone|ipad|ipod)/iu.test(userAgent)) {
    return 'ios';
  }
  if (/(windows nt|macintosh|x11|linux x86_64|cros)/iu.test(userAgent)) {
    return 'desktop';
  }
  return null;
}

function evaluateDeviceAccess(
  allowedDevices: readonly TrackingDevice[],
  userAgent: string | null,
): DeviceAccessDecision {
  if (allowedDevices.length === 0) {
    return Object.freeze({ blocked: false, device: detectTrackingDevice(userAgent) });
  }
  const device = detectTrackingDevice(userAgent);
  return Object.freeze({
    blocked: device === null || !allowedDevices.includes(device),
    device,
  });
}

function selectDeviceDestination(
  device: TrackingDevice | null,
  targeting: Readonly<{
    desktopUrl: string | null;
    androidUrl: string | null;
    iosUrl: string | null;
  }>,
  fallback: string,
): string {
  if (device === 'android') {
    return targeting.androidUrl ?? fallback;
  }
  if (device === 'ios') {
    return targeting.iosUrl ?? fallback;
  }
  if (device === 'desktop') {
    return targeting.desktopUrl ?? fallback;
  }
  return fallback;
}
function normalizeCountryComparable(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '');
}
function evaluateCountryAccess(
  allowedCountries: readonly string[],
  countryCode: string | null,
  countryName: string | null,
): CountryAccessDecision {
  if (allowedCountries.length === 0) {
    return Object.freeze({ blocked: false, reason: 'worldwide' });
  }

  const code =
    countryCode === null || countryCode.trim().length === 0
      ? null
      : countryCode.trim().toUpperCase();

  if (code === null) {
    return Object.freeze({ blocked: true, reason: 'unknown' });
  }

  let displayName: string | null;

  try {
    displayName = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? null;
  } catch {
    displayName = null;
  }

  const candidates = new Set(
    [code, countryName, displayName]
      .filter((value): value is string => value !== null)
      .map(normalizeCountryComparable),
  );

  const matched = allowedCountries.some((country) =>
    candidates.has(normalizeCountryComparable(country)),
  );

  return Object.freeze({
    blocked: !matched,
    reason: matched ? 'allowed' : 'not_allowed',
  });
}

export function createTrackingLinkResolverService(
  repository: TrackingLinkResolverRepository,
  visitorIdentityService: VisitorIdentityService,
  options: TrackingLinkResolverServiceOptions,
): TrackingLinkResolverService {
  const ipHashSecret = normalizeSecret(options.ipHashSecret);
  const createPublicClickId =
    options.createPublicClickId ?? (() => `clk_${randomBytes(16).toString('hex')}`);

  return Object.freeze<TrackingLinkResolverService>({
    async resolveRedirect(input): Promise<TrackingRedirectResult> {
      const hostname = normalizeHostname(input.hostname);
      const publicToken =
        input.publicToken === undefined ? undefined : normalizePublicToken(input.publicToken);
      const publisherPublicId =
        publicToken === undefined ? normalizePublicNumericId(input.publisherPublicId) : undefined;
      const offerPublicId =
        publicToken === undefined ? normalizePublicNumericId(input.offerPublicId) : undefined;
      const publicClickId = normalizePublicClickId(createPublicClickId());
      const visitorIdentity = visitorIdentityService.resolveVisitorIdentity(input.cookieHeader);
      const normalizedIpAddress = normalizeIpAddress(input.ipAddress);
      const userAgent = sanitizeText(input.userAgent, MAX_USER_AGENT_LENGTH);
      const referrer = normalizeReferrer(input.referrer);
      const requestPath = normalizeRequestPath(input.requestPath);
      const attribution = normalizeAttribution(input.query);
      const ipHash = createScopedHash(ipHashSecret, 'ip', normalizedIpAddress);
      const userAgentHash = createScopedHash(ipHashSecret, 'user-agent', userAgent ?? 'unknown');
      const visitorFingerprint = createScopedHash(
        ipHashSecret,
        'visitor-fingerprint',
        [visitorIdentity.visitorId, ipHash, userAgentHash].join(':'),
      );

      const capturedClick = await repository.captureTrackingClick({
        hostname,
        ...(publicToken !== undefined ? { publicToken } : {}),
        ...(publisherPublicId !== undefined ? { publisherPublicId } : {}),
        ...(offerPublicId !== undefined ? { offerPublicId } : {}),
        publicClickId,
        visitorId: visitorIdentity.visitorId,
        visitorIdentitySource: visitorIdentity.source,
        ipHash,
        userAgent,
        userAgentHash,
        visitorFingerprint,
        referrerUrl: referrer.url,
        referrerHostname: referrer.hostname,
        requestPath,
        attribution,
      });

      if (capturedClick === undefined) {
        throw new TrackingRedirectNotFoundError();
      }

      if (capturedClick.publicClickId !== publicClickId) {
        throw new Error('Captured click ID does not match the requested click ID.');
      }
      const proxyDecision = await options.proxyDetectionService.evaluate({
        trackingClickId: capturedClick.trackingClickId,
        companyId: capturedClick.companyId,
        ownerMembershipId: capturedClick.ownerMembershipId,
        ipAddress: normalizedIpAddress,
        ipHash,
        userAgent,
      });
      const targeting = await repository.getOfferTargetingConfiguration(
        capturedClick.companyId,
        capturedClick.offerId,
      );
      const countryAccess = evaluateCountryAccess(
        targeting.countries,
        proxyDecision.countryCode,
        proxyDecision.countryName,
      );
      const deviceAccess = evaluateDeviceAccess(targeting.devices, userAgent);

      if (countryAccess.blocked) {
        await repository.markCountryAccessBlocked(
          capturedClick.trackingClickId,
          capturedClick.companyId,
          proxyDecision.countryCode,
          proxyDecision.countryName,
          targeting.countries,
        );
      }

      return Object.freeze({
        trackingClickId: capturedClick.trackingClickId,
        publicClickId: capturedClick.publicClickId,
        trackingLinkId: capturedClick.trackingLinkId,
        visitorId: visitorIdentity.visitorId,
        duplicateDecision: capturedClick.duplicateDecision,
        fraudRiskLevel: capturedClick.fraudRiskLevel,
        fraudSignals: capturedClick.fraudSignals,
        attributionEligible:
          capturedClick.attributionEligible &&
          !proxyDecision.blocked &&
          !countryAccess.blocked &&
          !deviceAccess.blocked,
        blocked: proxyDecision.blocked || countryAccess.blocked || deviceAccess.blocked,
        blockReason: proxyDecision.blocked
          ? 'traffic'
          : countryAccess.blocked
            ? 'country'
            : deviceAccess.blocked
              ? 'device'
              : null,
        countryCode: proxyDecision.countryCode,
        device: deviceAccess.device,
        proxyDetectionOutcome: proxyDecision.outcome,
        location: buildDestinationUrl(
          selectDeviceDestination(deviceAccess.device, targeting, capturedClick.destinationUrl),
          capturedClick.queryParameters,
          attribution,
          capturedClick.publicClickId,
          capturedClick.effectiveTrackingParameter,
        ),
        setCookieHeader: visitorIdentity.setCookieHeader,
      });
    },
  });
}
