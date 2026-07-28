import { createHash } from 'node:crypto';
const ENDPOINT_KEY_PATTERN = /^pbk_[a-f0-9]{48}$/u;
const PUBLIC_CLICK_ID_PATTERN = /^clk_[a-f0-9]{32}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const MAX_PAYLOAD_BYTES = 65_536;
export class NetworkPostbackHttpError extends Error {
    code;
    statusCode;
    constructor(code, statusCode, message, options = {}) {
        super(message, options);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'NetworkPostbackHttpError';
    }
}
function containsControlCharacter(value) {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    });
}
function normalizeBoundedString(value, fieldName, minimumLength, maximumLength) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < minimumLength ||
        normalizedValue.length > maximumLength ||
        containsControlCharacter(normalizedValue)) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, `${fieldName} is invalid.`);
    }
    return normalizedValue;
}
function normalizeEndpointKey(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (!ENDPOINT_KEY_PATTERN.test(normalizedValue)) {
        throw new NetworkPostbackHttpError('POSTBACK_UNAVAILABLE', 404, 'The postback endpoint is unavailable.');
    }
    return normalizedValue;
}
function normalizePublicClickId(value) {
    const normalizedValue = value.trim().toLowerCase();
    if (!PUBLIC_CLICK_ID_PATTERN.test(normalizedValue)) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'publicClickId is invalid.');
    }
    return normalizedValue;
}
function normalizeStatus(value) {
    switch (value) {
        case 'pending':
        case 'approved':
        case 'rejected':
        case 'reversed':
            return value;
        default:
            throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'status is invalid.');
    }
}
function normalizeRevenue(amountMinor, currency) {
    if (amountMinor === null && currency === null) {
        return Object.freeze({
            amountMinor: null,
            currency: null,
        });
    }
    const normalizedCurrency = currency?.trim().toUpperCase();
    if (amountMinor === null ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor < 0 ||
        normalizedCurrency === undefined ||
        !CURRENCY_PATTERN.test(normalizedCurrency)) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'Revenue amount and currency must be provided together and be valid.');
    }
    return Object.freeze({
        amountMinor,
        currency: normalizedCurrency,
    });
}
function normalizePayload(value) {
    let serializedValue;
    try {
        serializedValue = JSON.stringify(value);
    }
    catch (error) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'The provider payload is not serializable.', { cause: error });
    }
    if (Buffer.byteLength(serializedValue, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw new NetworkPostbackHttpError('POSTBACK_INVALID', 400, 'The provider payload is too large.');
    }
    return Object.freeze({ ...value });
}
export function createNetworkPostbackService(repository) {
    return Object.freeze({
        async ingest(input) {
            const endpointKey = normalizeEndpointKey(input.endpointKey);
            const revenue = normalizeRevenue(input.revenueAmountMinor, input.revenueCurrency);
            let result;
            try {
                result = await repository.ingestPostback({
                    endpointKeyHash: createHash('sha256').update(endpointKey, 'utf8').digest('hex'),
                    publicClickId: normalizePublicClickId(input.publicClickId),
                    externalConversionId: normalizeBoundedString(input.externalConversionId, 'externalConversionId', 1, 255),
                    idempotencyKey: normalizeBoundedString(input.idempotencyKey, 'idempotencyKey', 8, 255),
                    status: normalizeStatus(input.status),
                    revenueAmountMinor: revenue.amountMinor,
                    revenueCurrency: revenue.currency,
                    payload: normalizePayload(input.payload),
                });
            }
            catch (error) {
                if (error instanceof NetworkPostbackHttpError) {
                    throw error;
                }
                throw new NetworkPostbackHttpError('POSTBACK_CONFLICT', 409, 'The postback could not be applied to the conversion.', { cause: error });
            }
            if (result === undefined) {
                throw new NetworkPostbackHttpError('POSTBACK_UNAVAILABLE', 404, 'The postback endpoint or click is unavailable.');
            }
            return Object.freeze({
                publicConversionId: result.publicConversionId,
                status: result.status,
                wasIdempotent: result.wasIdempotent,
            });
        },
    });
}
//# sourceMappingURL=network-postback.service.js.map