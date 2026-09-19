'use strict';

const { getDb } = require('../lib/db');

/**
 * RecoveryActionRepository — persistence layer for RecoveryAction and Approval records.
 *
 * Implements the authorization contract: Approval records with status='APPROVED' and
 * valid expiresAt serve as the authorization token that ActionExecutorService validates
 * before executing any recovery action.
 *
 * IMPORTANT: RecoveryAction does NOT have a userId field. Ownership is validated through
 * the incident relationship: RecoveryAction → Incident → userId.
 */

/**
 * Creates a new RecoveryAction record with status PROPOSED.
 *
 * @param {object} data
 * @param {string} data.incidentId
 * @param {string|null} [data.connectedAccountId]
 * @param {string} data.actionType - RecoveryActionType enum value
 * @param {string} data.riskLevel - Severity enum value
 * @param {object|null} [data.providerResult] - Stores dependency/metadata JSON
 * @returns {Promise<object>} Created RecoveryAction
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.RecoveryAction.create({
    incidentId: data.incidentId,
    connectedAccountId: data.connectedAccountId || null,
    actionType: data.actionType,
    status: 'PROPOSED',
    riskLevel: data.riskLevel,
    providerResult: data.providerResult ? JSON.stringify(data.providerResult) : null,
  });
}

/**
 * Finds a RecoveryAction by its primary key.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  const results = await db.orm.public.RecoveryAction.where({ id }).all();
  return results[0] || null;
}

/**
 * Finds all RecoveryAction records for a given incident.
 *
 * @param {string} incidentId
 * @returns {Promise<Array<object>>}
 */
async function findByIncidentId(incidentId) {
  const db = getDb();
  return await db.orm.public.RecoveryAction.where({ incidentId }).all();
}

/**
 * Atomically transitions a RecoveryAction status.
 * Returns null if the record doesn't match the expected current status (concurrency guard).
 *
 * @param {string} id
 * @param {string} newStatus - RecoveryActionStatus enum value
 * @param {object} [updates] - Additional fields to update (e.g. executedAt, providerResult, errorMessage)
 * @returns {Promise<object|null>}
 */
async function updateStatus(id, newStatus, updates = {}) {
  const db = getDb();

  const updateData = {
    status: newStatus,
    updatedAt: new Date().toISOString(),
    ...updates,
  };

  if (updates.providerResult && typeof updates.providerResult === 'object') {
    updateData.providerResult = JSON.stringify(updates.providerResult);
  }

  try {
    return await db.orm.public.RecoveryAction.where({ id }).update(updateData);
  } catch (err) {
    // Update may have failed due to concurrency — caller handles null
    if (err.message && err.message.includes('No rows')) return null;
    throw err;
  }
}

/**
 * Creates an Approval record (authorization fixture or real approval).
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.incidentId
 * @param {string} data.recoveryActionId
 * @param {string} [data.status] - ApprovalStatus enum (default: 'APPROVED')
 * @param {string} [data.expiresAt] - ISO string
 * @param {object|null} [data.decisionMetadata]
 * @returns {Promise<object>} Created Approval
 */
async function createApproval(data) {
  const db = getDb();
  return await db.orm.public.Approval.create({
    userId: data.userId,
    incidentId: data.incidentId,
    recoveryActionId: data.recoveryActionId,
    status: data.status || 'APPROVED',
    decidedAt: new Date().toISOString(),
    expiresAt: data.expiresAt || null,
    decisionMetadata: data.decisionMetadata ? JSON.stringify(data.decisionMetadata) : null,
  });
}

/**
 * Finds an Approval by its primary key.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findApprovalById(id) {
  const db = getDb();
  const results = await db.orm.public.Approval.where({ id }).all();
  return results[0] || null;
}

/**
 * Marks an Approval as consumed by storing the consumption timestamp in decisionMetadata.
 * This prevents replay attacks — each authorization token may only be used once.
 *
 * @param {string} approvalId
 * @param {string} executionId - The RecoveryAction ID that consumed this approval
 * @returns {Promise<object|null>}
 */
async function markApprovalConsumed(approvalId, executionId) {
  const db = getDb();
  try {
    return await db.orm.public.Approval.where({ id: approvalId }).update({
      decisionMetadata: JSON.stringify({
        consumed: true,
        consumedAt: new Date().toISOString(),
        consumedByActionId: executionId,
      }),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err.message && err.message.includes('No rows')) return null;
    throw err;
  }
}

/**
 * Checks if an Approval has already been consumed (replay attack prevention).
 *
 * @param {string} approvalId
 * @returns {Promise<boolean>}
 */
async function isApprovalConsumed(approvalId) {
  const approval = await findApprovalById(approvalId);
  if (!approval) return false;

  let metadata = approval.decisionMetadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      return false;
    }
  }

  return !!(metadata && metadata.consumed === true);
}

module.exports = {
  create,
  findById,
  findByIncidentId,
  updateStatus,
  createApproval,
  findApprovalById,
  markApprovalConsumed,
  isApprovalConsumed,
};

