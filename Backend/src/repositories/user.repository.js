'use strict';

const { getDb } = require('../lib/db');

/**
 * Strips sensitive fields like passwordHash from user object before returning to higher layers.
 *
 * @param {object} user Raw user from database
 * @returns {object|null} Safe user representation
 */
function toSafeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user; // eslint-disable-line no-unused-vars
  return safeUser;
}

/**
 * Finds a user by email address.
 * Returns raw user including passwordHash for internal authentication verification.
 *
 * @param {string} email
 * @returns {Promise<object|null>} Raw user or null
 */
async function findByEmail(email) {
  const db = getDb();
  return await db.orm.public.User.where({ email }).first();
}

/**
 * Finds a user by ID.
 * Returns safe user without sensitive credentials.
 *
 * @param {string} id
 * @returns {Promise<object|null>} Safe user or null
 */
async function findById(id) {
  const db = getDb();
  const user = await db.orm.public.User.where({ id }).first();
  return toSafeUser(user);
}

/**
 * Creates a new user record in the database.
 *
 * @param {object} data User data { email, passwordHash, displayName, status }
 * @returns {Promise<object>} Created safe user
 */
async function create(data) {
  const db = getDb();
  const user = await db.orm.public.User.create({
    email: data.email,
    passwordHash: data.passwordHash || null,
    displayName: data.displayName || null,
    status: data.status || 'ACTIVE',
  });
  return toSafeUser(user);
}

module.exports = {
  findByEmail,
  findById,
  create,
  toSafeUser,
};

