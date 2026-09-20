'use strict';

const { getDb } = require('../lib/db');

/**
 * Strips sensitive fields like passwordHash and twoFactorSecretEncrypted from user object before returning.
 *
 * @param {object} user Raw user from database
 * @returns {object|null} Safe user representation
 */
function toSafeUser(user) {
  if (!user) return null;
  const { passwordHash, twoFactorSecretEncrypted, ...safeUser } = user; // eslint-disable-line no-unused-vars
  return safeUser;
}

/**
 * Finds a user by email address.
 * Returns raw user including passwordHash and 2FA credentials for internal authentication verification.
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
 * Finds a raw user by ID including passwordHash and twoFactorSecretEncrypted.
 * Used strictly for internal authentication, password verification, and 2FA checks.
 *
 * @param {string} id
 * @returns {Promise<object|null>} Raw user or null
 */
async function findRawById(id) {
  const db = getDb();
  return await db.orm.public.User.where({ id }).first();
}

/**
 * Creates a new user record in the database.
 *
 * @param {object} data User data
 * @returns {Promise<object>} Created safe user
 */
async function create(data) {
  const db = getDb();
  const user = await db.orm.public.User.create({
    email: data.email,
    passwordHash: data.passwordHash || null,
    displayName: data.displayName || null,
    avatarUrl: data.avatarUrl || null,
    phoneNumber: data.phoneNumber || null,
    emailVerifiedAt: data.emailVerifiedAt || null,
    twoFactorEnabled: data.twoFactorEnabled || false,
    twoFactorSecretEncrypted: data.twoFactorSecretEncrypted || null,
    status: data.status || 'ACTIVE',
  });
  return toSafeUser(user);
}

/**
 * Updates profile information for a user.
 *
 * @param {string} id User UUID
 * @param {object} data { displayName, avatarUrl, phoneNumber }
 * @returns {Promise<object|null>} Updated safe user
 */
async function updateProfile(id, data) {
  const db = getDb();
  const updatePayload = {
    updatedAt: new Date().toISOString(),
  };
  if (data.displayName !== undefined) updatePayload.displayName = data.displayName;
  if (data.avatarUrl !== undefined) updatePayload.avatarUrl = data.avatarUrl;
  if (data.phoneNumber !== undefined) updatePayload.phoneNumber = data.phoneNumber;

  await db.orm.public.User.where({ id }).update(updatePayload);
  return await findById(id);
}

/**
 * Marks a user's email as verified.
 *
 * @param {string} id User UUID
 * @returns {Promise<object|null>} Updated safe user
 */
async function updateEmailVerified(id) {
  const db = getDb();
  await db.orm.public.User.where({ id }).update({
    emailVerifiedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return await findById(id);
}

/**
 * Updates a user's password hash (used in password reset and password change).
 *
 * @param {string} id User UUID
 * @param {string} passwordHash Bcrypt hash
 * @returns {Promise<void>}
 */
async function updatePasswordHash(id, passwordHash) {
  const db = getDb();
  await db.orm.public.User.where({ id }).update({
    passwordHash,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Updates a user's two-factor authentication configuration.
 *
 * @param {string} id User UUID
 * @param {object} params { twoFactorEnabled, twoFactorSecretEncrypted }
 * @returns {Promise<object|null>} Updated safe user
 */
async function updateTwoFactor(id, { twoFactorEnabled, twoFactorSecretEncrypted }) {
  const db = getDb();
  const updatePayload = {
    twoFactorEnabled: !!twoFactorEnabled,
    twoFactorSecretEncrypted: twoFactorSecretEncrypted !== undefined ? twoFactorSecretEncrypted : null,
    updatedAt: new Date().toISOString(),
  };
  await db.orm.public.User.where({ id }).update(updatePayload);
  return await findById(id);
}

module.exports = {
  findByEmail,
  findById,
  findRawById,
  create,
  toSafeUser,
  updateProfile,
  updateEmailVerified,
  updatePasswordHash,
  updateTwoFactor,
};
