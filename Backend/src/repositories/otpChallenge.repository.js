'use strict';

const { getDb } = require('../lib/db');

/**
 * Creates a new OTP challenge record.
 * SECURITY: NEVER store raw OTP codes; only store codeHash.
 *
 * @param {object} data { userId, email, purpose, codeHash, expiresAt, maxAttempts }
 * @returns {Promise<object>} Created challenge
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.OtpChallenge.create({
    userId: data.userId || null,
    email: data.email.trim().toLowerCase(),
    purpose: data.purpose,
    codeHash: data.codeHash,
    expiresAt: data.expiresAt,
    attemptCount: 0,
    maxAttempts: data.maxAttempts || 5,
    consumedAt: null,
  });
}

/**
 * Finds the latest unconsumed, unexpired OTP challenge for an email and purpose.
 *
 * @param {string} email
 * @param {'EMAIL_VERIFICATION'|'PASSWORD_RESET'} purpose
 * @returns {Promise<object|null>}
 */
async function findActive(email, purpose) {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const challenges = await db.orm.public.OtpChallenge
    .where({ email: normalizedEmail, purpose, consumedAt: null })
    .all();

  const now = new Date();
  // Filter active and unexpired, sort latest first
  const valid = challenges
    .filter(c => new Date(c.expiresAt) > now)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return valid[0] || null;
}

/**
 * Increments the attempt count for an OTP challenge.
 *
 * @param {string} id Challenge UUID
 * @returns {Promise<void>}
 */
async function incrementAttempts(id) {
  const db = getDb();
  const existing = await db.orm.public.OtpChallenge.where({ id }).first();
  if (existing) {
    await db.orm.public.OtpChallenge.where({ id }).update({
      attemptCount: (existing.attemptCount || 0) + 1,
    });
  }
}

/**
 * Marks an OTP challenge as consumed (single-use enforcement).
 *
 * @param {string} id Challenge UUID
 * @returns {Promise<void>}
 */
async function markConsumed(id) {
  const db = getDb();
  await db.orm.public.OtpChallenge.where({ id }).update({
    consumedAt: new Date().toISOString(),
  });
}

/**
 * Invalidates (marks consumed) all previous active OTP challenges for an email + purpose.
 *
 * @param {string} email
 * @param {'EMAIL_VERIFICATION'|'PASSWORD_RESET'} purpose
 * @returns {Promise<void>}
 */
async function invalidateActive(email, purpose) {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const active = await db.orm.public.OtpChallenge
    .where({ email: normalizedEmail, purpose, consumedAt: null })
    .all();

  const now = new Date().toISOString();
  for (const c of active) {
    await db.orm.public.OtpChallenge.where({ id: c.id }).update({ consumedAt: now });
  }
}

module.exports = {
  create,
  findActive,
  incrementAttempts,
  markConsumed,
  invalidateActive,
};

