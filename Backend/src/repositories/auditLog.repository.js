'use strict';

const { getDb } = require('../lib/db');

const { redactSensitive } = require('../utils/redaction');

/**
 * Deeply sanitizes metadata to ensure no sensitive tokens or secrets are logged in AuditLog.
 * Delegates to centralized redactSensitive utility.
 *
 * @param {object|null|undefined} meta
 * @returns {object|null}
 */
function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  return redactSensitive(meta);
}

/**
 * Records an immutable audit log entry in PostgreSQL.
 *
 * @param {object} entry
 * @param {string|null} [entry.userId]
 * @param {string|null} [entry.incidentId]
 * @param {'USER'|'SYSTEM'|'AGENT'|'PROVIDER'} entry.actorType
 * @param {string|null} [entry.actorId]
 * @param {string} entry.actionType
 * @param {string|null} [entry.targetType]
 * @param {string|null} [entry.targetId]
 * @param {'SUCCESS'|'FAILURE'|'PARTIAL'|string} [entry.result]
 * @param {object|null} [entry.metadata]
 * @param {string|null} [entry.correlationId]
 * @returns {Promise<object>} Created AuditLog record
 */
async function create(entry) {
  const db = getDb();

  const sanitized = sanitizeMetadata(entry.metadata);

  return await db.orm.public.AuditLog.create({
    userId: entry.userId || null,
    incidentId: entry.incidentId || null,
    actorType: entry.actorType || 'SYSTEM',
    actorId: entry.actorId || null,
    actionType: entry.actionType,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    result: entry.result || 'SUCCESS',
    metadata: sanitized ? JSON.stringify(sanitized) : null,
    correlationId: entry.correlationId || null,
  });
}

/**
 * Lists audit logs for a specific user.
 *
 * @param {string} userId
 * @param {number} [limit=50]
 * @returns {Promise<Array<object>>}
 */
async function listByUserId(userId, options = 50) {
  const db = getDb();
  const limit = typeof options === 'number' ? options : (options?.limit || 50);
  return await db.orm.public.AuditLog.where({ userId }).limit(limit).all();
}

module.exports = {
  create,
  listByUserId,
  sanitizeMetadata,
};

