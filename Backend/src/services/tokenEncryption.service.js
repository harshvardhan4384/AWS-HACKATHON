'use strict';

const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // Standard 96-bit IV recommended by NIST for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // Standard 128-bit authentication tag

/**
 * Resolves and validates the 32-byte AES-256 key buffer.
 * @param {string|Buffer|null} [customKey] - Optional override key (hex string or Buffer)
 * @returns {Buffer}
 */
function getKeyBuffer(customKey = null) {
  const rawKey = customKey || config.oauthTokenEncryptionKey;
  if (!rawKey) {
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY is not configured.');
  }

  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length !== 32) {
      throw new Error(`Invalid encryption key length: expected 32 bytes, got ${rawKey.length}`);
    }
    return rawKey;
  }

  if (typeof rawKey === 'string') {
    // If 64 hex chars, parse as hex; if 32 utf8 chars, parse as utf8
    if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }
    if (Buffer.byteLength(rawKey, 'utf8') === 32) {
      return Buffer.from(rawKey, 'utf8');
    }
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) or a 32-byte string.');
  }

  throw new Error('Invalid encryption key type');
}

/**
 * Encrypts a plaintext token using AES-256-GCM.
 *
 * @param {string|null|undefined} plaintext - Sensitive token string
 * @param {string|Buffer|null} [keyOverride] - Optional key override (for testing)
 * @returns {string|null} Format: "ivHex:authTagHex:ciphertextHex", or null if plaintext is nil
 */
function encrypt(plaintext, keyOverride = null) {
  if (plaintext === null || plaintext === undefined) {
    return null;
  }

  if (typeof plaintext !== 'string') {
    plaintext = String(plaintext);
  }

  const key = getKeyBuffer(keyOverride);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 *
 * @param {string|null|undefined} encryptedPayload - Format "ivHex:authTagHex:ciphertextHex"
 * @param {string|Buffer|null} [keyOverride] - Optional key override (for testing)
 * @returns {string|null} Decrypted plaintext token string, or null if payload is nil
 */
function decrypt(encryptedPayload, keyOverride = null) {
  if (encryptedPayload === null || encryptedPayload === undefined) {
    return null;
  }

  if (typeof encryptedPayload !== 'string') {
    throw new Error('Encrypted payload must be a string');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format: expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKeyBuffer(keyOverride);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH_BYTES} bytes`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH_BYTES} bytes`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Utility to generate a cryptographically random 32-byte hex key for setup.
 * @returns {string} 64-character hex string
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  generateEncryptionKey,
  getKeyBuffer,
};

