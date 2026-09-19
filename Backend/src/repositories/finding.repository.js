'use strict';

const { getDb } = require('../lib/db');

/**
 * Finding Repository — persists Detection Engine findings as Evidence records.
 *
 * DESIGN: Findings from detection rules are stored as Evidence records:
 *   - evidenceType = finding type (e.g. 'UNFAMILIAR_LOGIN', 'NEW_SSH_KEY')
 *   - evidenceData = { ruleId, confidence, riskContribution, detectionKey, relatedEventIds, metadata }
 *   - detectionKey = `${eventId}:${ruleId}` — used for idempotency
 *
 * This design reuses the existing Evidence model without schema changes.
 * All findings are associated with an Incident and linked to the triggering SecurityEvent.
 */

/**
 * Builds the standard detection key for idempotency.
 *
 * @param {string} eventId
 * @param {string} ruleId
 * @returns {string}
 */
function buildDetectionKey(eventId, ruleId) {
  return `${eventId}:${ruleId}`;
}

/**
 * Finds an existing Evidence (finding) record by its detection key.
 * Detection key = `${eventId}:${ruleId}` stored in evidenceData.
 *
 * @param {string} eventId
 * @param {string} ruleId
 * @returns {Promise<object|null>}
 */
async function findByDetectionKey(eventId, ruleId) {
  const db = getDb();
  const detectionKey = buildDetectionKey(eventId, ruleId);

  // Fetch Evidence records for this event — filter by detectionKey client-side
  // (JSONB path queries vary by Prisma 8 RC support; client-side is safe for bounded sets)
  const records = await db.orm.public.Evidence.where({ eventId })
    .limit(50)
    .all();

  return records.find(
    (r) => r.evidenceData && r.evidenceData.detectionKey === detectionKey
  ) || null;
}

/**
 * Persists a detection finding as an Evidence record.
 * Idempotent: returns existing record if detectionKey already exists.
 *
 * @param {object} params
 * @param {string} params.incidentId
 * @param {string} params.eventId - The SecurityEvent that triggered this finding
 * @param {object} params.finding - Finding object from a detection rule
 * @param {string} params.finding.ruleId
 * @param {string} params.finding.type
 * @param {string} params.finding.severity
 * @param {number} params.finding.confidence
 * @param {string} params.finding.summary
 * @param {string[]} params.finding.relatedEventIds
 * @param {object} params.finding.metadata
 * @param {number} [params.riskContribution] - Score contribution from Risk Engine
 * @param {'GOOGLE'|'GITHUB'|'AWS'} [params.source] - Provider source
 * @returns {Promise<{ evidence: object, isDuplicate: boolean }>}
 */
async function create({ incidentId, eventId, finding, riskContribution = 0, source = null }) {
  const db = getDb();
  const detectionKey = buildDetectionKey(eventId, finding.ruleId);

  // Idempotency check — skip creation if already persisted
  const existing = await findByDetectionKey(eventId, finding.ruleId);
  if (existing) {
    return { evidence: existing, isDuplicate: true };
  }

  const evidenceData = {
    detectionKey,
    ruleId: finding.ruleId,
    findingType: finding.type,
    severity: finding.severity,
    confidence: finding.confidence,
    summary: finding.summary,
    riskContribution,
    relatedEventIds: finding.relatedEventIds || [],
    findingMetadata: finding.metadata || {},
  };

  const evidence = await db.orm.public.Evidence.create({
    incidentId,
    eventId: eventId || null,
    evidenceType: finding.type,
    source: source || null,
    evidenceData,
    confidence: finding.confidence,
    updatedAt: new Date().toISOString(),
  });

  return { evidence, isDuplicate: false };
}

/**
 * Returns all Evidence (finding) records for a given incident, with pagination.
 *
 * @param {string} incidentId
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @param {number} [options.page=1]
 * @returns {Promise<{ evidence: object[], pagination: object }>}
 */
async function listByIncidentId(incidentId, options = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const totalAgg = await db.orm.public.Evidence.where({ incidentId }).aggregate((e) => ({
    count: e.count(),
  }));
  const total = Number(totalAgg?.count || 0);

  const evidence = await db.orm.public.Evidence.where({ incidentId })
    .orderBy((e) => e.createdAt.desc())
    .offset(offset)
    .limit(limit)
    .all();

  return {
    evidence,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: offset + evidence.length < total,
    },
  };
}

/**
 * Returns all Evidence (finding) records for a given SecurityEvent.
 *
 * @param {string} eventId
 * @returns {Promise<object[]>}
 */
async function listByEventId(eventId) {
  const db = getDb();
  return await db.orm.public.Evidence.where({ eventId })
    .orderBy((e) => e.createdAt.desc())
    .limit(50)
    .all();
}

/**
 * Finds an Evidence record by ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  return await db.orm.public.Evidence.where({ id }).first();
}

/**
 * Returns all Evidence records for an incident.
 *
 * @param {string} incidentId
 * @returns {Promise<object[]>}
 */
async function findByIncidentId(incidentId) {
  const db = getDb();
  return await db.orm.public.Evidence.where({ incidentId }).all();
}

module.exports = {
  create,
  findById,
  findByIncidentId,
  findByDetectionKey,
  listByIncidentId,
  listByEventId,
  buildDetectionKey,
};
