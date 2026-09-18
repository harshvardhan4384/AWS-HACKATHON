'use strict';

const { getDb } = require('../lib/db');

/**
 * Creates a new ephemeral OAuthState record.
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.provider - 'GOOGLE' | 'GITHUB' | 'AWS'
 * @param {string} data.stateHash - SHA-256 hex digest of raw state
 * @param {string} [data.codeVerifier] - PKCE code_verifier
 * @param {string} data.expiresAt - ISO date string
 * @returns {Promise<object>} Created record
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.OAuthState.create({
    userId: data.userId,
    provider: data.provider,
    stateHash: data.stateHash,
    codeVerifier: data.codeVerifier || null,
    expiresAt: data.expiresAt,
  });
}

/**
 * Finds an OAuthState by its SHA-256 stateHash.
 *
 * @param {string} stateHash
 * @returns {Promise<object|null>}
 */
async function findByStateHash(stateHash) {
  const db = getDb();
  return await db.orm.public.OAuthState.where({ stateHash }).first();
}

/**
 * Marks an OAuthState as used at current timestamp.
 *
 * @param {string} id - Record UUID
 * @returns {Promise<void>}
 */
async function markUsed(id) {
  const db = getDb();
  await db.orm.public.OAuthState.where({ id }).update({
    usedAt: new Date().toISOString(),
  });
}

/**
 * Deletes an OAuthState by id.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteById(id) {
  const db = getDb();
  await db.orm.public.OAuthState.where({ id }).delete();
}

/**
 * Deletes expired OAuthStates.
 * @returns {Promise<void>}
 */
async function deleteExpired() {
  const db = getDb();
  try {
    await db.execute`DELETE FROM "oAuthState" WHERE "expiresAt" < NOW()`;
  } catch {
    // Non-critical cleanup
  }
}

module.exports = {
  create,
  findByStateHash,
  markUsed,
  deleteById,
  deleteExpired,
};

