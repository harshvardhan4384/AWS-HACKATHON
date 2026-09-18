'use strict';

const { getDb } = require('../lib/db');

/**
 * Finds a security event by its primary key ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const db = getDb();
  return await db.orm.public.SecurityEvent.where({ id }).first();
}

/**
 * Finds a security event by connectedAccountId and providerEventId.
 * Used for idempotency lookups.
 *
 * @param {string} connectedAccountId
 * @param {string} providerEventId
 * @returns {Promise<object|null>}
 */
async function findByAccountAndProviderEventId(connectedAccountId, providerEventId) {
  const db = getDb();
  return await db.orm.public.SecurityEvent.where({
    connectedAccountId,
    providerEventId,
  }).first();
}

/**
 * Persists a normalized SecurityEvent record with atomic idempotency deduplication.
 * If an event with the same (connectedAccountId, providerEventId) already exists,
 * catches the unique constraint violation and returns the existing event with isDuplicate: true.
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string|null} [data.connectedAccountId]
 * @param {'GOOGLE'|'GITHUB'|'AWS'} data.provider
 * @param {string} data.eventType
 * @param {string|null} [data.providerEventId]
 * @param {string|null} [data.occurredAt]
 * @param {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'|null} [data.severity]
 * @param {'RAW'|'NORMALIZED'|'ANALYZED'|'CORRELATED'|'DISMISSED'} [data.status='NORMALIZED']
 * @param {object|null} [data.eventData]
 * @param {string|null} [data.sourceIp]
 * @param {object|null} [data.deviceMetadata]
 * @param {object|null} [data.locationMetadata]
 * @param {string|null} [data.incidentId]
 * @returns {Promise<{ event: object, isDuplicate: boolean }>}
 */
async function create(data) {
  const db = getDb();

  // Fast-path idempotency check
  if (data.connectedAccountId && data.providerEventId) {
    const existing = await findByAccountAndProviderEventId(
      data.connectedAccountId,
      data.providerEventId
    );
    if (existing) {
      return { event: existing, isDuplicate: true };
    }
  }

  try {
    const created = await db.orm.public.SecurityEvent.create({
      userId: data.userId,
      connectedAccountId: data.connectedAccountId || null,
      provider: data.provider,
      eventType: data.eventType,
      providerEventId: data.providerEventId || null,
      occurredAt: data.occurredAt || null,
      severity: data.severity || null,
      status: data.status || 'NORMALIZED',
      eventData: data.eventData || null,
      sourceIp: data.sourceIp || null,
      deviceMetadata: data.deviceMetadata || null,
      locationMetadata: data.locationMetadata || null,
      incidentId: data.incidentId || null,
    });
    return { event: created, isDuplicate: false };
  } catch (err) {
    // Race-condition fallback: catch PostgreSQL unique violation (code 23505)
    const isUniqueViolation =
      err.code === '23505' ||
      (err.message &&
        (err.message.includes('unique constraint') ||
          err.message.includes('duplicate key') ||
          err.message.toLowerCase().includes('securityevent_connectedaccountid_providereventid_key')));

    if (isUniqueViolation && data.connectedAccountId && data.providerEventId) {
      const existing = await findByAccountAndProviderEventId(
        data.connectedAccountId,
        data.providerEventId
      );
      if (existing) {
        return { event: existing, isDuplicate: true };
      }
    }
    throw err;
  }
}

/**
 * Lists security events belonging to a user with bounded pagination and filtering.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {number} [options.page=1]
 * @param {string} [options.provider]
 * @param {string} [options.eventType]
 * @param {string} [options.status]
 * @param {string} [options.severity]
 * @param {string} [options.connectedAccountId]
 * @returns {Promise<{ events: Array<object>, pagination: object }>}
 */
async function listByUserId(userId, options = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const whereClause = { userId };
  if (options.provider) {
    whereClause.provider = options.provider;
  }
  if (options.eventType) {
    whereClause.eventType = options.eventType;
  }
  if (options.status) {
    whereClause.status = options.status;
  }
  if (options.severity) {
    whereClause.severity = options.severity;
  }
  if (options.connectedAccountId) {
    whereClause.connectedAccountId = options.connectedAccountId;
  }

  const query = db.orm.public.SecurityEvent.where(whereClause);
  const totalAgg = await query.aggregate((e) => ({ count: e.count() }));
  const total = Number(totalAgg?.count || 0);

  const events = await query
    .orderBy((e) => e.createdAt.desc())
    .offset(offset)
    .limit(limit)
    .all();

  return {
    events,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: offset + events.length < total,
    },
  };
}

/**
 * Updates the status of a security event.
 *
 * @param {string} id
 * @param {'RAW'|'NORMALIZED'|'ANALYZED'|'CORRELATED'|'DISMISSED'} status
 * @returns {Promise<object>}
 */
async function updateStatus(id, status) {
  const db = getDb();
  await db.orm.public.SecurityEvent.where({ id }).update({
    status,
    updatedAt: new Date().toISOString(),
  });
  return await findById(id);
}

module.exports = {
  findById,
  findByAccountAndProviderEventId,
  create,
  listByUserId,
  updateStatus,
};

