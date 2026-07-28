import { createHmac, randomBytes } from 'node:crypto';
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
];
export class TrackingRedirectNotFoundError extends Error {
    constructor() {
        super('The requested tracking link is unavailable.');
        this.name = 'TrackingRedirectNotFoundError';
    }
}
function containsControlCharacter(value) {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    });
}
function sanitizeText(value, maximumLength) {
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
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeHostname(value) {
    const normalizedValue = value.trim().toLowerCase().replace(/\.+$/u, '');
    if (normalizedValue.length === 0 ||
        normalizedValue.length > 253 ||
        normalizedValue.includes(':') ||
        normalizedValue.includes('/') ||
        normalizedValue.includes('\\')) {
        throw new TrackingRedirectNotFoundError();
    }
    return normalizedValue;
}
function normalizePublicToken(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue.length < 2 ||
        normalizedValue.length > 80 ||
        !PUBLIC_TOKEN_PATTERN.test(normalizedValue)) {
        throw new TrackingRedirectNotFoundError();
    }
    return normalizedValue;
}
function normalizePublicNumericId(value) {
    if (value === undefined || !/^[1-9][0-9]{0,18}$/u.test(value.trim())) {
        throw new TrackingRedirectNotFoundError();
    }
    const normalized = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(normalized) || normalized < 1) {
        throw new TrackingRedirectNotFoundError();
    }
    return normalized;
}
function normalizePublicClickId(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (!PUBLIC_CLICK_ID_PATTERN.test(normalizedValue)) {
        throw new Error('Public click ID generator returned an invalid value.');
    }
    return normalizedValue;
}
function normalizeIpAddress(value) {
    const normalizedValue = (sanitizeText(value, MAX_IP_ADDRESS_LENGTH) ?? 'unknown').toLowerCase();
    return normalizedValue.startsWith('::ffff:') ? normalizedValue.slice(7) : normalizedValue;
}
function normalizeRequestPath(value) {
    const normalizedValue = sanitizeText(value, MAX_REQUEST_PATH_LENGTH) ?? '/';
    return normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`;
}
function normalizeReferrer(value) {
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
    }
    catch {
        return Object.freeze({
            url: null,
            hostname: null,
        });
    }
}
function readAttributionValue(value) {
    const candidate = typeof value === 'string'
        ? value
        : Array.isArray(value)
            ? value.find((entry) => typeof entry === 'string')
            : undefined;
    if (candidate === undefined) {
        return undefined;
    }
    const normalizedValue = candidate.trim();
    if (normalizedValue.length === 0 ||
        normalizedValue.length > MAX_ATTRIBUTION_VALUE_LENGTH ||
        containsControlCharacter(normalizedValue)) {
        return undefined;
    }
    return normalizedValue;
}
function normalizeAttribution(value) {
    if (!isRecord(value)) {
        return Object.freeze({});
    }
    const attribution = {};
    for (const key of ATTRIBUTION_KEYS) {
        const parameterValue = readAttributionValue(value[key]);
        if (parameterValue !== undefined) {
            attribution[key] = parameterValue;
        }
    }
    return Object.freeze(attribution);
}
function normalizeSecret(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < 32) {
        throw new Error('IP hash secret must contain at least 32 characters.');
    }
    return normalizedValue;
}
function createScopedHash(secret, scope, value) {
    return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
}
function buildDestinationUrl(destinationUrl, queryParameters, attribution, publicClickId) {
    const url = new URL(destinationUrl);
    for (const [key, value] of Object.entries(queryParameters)) {
        url.searchParams.set(key, value);
    }
    for (const [key, value] of Object.entries(attribution)) {
        if (!url.searchParams.has(key)) {
            url.searchParams.set(key, value);
        }
    }
    url.searchParams.set('click_id', publicClickId);
    return url.toString();
}
export function createTrackingLinkResolverService(repository, visitorIdentityService, options) {
    const ipHashSecret = normalizeSecret(options.ipHashSecret);
    const createPublicClickId = options.createPublicClickId ?? (() => `clk_${randomBytes(16).toString('hex')}`);
    return Object.freeze({
        async resolveRedirect(input) {
            const hostname = normalizeHostname(input.hostname);
            const publicToken = input.publicToken === undefined ? undefined : normalizePublicToken(input.publicToken);
            const publisherPublicId = publicToken === undefined ? normalizePublicNumericId(input.publisherPublicId) : undefined;
            const offerPublicId = publicToken === undefined ? normalizePublicNumericId(input.offerPublicId) : undefined;
            const publicClickId = normalizePublicClickId(createPublicClickId());
            const visitorIdentity = visitorIdentityService.resolveVisitorIdentity(input.cookieHeader);
            const normalizedIpAddress = normalizeIpAddress(input.ipAddress);
            const userAgent = sanitizeText(input.userAgent, MAX_USER_AGENT_LENGTH);
            const referrer = normalizeReferrer(input.referrer);
            const requestPath = normalizeRequestPath(input.requestPath);
            const attribution = normalizeAttribution(input.query);
            const ipHash = createScopedHash(ipHashSecret, 'ip', normalizedIpAddress);
            const userAgentHash = createScopedHash(ipHashSecret, 'user-agent', userAgent ?? 'unknown');
            const visitorFingerprint = createScopedHash(ipHashSecret, 'visitor-fingerprint', [visitorIdentity.visitorId, ipHash, userAgentHash].join(':'));
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
            return Object.freeze({
                trackingClickId: capturedClick.trackingClickId,
                publicClickId: capturedClick.publicClickId,
                trackingLinkId: capturedClick.trackingLinkId,
                visitorId: visitorIdentity.visitorId,
                duplicateDecision: capturedClick.duplicateDecision,
                fraudRiskLevel: capturedClick.fraudRiskLevel,
                fraudSignals: capturedClick.fraudSignals,
                attributionEligible: capturedClick.attributionEligible &&
                    !proxyDecision.blocked,
                blocked: proxyDecision.blocked,
                proxyDetectionOutcome: proxyDecision.outcome,
                location: buildDestinationUrl(capturedClick.destinationUrl, capturedClick.queryParameters, attribution, capturedClick.publicClickId),
                setCookieHeader: visitorIdentity.setCookieHeader,
            });
        },
    });
}
//# sourceMappingURL=tracking-link-resolver.service.js.map