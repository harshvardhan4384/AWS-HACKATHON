'use strict';

const { getDb } = require('../lib/db');

/**
 * ApprovalRepository — persistence layer for Approval records.
 *
 * Implements the authorization lifecycle for RecoveryActions:
 * - PENDING: Awaiting user approval decision
 * - APPROVED: Approved by user; serves as valid authorization until consumed or expired
 * - REJECTED: Rejected by user decision
 * - EXPIRED: Expiration time reached without decision
 */

/**
 * Creates a new Approval record.
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.incidentId
 * @param {string} data.recoveryActionId
 * @param {'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'} [data.status='PENDING']
 * @param {string} [data.expiresAt] - ISO timestamp
 * @param {object|null} [data.decisionMetadata]
 * @returns {Promise<object>}
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.Approval.create({
    userId: data.userId,
    incidentId: data.incidentId,
    recoveryActionId: data.recoveryActionId,
    status: data.status || 'PENDING',
    expiresAt: data.expiresAt || null,
    decisionMetadata: data.decisionMetadata ? JSON.stringify(data.decisionMetadata) : null,
  });
}

/**
 * Finds an Approval by its ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  const results = await db.orm.public.Approval.where({ id }).all();
  return results[0] || null;
}

/**
 * Finds all Approvals for a specific RecoveryAction, sorted descending by requestedAt.
 *
 * @param {string} recoveryActionId
 * @returns {Promise<Array<object>>}
 */
async function findByRecoveryActionId(recoveryActionId) {
  const db = getDb();
  const results = await db.orm.public.Approval.where({ recoveryActionId }).all();
  return results.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

/**
 * Lists approvals for a user with optional status filtering.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {string} [options.status]
 * @param {number} [options.limit=50]
 * @returns {Promise<Array<object>>}
 */
async function listByUserId(userId, options = {}) {
  const db = getDb();
  const whereClause = { userId };
  if (options.status) {
    whereClause.status = options.status;
  }
  const limit = options.limit || 50;
  const results = await db.orm.public.Approval.where(whereClause).limit(limit).all();
  return results.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

/**
 * Atomically updates status, decidedAt timestamp, and decisionMetadata.
 *
 * @param {string} id
 * @param {string} newStatus
 * @param {object} [updates]
 * @param {object} [updates.decisionMetadata]
 * @param {string} [updates.decidedAt]
 * @returns {Promise<object|null>}
 */
async function updateStatus(id, newStatus, updates = {}, expectedCurrentStatus = null) {
  const db = getDb();
  const whereClause = { id };
  if (expectedCurrentStatus) {
    whereClause.status = expectedCurrentStatus;
  }

  const updateData = {
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  if (updates.decidedAt) {
    updateData.decidedAt = updates.decidedAt;
  }
  if (updates.decisionMetadata !== undefined) {
    updateData.decisionMetadata =
      typeof updates.decisionMetadata === 'object'
        ? JSON.stringify(updates.decisionMetadata)
        : updates.decisionMetadata;
  }

  try {
    return await db.orm.public.Approval.where(whereClause).update(updateData);
  } catch (err) {
    if (err.message && err.message.includes('No rows')) return null;
    throw err;
  }
}

/**
 * Marks an approval record as consumed by an action execution (single-use defense).
 *
 * @param {string} approvalId
 * @param {string} executionId
 * @returns {Promise<object|null>}
 */
async function markConsumed(approvalId, executionId) {
  const approval = await findById(approvalId);
  if (!approval) return null;

  let metadata = {};
  try {
    metadata =
      typeof approval.decisionMetadata === 'string'
        ? JSON.parse(approval.decisionMetadata)
        : approval.decisionMetadata || {};
  } catch {
    metadata = {};
  }

  metadata.consumed = true;
  metadata.consumedAt = new Date().toISOString();
  metadata.consumedByActionId = executionId;

  return await updateStatus(approvalId, approval.status, {
    decisionMetadata: metadata,
  });
}

/**
 * Checks whether an approval has been consumed.
 *
 * @param {string} approvalId
 * @returns {Promise<boolean>}
 */
async function isConsumed(approvalId) {
  const approval = await findById(approvalId);
  if (!approval) return false;

  let metadata = {};
  try {
    metadata =
      typeof approval.decisionMetadata === 'string'
        ? JSON.parse(approval.decisionMetadata)
        : approval.decisionMetadata || {};
  } catch {
    return false;
  }

  return metadata.consumed === true;
}

module.exports = {
  create,
  findById,
  findByRecoveryActionId,
  listByUserId,
  updateStatus,
  markConsumed,
  isConsumed,
};

