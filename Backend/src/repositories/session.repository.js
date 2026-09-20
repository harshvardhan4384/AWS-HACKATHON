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
  const allSessions = await db.orm.public.Session.where({ userId }).all();
  for (const s of allSessions) {
    await db.orm.public.Session.where({ id: s.id }).delete();
  }
}

/**
 * Finds all active, unexpired sessions for a user.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
async function findActiveByUserId(userId) {
  const db = getDb();
  const sessions = await db.orm.public.Session.where({ userId }).all();
  const now = new Date();
  return sessions
    .filter(s => new Date(s.expiresAt) > now)
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
}

/**
 * Deletes a specific session belonging to a user (strict tenant isolation).
 *
 * @param {string} id Session UUID
 * @param {string} userId User UUID
 * @returns {Promise<boolean>}
 */
async function deleteByIdAndUser(id, userId) {
  const db = getDb();
  const session = await db.orm.public.Session.where({ id, userId }).first();
  if (!session) return false;
  await db.orm.public.Session.where({ id }).delete();
  return true;
}

/**
 * Deletes all sessions for a user EXCEPT the specified current session.
 *
 * @param {string} userId User UUID
 * @param {string} currentSessionId Current session UUID
 * @returns {Promise<number>} Number of sessions revoked
 */
async function deleteOtherSessions(userId, currentSessionId) {
  const db = getDb();
  const allSessions = await db.orm.public.Session.where({ userId }).all();
  let count = 0;
  for (const s of allSessions) {
    if (s.id !== currentSessionId) {
      await db.orm.public.Session.where({ id: s.id }).delete();
      count++;
    }
  }
  return count;
}

module.exports = {
  create,
  findByTokenHash,
  updateLastUsed,
  deleteByTokenHash,
  deleteByUserId,
  findActiveByUserId,
  deleteByIdAndUser,
  deleteOtherSessions,
};
