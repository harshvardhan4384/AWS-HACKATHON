'use strict';

const crypto = require('crypto');
const QRCode = require('qrcode');
const tokenEncryption = require('./tokenEncryption.service');
const twoFactorRecoveryCodeRepository = require('../repositories/twoFactorRecoveryCode.repository');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer into RFC 4648 Base32.
 * @param {Buffer} buffer
 * @returns {string}
 */
function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into a buffer.
 * @param {string} base32Str
 * @returns {Buffer}
 */
function decodeBase32(base32Str) {
  const cleaned = base32Str.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random 160-bit Base32 secret for TOTP.
 * @returns {string} 32-character Base32 string
 */
function generateSecret() {
  const randomBytes = crypto.randomBytes(20);
  return encodeBase32(randomBytes);
}

/**
 * Generates a 6-digit TOTP code for a given timestamp and secret.
 * @param {string} secret Base32 encoded secret
 * @param {number} [timestamp] Unix timestamp in ms (defaults to Date.now())
 * @returns {string} 6-digit zero-padded TOTP string
 */
function generateTotpToken(secret, timestamp = Date.now()) {
  const timeStep = Math.floor(timestamp / 1000 / 30);
  const key = decodeBase32(secret);

  // 8-byte big-endian counter
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code against a Base32 secret with a 1-step window (±30s).
 *
 * @param {string} token 6-digit code provided by user
 * @param {string} secret Base32 secret
 * @param {number} [window=1] Step window for clock drift
 * @returns {boolean}
 */
function verifyTotp(token, secret, window = 1) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const now = Date.now();
  const stepMs = 30 * 1000;

  for (let i = -window; i <= window; i++) {
    const checkTime = now + (i * stepMs);
    const expected = generateTotpToken(secret, checkTime);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates the standard otpauth URI.
 *
 * @param {object} params
 * @param {string} params.secret Base32 secret
 * @param {string} params.email User email
 * @returns {string}
 */
function generateOtpauthUri({ secret, email }) {
  const issuer = 'Re:COVER';
  const label = `${issuer}:${email.trim().toLowerCase()}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a PNG Data URL for scanning via mobile authenticator apps.
 *
 * @param {string} otpauthUri
 * @returns {Promise<string>} Data URL string (image/png)
 */
async function generateQrCodeDataUrl(otpauthUri) {
  return await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * Encrypts a TOTP secret using AES-256-GCM.
 * @param {string} secret Plaintext Base32 secret
 * @returns {string} iv:authTag:ciphertext
 */
function encryptSecret(secret) {
  return tokenEncryption.encrypt(secret);
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret.
 * @param {string} encryptedSecret
 * @returns {string} Decrypted Base32 secret
 */
function decryptSecret(encryptedSecret) {
  return tokenEncryption.decrypt(encryptedSecret);
}

/**
 * Normalizes a recovery code string (removes hyphens, uppercase).
 * @param {string} rawCode
 * @returns {string}
 */
function normalizeRecoveryCode(rawCode) {
  return String(rawCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Hashes a recovery code with SHA-256 for safe storage at rest.
 * @param {string} code
 * @returns {string} SHA-256 hex digest
 */
function hashRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generates 8 cryptographically secure single-use recovery codes.
 * Returns formatted plaintext codes for the user to download/store.
 *
 * @returns {Array<string>} Array of 8 formatted recovery codes (e.g. "A1B2-C3D4-E5F6")
 */
function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
    const formatted = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
    codes.push(formatted);
  }
  return codes;
}

/**
 * Validates and consumes a recovery code for a user.
 *
 * @param {string} userId
 * @param {string} providedCode
 * @returns {Promise<boolean>} True if valid and consumed; false otherwise
 */
async function verifyAndConsumeRecoveryCode(userId, providedCode) {
  if (!providedCode || typeof providedCode !== 'string') return false;

  const targetHash = hashRecoveryCode(providedCode);
  const unusedCodes = await twoFactorRecoveryCodeRepository.findUnusedByUserId(userId);

  const targetBuffer = Buffer.from(targetHash, 'utf8');

  for (const record of unusedCodes) {
    const storedBuffer = Buffer.from(record.codeHash, 'utf8');
    if (storedBuffer.length === targetBuffer.length && crypto.timingSafeEqual(storedBuffer, targetBuffer)) {
      // Valid single-use match! Mark as used
      await twoFactorRecoveryCodeRepository.markUsed(record.id);
      return true;
    }
  }

  return false;
}

module.exports = {
  generateSecret,
  generateTotpToken,
  verifyTotp,
  generateOtpauthUri,
  generateQrCodeDataUrl,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyAndConsumeRecoveryCode,
};

