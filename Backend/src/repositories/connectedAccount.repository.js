'use strict';

const { getDb } = require('../lib/db');

/**
 * Finds a connected account by its ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  return await db.orm.public.ConnectedAccount.where({ id }).first();
}

/**
 * Finds a connected account for a specific user, provider, and external account ID.
 *
 * @param {string} userId
 * @param {string} provider - 'GOOGLE' | 'GITHUB' | 'AWS'
 * @param {string} providerAccountId
 * @returns {Promise<object|null>}
 */
async function findByUserProviderAndAccountId(userId, provider, providerAccountId) {
  const db = getDb();
  return await db.orm.public.ConnectedAccount.where({
    userId,
    provider,
    providerAccountId,
  }).first();
}

/**
 * Finds a connected account by provider and providerAccountId across ALL users.
 * Essential for preventing cross-user account takeover attempts.
 *
 * @param {string} provider - 'GOOGLE' | 'GITHUB' | 'AWS'
 * @param {string} providerAccountId
 * @returns {Promise<object|null>}
 */
async function findByProviderAndAccountId(provider, providerAccountId) {
  const db = getDb();
  return await db.orm.public.ConnectedAccount.where({
    provider,
    providerAccountId,
  }).first();
}

/**
 * Finds all connected accounts for a specific user and provider.
 *
 * @param {string} userId
 * @param {string} provider
 * @returns {Promise<Array<object>>}
 */
async function findByUserAndProvider(userId, provider) {
  const db = getDb();
  return await db.orm.public.ConnectedAccount.where({ userId, provider }).all();
}

/**
 * Lists all connected accounts for a user (without exposing token ciphertexts).
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>} Safe list of connected accounts
 */
async function listByUserId(userId) {
  const db = getDb();
  const accounts = await db.orm.public.ConnectedAccount.where({ userId }).all();
  return accounts.map((acc) => ({
    id: acc.id,
    userId: acc.userId,
    provider: acc.provider,
    providerAccountId: acc.providerAccountId,
    providerDisplayName: acc.providerDisplayName,
    status: acc.status,
    grantedScopes: acc.grantedScopes,
    tokenExpiresAt: acc.tokenExpiresAt,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
    lastSyncAt: acc.lastSyncAt,
  }));
}

/**
 * Upserts a connected account for a user, provider, and providerAccountId.
 * If the account already exists, updates tokens and display metadata.
 * Preserves an existing refresh token if the new exchange does not issue a new one.
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.provider
 * @param {string} data.providerAccountId
 * @param {string} [data.providerDisplayName]
 * @param {string} [data.status='ACTIVE']
 * @param {string} [data.grantedScopes]
 * @param {string} [data.accessTokenCiphertext]
 * @param {string} [data.refreshTokenCiphertext]
 * @param {string} [data.tokenExpiresAt]
 * @returns {Promise<object>} Created or updated ConnectedAccount record
 */
async function upsertConnectedAccount(data) {
  const db = getDb();
  const existing = await findByUserProviderAndAccountId(
    data.userId,
    data.provider,
    data.providerAccountId
  );

  const now = new Date().toISOString();

  if (existing) {
    const updateData = {
      updatedAt: now,
      status: data.status || 'ACTIVE',
    };
    if (data.providerDisplayName !== undefined) updateData.providerDisplayName = data.providerDisplayName;
    if (data.grantedScopes !== undefined) updateData.grantedScopes = data.grantedScopes;
    if (data.accessTokenCiphertext !== undefined) updateData.accessTokenCiphertext = data.accessTokenCiphertext;

    // Preserve existing refresh token if Google does not return a new one on reauthorization
    if (data.refreshTokenCiphertext) {
      updateData.refreshTokenCiphertext = data.refreshTokenCiphertext;
    }

    if (data.tokenExpiresAt !== undefined) updateData.tokenExpiresAt = data.tokenExpiresAt;

    await db.orm.public.ConnectedAccount.where({ id: existing.id }).update(updateData);
    return await findById(existing.id);
  }

  return await db.orm.public.ConnectedAccount.create({
    userId: data.userId,
    provider: data.provider,
    providerAccountId: data.providerAccountId,
    providerDisplayName: data.providerDisplayName || null,
    status: data.status || 'ACTIVE',
    grantedScopes: data.grantedScopes || null,
    accessTokenCiphertext: data.accessTokenCiphertext || null,
    refreshTokenCiphertext: data.refreshTokenCiphertext || null,
    tokenExpiresAt: data.tokenExpiresAt || null,
  });
}

/**
 * Deletes a connected account by its ID.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteById(id) {
  const db = getDb();
  await db.orm.public.ConnectedAccount.where({ id }).delete();
}

/**
 * Updates status of a connected account (e.g. REVOKED, ERROR).
 *
 * @param {string} id
 * @param {string} status
 * @returns {Promise<void>}
 */
async function updateStatus(id, status) {
  const db = getDb();
  await db.orm.public.ConnectedAccount.where({ id }).update({
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Updates the lastSyncAt timestamp of a connected account.
 *
 * @param {string} id
 * @param {string} [lastSyncAt]
 * @returns {Promise<void>}
 */
async function updateLastSyncAt(id, lastSyncAt = new Date().toISOString()) {
  const db = getDb();
  await db.orm.public.ConnectedAccount.where({ id }).update({
    lastSyncAt,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  findById,
  findByUserProviderAndAccountId,
  findByProviderAndAccountId,
  findByUserAndProvider,
  listByUserId,
  upsertConnectedAccount,
  deleteById,
  updateStatus,
  updateLastSyncAt,
};

