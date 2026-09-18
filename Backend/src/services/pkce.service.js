'use strict';

const crypto = require('crypto');

/**
 * Generates a high-entropy cryptographically random PKCE code_verifier string.
 * According to RFC 7636 Section 4.1:
 * code-verifier = 43-128 unreserved characters [A-Z, a-z, 0-9, "-", ".", "_", "~"]
 *
 * @param {number} [byteLength=48] - Number of random bytes. 48 bytes base64url encodes to 64 chars.
 * @returns {string} PKCE code_verifier
 */
function generateCodeVerifier(byteLength = 48) {
  if (byteLength < 32 || byteLength > 96) {
    throw new Error('byteLength should be between 32 and 96 to yield 43-128 characters');
  }
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Derives the PKCE code_challenge from a code_verifier using S256 (RFC 7636 Section 4.2).
 * code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
 *
 * @param {string} codeVerifier - The PKCE code verifier
 * @returns {string} S256 code challenge
 */
function generateCodeChallenge(codeVerifier) {
  if (!codeVerifier || typeof codeVerifier !== 'string') {
    throw new Error('codeVerifier is required to generate a code challenge');
  }
  return crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

/**
 * Generates a cryptographically random OAuth state string.
 * @param {number} [byteLength=32]
 * @returns {string}
 */
function generateState(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Computes a deterministic SHA-256 hex hash of the raw state parameter.
 * Used for database storage to prevent state value leakage in query logs or dumps.
 *
 * @param {string} state - Raw state string
 * @returns {string} 64-character hex hash
 */
function hashState(state) {
  if (!state || typeof state !== 'string') {
    throw new Error('State string is required to compute hash');
  }
  return crypto.createHash('sha256').update(state, 'utf8').digest('hex');
}

module.exports = {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  hashState,
};

