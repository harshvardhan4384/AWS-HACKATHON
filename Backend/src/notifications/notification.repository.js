'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const { redactSensitive } = require('../utils/redaction');

/**
 * NotificationRepository — Manages notification records, pagination, filtering,
 * read tracking, and deduplication.
 *
 * Designed to satisfy Section 86 ("If Notification persistence can be implemented
 * using existing structures: do not add schema"). Thread-safe and resilient.
 */
class NotificationRepository {
  constructor() {
    // Map<id, NotificationObject>
    this._notifications = new Map();
    // Map<deduplicationKey, { id, createdAt }>
    this._dedupCache = new Map();
  }

  /**
   * Resets all stored notifications (useful in test runs).
   */
  clear() {
    this._notifications.clear();
    this._dedupCache.clear();
  }

  /**
   * Creates and stores a new notification with deduplication protection.
   *
   * @param {object} data
   * @param {string} data.userId
   * @param {string} data.type
   * @param {string} data.severity
   * @param {string} data.title
   * @param {string} data.message
   * @param {string|null} [data.incidentId]
   * @param {string|null} [data.recoveryActionId]
   * @param {string|null} [data.approvalId]
   * @param {string|null} [data.correlationId]
   * @param {object|null} [data.metadata]
   * @param {string|null} [data.deduplicationKey]
   * @param {number} [data.dedupWindowMs=300000] - 5 minutes default
   * @returns {Promise<{ notification: object, isDuplicate: boolean }>}
   */
  async create(data) {
    if (!data.userId) throw new Error('userId is required for notification');
    if (!data.type) throw new Error('type is required for notification');
    if (!data.title) throw new Error('title is required for notification');

    const dedupWindowMs = data.dedupWindowMs || 300000;
    const now = Date.now();

    // ── Deduplication Check ──────────────────────────────────────────────────
    if (data.deduplicationKey) {
      const existingDedup = this._dedupCache.get(data.deduplicationKey);
      if (existingDedup && (now - existingDedup.timestamp) < dedupWindowMs) {
        const existingNotif = this._notifications.get(existingDedup.id);
        if (existingNotif) {
          return { notification: existingNotif, isDuplicate: true };
        }
      }
    }

    const id = data.id || crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const notification = {
      id,
      userId: data.userId,
      type: data.type,
      severity: data.severity || 'INFO',
      title: data.title,
      message: data.message || '',
      incidentId: data.incidentId || null,
      recoveryActionId: data.recoveryActionId || null,
      approvalId: data.approvalId || null,
      correlationId: data.correlationId || null,
      metadata: data.metadata ? redactSensitive(data.metadata) : null,
      read: false,
      readAt: null,
      createdAt,
    };

    this._notifications.set(id, notification);

    if (data.deduplicationKey) {
      this._dedupCache.set(data.deduplicationKey, { id, timestamp: now });
    }

    return { notification, isDuplicate: false };
  }

  /**
   * Finds a notification by primary key ID.
   *
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    if (!id) return null;
    return this._notifications.get(id) || null;
  }

  /**
   * Lists notifications for a user with bounded pagination and safe filtering.
   *
   * @param {string} userId
   * @param {object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   * @param {boolean} [options.unreadOnly=false]
   * @param {string} [options.severity]
   * @param {string} [options.type]
   * @param {string} [options.incidentId]
   * @returns {Promise<{ notifications: Array<object>, pagination: object }>}
   */
  async listByUserId(userId, options = {}) {
    if (!userId) return { notifications: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false } };

    const maxPageSize = config.maxNotificationPageSize || 100;
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), maxPageSize);
    const page = Math.max(parseInt(options.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    // Filter user's notifications
    let filtered = [];
    for (const notif of this._notifications.values()) {
      if (notif.userId !== userId) continue;

      if (options.unreadOnly === true && notif.read) continue;
      if (options.severity && notif.severity !== options.severity) continue;
      if (options.type && notif.type !== options.type) continue;
      if (options.incidentId && notif.incidentId !== options.incidentId) continue;

      filtered.push(notif);
    }

    // Sort createdAt descending
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      notifications: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + paginated.length < total,
      },
    };
  }

  /**
   * Counts unread notifications for a user.
   *
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countUnreadByUserId(userId) {
    if (!userId) return 0;
    let count = 0;
    for (const notif of this._notifications.values()) {
      if (notif.userId === userId && !notif.read) {
        count++;
      }
    }
    return count;
  }

  /**
   * Marks a notification as read verifying tenant ownership.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|null>} Updated notification or null if not found/unauthorized
   */
  async markAsRead(id, userId) {
    const notif = this._notifications.get(id);
    if (!notif || notif.userId !== userId) {
      return null;
    }

    notif.read = true;
    notif.readAt = new Date().toISOString();
    return notif;
  }

  /**
   * Marks all notifications for a user as read.
   *
   * @param {string} userId
   * @returns {Promise<number>} Count of updated notifications
   */
  async markAllAsRead(userId) {
    if (!userId) return 0;
    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const notif of this._notifications.values()) {
      if (notif.userId === userId && !notif.read) {
        notif.read = true;
        notif.readAt = now;
        updatedCount++;
      }
    }
    return updatedCount;
  }

  /**
   * Cleans notifications older than retentionDays.
   *
   * @param {number} [retentionDays=30]
   * @returns {Promise<number>} Count removed
   */
  async cleanExpired(retentionDays = config.notificationRetentionDays || 30) {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    let removed = 0;

    for (const [id, notif] of this._notifications.entries()) {
      if (new Date(notif.createdAt).getTime() < cutoff) {
        this._notifications.delete(id);
        removed++;
      }
    }

    return removed;
  }
}

const notificationRepository = new NotificationRepository();

module.exports = {
  NotificationRepository,
  notificationRepository,
};

