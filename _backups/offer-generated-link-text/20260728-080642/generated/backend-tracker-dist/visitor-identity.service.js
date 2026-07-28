import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COOKIE_VERSION = 'v1';
const SECONDS_PER_DAY = 86_400;
const MAX_CLOCK_SKEW_SECONDS = 60;
function normalizeCookieName(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0 || !/^[A-Za-z0-9._-]+$/.test(normalizedValue)) {
        throw new Error('Visitor cookie name is invalid.');
    }
    return normalizedValue;
}
function normalizeSigningSecret(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < 32) {
        throw new Error('Visitor signing secret must contain at least 32 characters.');
    }
    return normalizedValue;
}
function normalizeMaxAgeDays(value) {
    if (!Number.isInteger(value) || value < 1 || value > 3_650) {
        throw new Error('Visitor cookie max age must contain 1 to 3650 whole days.');
    }
    return value;
}
function createSignature(signingSecret, payload) {
    return createHmac('sha256', signingSecret).update(payload).digest('base64url');
}
function signaturesMatch(expectedValue, actualValue) {
    const expected = Buffer.from(expectedValue);
    const actual = Buffer.from(actualValue);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function readCookieValue(cookieHeader, cookieName) {
    if (cookieHeader === undefined) {
        return undefined;
    }
    for (const segment of cookieHeader.split(';')) {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }
        const name = segment.slice(0, separatorIndex).trim();
        if (name !== cookieName) {
            continue;
        }
        const rawValue = segment.slice(separatorIndex + 1).trim();
        try {
            return decodeURIComponent(rawValue);
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function parseVisitorCookie(cookieValue, signingSecret) {
    if (cookieValue === undefined) {
        return undefined;
    }
    const parts = cookieValue.split('.');
    if (parts.length !== 4) {
        return undefined;
    }
    const [version, visitorIdValue, expiresAtValue, signature] = parts;
    if (version !== COOKIE_VERSION ||
        visitorIdValue === undefined ||
        expiresAtValue === undefined ||
        signature === undefined ||
        !UUID_PATTERN.test(visitorIdValue) ||
        !/^\d{10}$/.test(expiresAtValue) ||
        !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
        return undefined;
    }
    const expiresAtSeconds = Number.parseInt(expiresAtValue, 10);
    if (!Number.isSafeInteger(expiresAtSeconds)) {
        return undefined;
    }
    const payload = `${version}.${visitorIdValue.toLowerCase()}.${expiresAtValue}`;
    const expectedSignature = createSignature(signingSecret, payload);
    if (!signaturesMatch(expectedSignature, signature)) {
        return undefined;
    }
    return Object.freeze({
        visitorId: visitorIdValue.toLowerCase(),
        expiresAtSeconds,
    });
}
function serializeVisitorCookie(cookieName, visitorId, expiresAtSeconds, maxAgeSeconds, signingSecret, secureCookies) {
    const payload = `${COOKIE_VERSION}.${visitorId}.${String(expiresAtSeconds)}`;
    const signature = createSignature(signingSecret, payload);
    const cookieValue = encodeURIComponent(`${payload}.${signature}`);
    const expiresAt = new Date(expiresAtSeconds * 1_000).toUTCString();
    return [
        `${cookieName}=${cookieValue}`,
        `Max-Age=${String(maxAgeSeconds)}`,
        `Expires=${expiresAt}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        ...(secureCookies ? ['Secure'] : []),
    ].join('; ');
}
function createIdentityResult(visitorId, source, setCookieHeader, expiresAtSeconds) {
    return Object.freeze({
        visitorId,
        source,
        setCookieHeader,
        expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
    });
}
export function createVisitorIdentityService(options) {
    const cookieName = normalizeCookieName(options.cookieName);
    const signingSecret = normalizeSigningSecret(options.signingSecret);
    const maxAgeDays = normalizeMaxAgeDays(options.maxAgeDays);
    const maxAgeSeconds = maxAgeDays * SECONDS_PER_DAY;
    const renewalWindowSeconds = Math.min(30 * SECONDS_PER_DAY, Math.max(SECONDS_PER_DAY, Math.floor(maxAgeSeconds / 4)));
    const now = options.now ?? (() => new Date());
    const createVisitorId = options.createVisitorId ?? randomUUID;
    return Object.freeze({
        resolveVisitorIdentity(cookieHeader) {
            const nowDate = now();
            if (Number.isNaN(nowDate.getTime())) {
                throw new Error('Visitor identity clock returned an invalid date.');
            }
            const nowSeconds = Math.floor(nowDate.getTime() / 1_000);
            const maximumAcceptedExpiry = nowSeconds + maxAgeSeconds + MAX_CLOCK_SKEW_SECONDS;
            const parsedCookie = parseVisitorCookie(readCookieValue(cookieHeader, cookieName), signingSecret);
            if (parsedCookie !== undefined) {
                const cookieIsCurrent = parsedCookie.expiresAtSeconds > nowSeconds &&
                    parsedCookie.expiresAtSeconds <= maximumAcceptedExpiry;
                if (cookieIsCurrent) {
                    if (parsedCookie.expiresAtSeconds - nowSeconds > renewalWindowSeconds) {
                        return createIdentityResult(parsedCookie.visitorId, 'existing_cookie', null, parsedCookie.expiresAtSeconds);
                    }
                    const renewedExpiry = nowSeconds + maxAgeSeconds;
                    return createIdentityResult(parsedCookie.visitorId, 'renewed_cookie', serializeVisitorCookie(cookieName, parsedCookie.visitorId, renewedExpiry, maxAgeSeconds, signingSecret, options.secureCookies), renewedExpiry);
                }
            }
            const visitorId = createVisitorId().trim().toLowerCase();
            if (!UUID_PATTERN.test(visitorId)) {
                throw new Error('Visitor identity generator returned an invalid UUID.');
            }
            const expiresAtSeconds = nowSeconds + maxAgeSeconds;
            return createIdentityResult(visitorId, 'new_cookie', serializeVisitorCookie(cookieName, visitorId, expiresAtSeconds, maxAgeSeconds, signingSecret, options.secureCookies), expiresAtSeconds);
        },
    });
}
//# sourceMappingURL=visitor-identity.service.js.map