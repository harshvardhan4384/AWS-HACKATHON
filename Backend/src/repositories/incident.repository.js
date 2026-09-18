'use strict';

const { getDb } = require('../lib/db');
const config = require('../config/env');

/**
 * Severity ordering for deterministic severity comparison.
 * Higher index = higher severity.
 */
const SEVERITY_ORDER = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Returns the higher of two severity strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function maxSeverity(a, b) {
  const ai = SEVERITY_ORDER.indexOf(a);
  const bi = SEVERITY_ORDER.indexOf(b);
  return ai >= bi ? a : b;
}

/**
 * Finds an incident by its primary key ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  return await db.orm.public.Incident.where({ id }).first();
}

/**
 * Finds an incident by ID, verifying it belongs to the given userId.
 *
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function findByIdAndUserId(id, userId) {
  const db = getDb();
  return await db.orm.public.Incident.where({ id, userId }).first();
}

/**
 * Finds active (OPEN or INVESTIGATING) incidents for a user associated with a
 * specific connected account within a time window.
 * Used for incident deduplication — append to existing rather than creating a new one.
 *
 * @param {string} userId
 * @param {string} connectedAccountId
 * @param {number} [windowMinutes] - Time window to search back (defaults to takeoverWindowMinutes)
 * @returns {Promise<object|null>} Most recent matching active incident, or null
 */
async function findActiveByUserAndAccount(userId, connectedAccountId, windowMinutes) {
  const db = getDb();
  const window = windowMinutes || config.detectionTakeoverWindowMinutes;
  const cutoffTime = Date.now() - window * 60 * 1000;

  const incidents = await db.orm.public.Incident.where({ userId })
    .orderBy((i) => i.startedAt.desc())
    .limit(20)
    .all();

  // Filter for active incidents linked to this connected account
  // An incident is "linked" if it has SecurityEvents from the same connectedAccountId
  // We filter client-side since this is a bounded set
  const activeStatuses = ['OPEN', 'INVESTIGATING', 'CONTAINMENT_REQUIRED'];

  const activeIncidents = incidents.filter(
    (i) => activeStatuses.includes(i.status) && new Date(i.startedAt).getTime() >= cutoffTime
  );

  if (activeIncidents.length === 0) return null;

  // Check if any active incident has SecurityEvents from this connected account
  const db2 = getDb();
  for (const incident of activeIncidents) {
    const linkedEvent = await db2.orm.public.SecurityEvent.where({
      incidentId: incident.id,
      connectedAccountId,
    })
      .limit(1)
      .first();

    if (linkedEvent) {
      return incident;
    }
  }

  return null;
}

/**
 * Creates a new Incident record.
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.title
 * @param {string} [data.summary]
 * @param {'OPEN'|'INVESTIGATING'|'CONTAINMENT_REQUIRED'|'RECOVERY_REQUIRED'|'VERIFYING'|'RESOLVED'|'CLOSED'} [data.status]
 * @param {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'} data.severity
 * @param {string} [data.detectionSource]
 * @returns {Promise<object>}
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.Incident.create({
    userId: data.userId,
    title: data.title,
    summary: data.summary || null,
    status: data.status || 'OPEN',
    severity: data.severity,
    detectionSource: data.detectionSource || 'RULE_MATCH',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Updates an incident's severity and summary.
 * Severity is only upgraded, never downgraded (deterministic highest-severity rule).
 *
 * @param {string} id
 * @param {string} newSeverity
 * @param {string} [appendToSummary] - Text to append to existing summary
 * @returns {Promise<object>}
 */
async function updateSeverityAndSummary(id, newSeverity, appendToSummary) {
  const db = getDb();
  const existing = await findById(id);
  if (!existing) throw new Error(`Incident ${id} not found`);

  const updatedSeverity = maxSeverity(existing.severity, newSeverity);
  const updatedSummary = appendToSummary
    ? [existing.summary, appendToSummary].filter(Boolean).join(' | ')
    : existing.summary;

  await db.orm.public.Incident.where({ id }).update({
    severity: updatedSeverity,
    summary: updatedSummary || null,
    updatedAt: new Date().toISOString(),
  });

  return await findById(id);
}

/**
 * Links a SecurityEvent to an Incident by setting its incidentId.
 *
 * @param {string} eventId
 * @param {string} incidentId
 * @returns {Promise<void>}
 */
async function linkEventToIncident(eventId, incidentId) {
  const db = getDb();
  await db.orm.public.SecurityEvent.where({ id: eventId }).update({
    incidentId,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Lists incidents for a user with bounded pagination and optional filters.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {number} [options.page=1]
 * @param {string} [options.status]
 * @param {string} [options.severity]
 * @returns {Promise<{ incidents: object[], pagination: object }>}
 */
async function listByUserId(userId, options = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const whereClause = { userId };
  if (options.status) whereClause.status = options.status;
  if (options.severity) whereClause.severity = options.severity;

  const query = db.orm.public.Incident.where(whereClause);
  const totalAgg = await query.aggregate((i) => ({ count: i.count() }));
  const total = Number(totalAgg?.count || 0);

  const incidents = await query
    .orderBy((i) => i.startedAt.desc())
    .offset(offset)
    .limit(limit)
    .all();

  return {
    incidents,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: offset + incidents.length < total,
    },
  };
}

/**
 * Retrieves a rich view of a single incident including linked evidence.
 * Evidence records include finding details.
 *
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function findWithEvidence(id, userId) {
  const incident = await findByIdAndUserId(id, userId);
  if (!incident) return null;

  const db = getDb();

  // Load evidence (findings) for this incident
  const evidence = await db.orm.public.Evidence.where({ incidentId: id })
    .orderBy((e) => e.createdAt.desc())
    .limit(100)
    .all();

  // Load linked security events (summary only — no raw payloads)
  const linkedEvents = await db.orm.public.SecurityEvent.where({ incidentId: id })
    .orderBy((e) => e.createdAt.desc())
    .limit(50)
    .all();

  return {
    ...incident,
    evidence,
    linkedEventCount: linkedEvents.length,
    linkedEvents: linkedEvents.map((e) => ({
      id: e.id,
      connectedAccountId: e.connectedAccountId || null,
      provider: e.provider,
      eventType: e.eventType,
      severity: e.severity,
      status: e.status,
      sourceIp: e.sourceIp,
      occurredAt: e.occurredAt,
      createdAt: e.createdAt,
    })),
  };
}

module.exports = {
  findById,
  findByIdAndUserId,
  findActiveByUserAndAccount,
  create,
  updateSeverityAndSummary,
  linkEventToIncident,
  listByUserId,
  findWithEvidence,
  maxSeverity,
};
