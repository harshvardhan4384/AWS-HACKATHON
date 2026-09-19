'use strict';

const { getDb } = require('../lib/db');
const { redactSensitive } = require('../utils/redaction');
const recoveryActionRepository = require('./recoveryAction.repository');
const incidentRepository = require('./incident.repository');
const auditLogRepository = require('./auditLog.repository');
const config = require('../config/env');

/**
 * VerificationRepository — persistence layer for Task 15 Verification and Persistence Detection.
 *
 * Implements authoritative updates for RecoveryAction verificationStatus, Incident resolution,
 * persistence Evidence creation, and recovery-cycle audit counts.
 */
class VerificationRepository {
  /**
   * Updates verification outcome and timestamp on a RecoveryAction record.
   *
   * @param {string} actionId
   * @param {object} params
   * @param {string} params.verificationStatus - VERIFIED, PARTIALLY_VERIFIED, FAILED, INCONCLUSIVE, PERSISTENCE_FOUND
   * @param {string} params.verifiedAt - ISO timestamp
   * @param {object} [params.verificationResult] - Structured verification summary
   * @returns {Promise<object|null>} Updated RecoveryAction
   */
  async updateRecoveryActionVerification(actionId, { verificationStatus, verifiedAt, verificationResult }) {
    const db = getDb();
    const action = await recoveryActionRepository.findById(actionId);
    if (!action) return null;

    let existingMeta = {};
    if (action.providerResult) {
      try {
        existingMeta = typeof action.providerResult === 'string'
          ? JSON.parse(action.providerResult)
          : action.providerResult;
      } catch {
        existingMeta = {};
      }
    }

    const mergedProviderResult = {
      ...existingMeta,
      verification: redactSensitive(verificationResult || {}),
    };

    const updateData = {
      verificationStatus,
      verifiedAt: verifiedAt || new Date().toISOString(),
      providerResult: JSON.stringify(mergedProviderResult),
      updatedAt: new Date().toISOString(),
    };

    try {
      return await db.orm.public.RecoveryAction.where({ id: actionId }).update(updateData);
    } catch (err) {
      if (err.message && err.message.includes('No rows')) return null;
      throw err;
    }
  }

  /**
   * Updates an incident's status and resolved timestamp.
   *
   * @param {string} incidentId
   * @param {string} status - IncidentStatus enum (e.g. VERIFYING, RESOLVED)
   * @param {object} [updates]
   * @param {string} [updates.resolvedAt]
   * @param {string} [updates.summary]
   * @returns {Promise<object>}
   */
  async updateIncidentStatus(incidentId, status, updates = {}) {
    const db = getDb();
    const updateData = {
      status,
      updatedAt: new Date().toISOString(),
      ...updates,
    };

    await db.orm.public.Incident.where({ id: incidentId }).update(updateData);
    return await incidentRepository.findById(incidentId);
  }

  /**
   * Queries security events for a user occurring at or after a specific timestamp.
   * Bounded by maxPostRecoveryEvents.
   *
   * @param {string} userId
   * @param {string} sinceTimestamp - ISO string
   * @param {number} [limit=100]
   * @returns {Promise<Array<object>>}
   */
  async findEventsForUserSince(userId, sinceTimestamp, limit = config.maxPostRecoveryEvents || 100) {
    const db = getDb();
    const sinceTime = new Date(sinceTimestamp).getTime();

    const events = await db.orm.public.SecurityEvent.where({ userId })
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    if (isNaN(sinceTime)) return events;

    return events.filter((e) => {
      const eventTimeRaw = e.occurredAt || e.createdAt;
      if (!eventTimeRaw) return false;
      const t = new Date(eventTimeRaw).getTime();
      return !isNaN(t) && t >= sinceTime;
    });
  }

  /**
   * Counts the number of re-investigation cycles triggered for an incident.
   * Uses the immutable AuditLog to deterministically count past cycles.
   *
   * @param {string} incidentId
   * @returns {Promise<number>}
   */
  async countRecoveryCycles(incidentId) {
    const db = getDb();
    const auditRecords = await db.orm.public.AuditLog.where({
      incidentId,
      actionType: 'REINVESTIGATION_TRIGGERED',
    }).all();

    return auditRecords.length;
  }

  /**
   * Records a detected persistence mechanism as an Evidence record on the incident.
   *
   * @param {object} params
   * @param {string} params.incidentId
   * @param {object} params.persistenceItem
   * @param {string} [params.correlationId]
   * @returns {Promise<object>} Created Evidence record
   */
  async createPersistenceEvidence({ incidentId, persistenceItem, correlationId }) {
    const db = getDb();
    return await db.orm.public.Evidence.create({
      incidentId,
      evidenceType: 'PERSISTENCE',
      evidenceData: JSON.stringify(redactSensitive({
        ...persistenceItem,
        correlationId,
        detectedAt: new Date().toISOString(),
      })),
      confidence: 1.0,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Records an audit log entry.
   * @param {object} entry
   * @returns {Promise<object>}
   */
  async recordAudit(entry) {
    return await auditLogRepository.create(entry);
  }
}

const verificationRepository = new VerificationRepository();

module.exports = {
  VerificationRepository,
  verificationRepository,
};

