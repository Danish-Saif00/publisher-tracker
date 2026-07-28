import { createCipheriv, createDecipheriv, randomBytes, } from 'node:crypto';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const MAX_SERIALIZED_PAYLOAD_LENGTH = 48_000;
function decodeEncryptionKey(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
        throw new Error('DATA_ENCRYPTION_KEY is required.');
    }
    const key = Buffer.from(normalizedValue, 'base64');
    if (key.length !== KEY_LENGTH_BYTES ||
        key.toString('base64').replace(/=+$/u, '') !== normalizedValue.replace(/=+$/u, '')) {
        throw new Error('DATA_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.');
    }
    return key;
}
function decodeBase64(value, fieldName) {
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
        throw new Error(`${fieldName} is empty.`);
    }
    const decoded = Buffer.from(normalizedValue, 'base64');
    if (decoded.length === 0) {
        throw new Error(`${fieldName} is invalid.`);
    }
    return decoded;
}
function serializePayload(payload) {
    const serialized = JSON.stringify(payload);
    if (serialized.length < 2 ||
        serialized.length > MAX_SERIALIZED_PAYLOAD_LENGTH) {
        throw new Error('Email notification payload must serialize to between 2 and 48000 characters.');
    }
    return serialized;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parsePayload(serialized) {
    let parsed;
    try {
        parsed = JSON.parse(serialized);
    }
    catch (error) {
        throw new Error('Decrypted email notification payload is not valid JSON.', {
            cause: error,
        });
    }
    if (!isRecord(parsed)) {
        throw new Error('Decrypted email notification payload must be a JSON object.');
    }
    return Object.freeze({
        ...parsed,
    });
}
export function createEmailPayloadCipher(encryptionKey) {
    const key = decodeEncryptionKey(encryptionKey);
    return Object.freeze({
        encrypt(payload) {
            const plaintext = serializePayload(payload);
            const iv = randomBytes(IV_LENGTH_BYTES);
            const cipher = createCipheriv('aes-256-gcm', key, iv, {
                authTagLength: AUTH_TAG_LENGTH_BYTES,
            });
            const ciphertext = Buffer.concat([
                cipher.update(plaintext, 'utf8'),
                cipher.final(),
            ]);
            return Object.freeze({
                ciphertext: ciphertext.toString('base64'),
                iv: iv.toString('base64'),
                authTag: cipher.getAuthTag().toString('base64'),
            });
        },
        decrypt(payload) {
            const ciphertext = decodeBase64(payload.ciphertext, 'Email payload ciphertext');
            const iv = decodeBase64(payload.iv, 'Email payload IV');
            const authTag = decodeBase64(payload.authTag, 'Email payload authentication tag');
            if (iv.length !== IV_LENGTH_BYTES ||
                authTag.length !== AUTH_TAG_LENGTH_BYTES) {
                throw new Error('Stored email payload encryption metadata is invalid.');
            }
            const decipher = createDecipheriv('aes-256-gcm', key, iv, {
                authTagLength: AUTH_TAG_LENGTH_BYTES,
            });
            decipher.setAuthTag(authTag);
            const plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final(),
            ]).toString('utf8');
            return parsePayload(plaintext);
        },
    });
}
//# sourceMappingURL=email-payload-cipher.js.map