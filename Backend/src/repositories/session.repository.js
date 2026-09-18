'use strict';

const { getDb } = require('../lib/db');

/**
 * Creates a new session record in the database.
 *
 * @param {object} data { userId, sessionTokenHash, expiresAt, ipAddress, userAgent }
 * @returns {Promise<object>} Created session
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.Session.create({
    userId: data.userId,
    sessionTokenHash: data.sessionTokenHash,
    expiresAt: data.expiresAt,
    ipAddress: data.ipAddress || null,
    userAgent: data.userAgent || null,
  });
}

/**
 * Finds a session by its token hash.
 *
 * @param {string} sessionTokenHash SHA-256 hex digest of the raw session token
 * @returns {Promise<object|null>} Session record or null
 */
async function findByTokenHash(sessionTokenHash) {
  const db = getDb();
  return await db.orm.public.Session.where({ sessionTokenHash }).first();
}

/**
 * Updates the lastUsedAt timestamp of a session.
 *
 * @param {string} id Session UUID
 * @returns {Promise<void>}
 */
async function updateLastUsed(id) {
  const db = getDb();
  await db.orm.public.Session.where({ id }).update({
    lastUsedAt: new Date().toISOString(),
  });
}

/**
 * Deletes a session by its token hash (used on logout).
 *
 * @param {string} sessionTokenHash
 * @returns {Promise<void>}
 */
async function deleteByTokenHash(sessionTokenHash) {
  const db = getDb();
  await db.orm.public.Session.where({ sessionTokenHash }).delete();
}

/**
 * Deletes all sessions for a user (used on password change / account revocation).
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function deleteByUserId(userId) {
  const db = getDb();
  await db.orm.public.Session.where({ userId }).delete();
}

module.exports = {
  create,
  findByTokenHash,
  updateLastUsed,
  deleteByTokenHash,
  deleteByUserId,
};

