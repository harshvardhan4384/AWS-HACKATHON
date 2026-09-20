'use strict';

const { getDb } = require('../lib/db');

/**
 * Persists an array of hashed recovery codes for a user.
 * SECURITY: NEVER store raw recovery codes; only store codeHash.
 *
 * @param {Array<{ userId: string, codeHash: string }>} codes
 * @returns {Promise<void>}
 */
async function createMany(codes) {
  const db = getDb();
  for (const item of codes) {
    await db.orm.public.TwoFactorRecoveryCode.create({
      userId: item.userId,
      codeHash: item.codeHash,
      usedAt: null,
    });
  }
}

/**
 * Returns all unused recovery code records for a user.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
async function findUnusedByUserId(userId) {
  const db = getDb();
  return await db.orm.public.TwoFactorRecoveryCode
    .where({ userId, usedAt: null })
    .all();
}

/**
 * Marks a recovery code as used (single-use enforcement).
 *
 * @param {string} id RecoveryCode UUID
 * @returns {Promise<void>}
 */
async function markUsed(id) {
  const db = getDb();
  await db.orm.public.TwoFactorRecoveryCode.where({ id }).update({
    usedAt: new Date().toISOString(),
  });
}

/**
 * Deletes all recovery codes for a user (used when regenerating codes or disabling 2FA).
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function deleteByUserId(userId) {
  const db = getDb();
  const allCodes = await db.orm.public.TwoFactorRecoveryCode.where({ userId }).all();
  for (const c of allCodes) {
    await db.orm.public.TwoFactorRecoveryCode.where({ id: c.id }).delete();
  }
}

/**
 * Counts how many unused recovery codes remain for a user.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function countRemaining(userId) {
  const db = getDb();
  const unused = await db.orm.public.TwoFactorRecoveryCode
    .where({ userId, usedAt: null })
    .all();
  return unused.length;
}

module.exports = {
  createMany,
  findUnusedByUserId,
  markUsed,
  deleteByUserId,
  countRemaining,
};
