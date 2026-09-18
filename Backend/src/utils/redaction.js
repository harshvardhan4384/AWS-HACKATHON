'use strict';

/**
 * Centralized sensitive data redaction utility for Re:COVER.
 * Scrubs tokens, credentials, secrets, passwords, and private keys from
 * event payloads, metadata, and audit logs before persistence or transmission.
 */

// Normalized keys (lowercased, alphanumeric only) that MUST be redacted
const FORBIDDEN_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'clientsecret',
  'secret',
  'password',
  'passwordhash',
  'codeverifier',
  'codechallenge',
  'authorizationcode',
  'encryptionkey',
  'sessiontoken',
  'privatekey',
  'apikey',
  'secretaccesskey',
  'sessionid',
  'credential',
  'credentials',
  'bearer',
  'authorization',
  'cookie',
  'setcookie',
  'passphrase',
  'sshprivatekey',
  'sshprivkey',
]);

// Explicit allowlist of keys that might contain "token" or "key" substrings but are safe
const SAFE_KEYS = new Set([
  'providereventid',
  'eventid',
  'eventtype',
  'accountid',
  'provideraccountid',
  'userid',
  'incidentid',
  'id',
  'keyid',
  'publickey',
  'sshpublickey',
  'keyfingerprint',
  'tokenexpiresat',
  'tokentype',
]);

/**
 * Checks whether a given key is considered sensitive.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  if (!key || typeof key !== 'string') return false;
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (SAFE_KEYS.has(normalized)) {
    return false;
  }

  if (FORBIDDEN_KEYS.has(normalized)) {
    return true;
  }

  // Check common sensitive suffixes / patterns
  if (
    normalized.endsWith('accesstoken') ||
    normalized.endsWith('refreshtoken') ||
    normalized.endsWith('clientsecret') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('secretkey') ||
    normalized.endsWith('password')
  ) {
    return true;
  }

  return false;
}

/**
 * Recursively deep-clones and redacts sensitive keys from an object, array, or primitive.
 *
 * @param {any} data - Input data structure
 * @param {number} [depth=0] - Current recursion depth
 * @param {number} [maxDepth=20] - Maximum recursion depth to prevent cyclic references
 * @returns {any} Sanitized deep clone
 */
function redactSensitive(data, depth = 0, maxDepth = 20) {
  if (data === null || data === undefined) {
    return data;
  }

  if (depth > maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitive(item, depth + 1, maxDepth));
  }

  if (typeof data === 'object') {
    // Handle Date, RegExp, Buffer, etc.
    if (data instanceof Date) {
      return new Date(data.getTime());
    }
    if (data instanceof RegExp) {
      return data;
    }

    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        clean[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        clean[key] = redactSensitive(value, depth + 1, maxDepth);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  return data;
}

module.exports = {
  isSensitiveKey,
  redactSensitive,
  FORBIDDEN_KEYS,
};

