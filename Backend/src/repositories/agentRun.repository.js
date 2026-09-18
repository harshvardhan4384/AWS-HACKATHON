'use strict';

const { getDb } = require('../lib/db');

/**
 * AgentRun Repository — Manages persistence and state tracking for AI AgentRuns.
 */

/**
 * Creates a new AgentRun record.
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.incidentId
 * @param {'ORCHESTRATOR'|'PLANNER'|'INVESTIGATOR'|'VERIFIER'} [data.agentType='INVESTIGATOR']
 * @param {'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED'} [data.status='RUNNING']
 * @param {string} [data.triggerSource='MANUAL']
 * @param {string} [data.modelId]
 * @param {string} [data.modelProvider]
 * @param {string} [data.correlationId]
 * @param {string} [data.startedAt]
 * @returns {Promise<object>}
 */
async function create(data) {
  const db = getDb();
  return await db.orm.public.AgentRun.create({
    userId: data.userId,
    incidentId: data.incidentId,
    agentType: data.agentType || 'INVESTIGATOR',
    status: data.status || 'RUNNING',
    triggerSource: data.triggerSource || 'MANUAL',
    modelId: data.modelId || null,
    modelProvider: data.modelProvider || 'AWS_BEDROCK',
    correlationId: data.correlationId || null,
    startedAt: data.startedAt || new Date().toISOString(),
    completedAt: null,
    resultSummary: null,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Finds an AgentRun by primary key ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  return await db.orm.public.AgentRun.where({ id }).first();
}

/**
 * Finds an AgentRun by ID ensuring user ownership.
 *
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function findByIdAndUserId(id, userId) {
  const db = getDb();
  return await db.orm.public.AgentRun.where({ id, userId }).first();
}

/**
 * Finds an active (RUNNING or PENDING) AgentRun for an incident to prevent duplicates.
 *
 * @param {string} incidentId
 * @returns {Promise<object|null>}
 */
async function findActiveByIncidentId(incidentId) {
  const db = getDb();
  const runs = await db.orm.public.AgentRun.where({ incidentId })
    .orderBy((r) => r.createdAt.desc())
    .limit(10)
    .all();

  return runs.find((r) => r.status === 'RUNNING' || r.status === 'PENDING') || null;
}

/**
 * Finds the latest AgentRun for an incident belonging to a user.
 *
 * @param {string} incidentId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function findLatestByIncidentId(incidentId, userId) {
  const db = getDb();
  const runs = await db.orm.public.AgentRun.where({ incidentId, userId })
    .orderBy((r) => r.createdAt.desc())
    .limit(1)
    .all();

  return runs[0] || null;
}

/**
 * Updates the status and outcome of an AgentRun.
 *
 * @param {string} id
 * @param {'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED'} status
 * @param {object} [updates]
 * @param {string} [updates.completedAt]
 * @param {object} [updates.resultSummary]
 * @param {string} [updates.errorMessage]
 * @returns {Promise<object>}
 */
async function updateStatus(id, status, updates = {}) {
  const db = getDb();
  const updateData = {
    status,
    updatedAt: new Date().toISOString(),
  };

  if (updates.completedAt) updateData.completedAt = updates.completedAt;
  if (updates.resultSummary) updateData.resultSummary = updates.resultSummary;
  if (updates.errorMessage) updateData.errorMessage = updates.errorMessage;

  await db.orm.public.AgentRun.where({ id }).update(updateData);
  return await findById(id);
}

/**
 * Lists AgentRuns for a user with bounded pagination.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {number} [options.page=1]
 * @returns {Promise<{ agentRuns: object[], pagination: object }>}
 */
async function listByUserId(userId, options = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const query = db.orm.public.AgentRun.where({ userId });
  const totalAgg = await query.aggregate((r) => ({ count: r.count() }));
  const total = Number(totalAgg?.count || 0);

  const agentRuns = await query
    .orderBy((r) => r.createdAt.desc())
    .offset(offset)
    .limit(limit)
    .all();

  return {
    agentRuns,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: offset + agentRuns.length < total,
    },
  };
}

module.exports = {
  create,
  findById,
  findByIdAndUserId,
  findActiveByIncidentId,
  findLatestByIncidentId,
  updateStatus,
  listByUserId,
};

