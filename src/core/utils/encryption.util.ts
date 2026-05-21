import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// In production, this should be a 32-byte key from process.env.ENCRYPTION_KEY
// Fallback key ONLY for local development to prevent app crashes if not set
const FALLBACK_KEY = 'vovancovan-32-byte-secret-key-12';
const getSecretKey = () => {
    const key = process.env.ENCRYPTION_KEY || FALLBACK_KEY;
    if (key.length !== 32) {
        // Pad or slice to exactly 32 bytes
        return Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
    }
    return Buffer.from(key, 'utf8');
};

/**
 * Deterministic encryption allows exact-match searching in MongoDB.
 * The IV is derived deterministically from the plaintext itself.
 */
export const encrypt = (text: string): string => {
    if (!text) return text;
    // Prevent double encryption
    if (text.includes(':')) {
        const parts = text.split(':');
        if (parts.length === 3 && parts[0].length === 32 && parts[1].length === 32) {
            return text; // Already encrypted
        }
    }

    try {
        // Derive a deterministic IV (16 bytes) from the plaintext hash
        const iv = crypto.createHash('sha256').update(text).digest().slice(0, 16);
        const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');

        // Format: iv:authTag:encryptedData
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
        return text;
    }
};

export const decrypt = (text: string): string => {
    if (!text) return text;

    const parts = text.split(':');
    if (parts.length !== 3) {
        return text; // Not encrypted or old format
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    try {
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            getSecretKey(),
            Buffer.from(ivHex, 'hex')
        );
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // If decryption fails, return the original string just in case
        return text;
    }
};

