import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
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
function normalizePlaintext(value) {
    const normalizedValue = value.trim();
    if (normalizedValue.length < 1 || normalizedValue.length > 4096) {
        throw new Error('SMTP password must contain between 1 and 4096 characters.');
    }
    return normalizedValue;
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
export function createCredentialCipher(encryptionKey) {
    const key = decodeEncryptionKey(encryptionKey);
    return Object.freeze({
        encrypt(value) {
            const plaintext = normalizePlaintext(value);
            const iv = randomBytes(IV_LENGTH_BYTES);
            const cipher = createCipheriv('aes-256-gcm', key, iv, {
                authTagLength: AUTH_TAG_LENGTH_BYTES,
            });
            const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            return Object.freeze({
                ciphertext: ciphertext.toString('base64'),
                iv: iv.toString('base64'),
                authTag: cipher.getAuthTag().toString('base64'),
            });
        },
        decrypt(value) {
            const ciphertext = decodeBase64(value.ciphertext, 'SMTP password ciphertext');
            const iv = decodeBase64(value.iv, 'SMTP password IV');
            const authTag = decodeBase64(value.authTag, 'SMTP password authentication tag');
            if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
                throw new Error('Stored SMTP credential encryption metadata is invalid.');
            }
            const decipher = createDecipheriv('aes-256-gcm', key, iv, {
                authTagLength: AUTH_TAG_LENGTH_BYTES,
            });
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        },
    });
}
//# sourceMappingURL=credential-cipher.js.map