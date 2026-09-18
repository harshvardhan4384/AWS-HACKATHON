'use strict';

const { getDb } = require('../lib/db');
const config = require('../config/env');

/**
 * Provides bounded, structured context data to detection rules.
 *
 * DESIGN PRINCIPLES:
 * - Rules NEVER query the database directly — all data access is here.
 * - All queries are bounded by time windows and row limits to prevent full-table scans.
 * - Indexed fields only: userId, connectedAccountId, eventType, occurredAt/createdAt.
 * - Context is built once per detection run and passed to all rules.
 */
class DetectionContextService {
  /**
   * Builds a full DetectionContext for a given SecurityEvent.
   * Called once per event by DetectionService before evaluating any rules.
   *
   * @param {object} event - Full SecurityEvent record from the database
   * @returns {Promise<object>} context object
   */
  async buildContext(event) {
    const [
      recentLoginEvents,
      recentCredentialEvents,
      recentAccountEvents,
      knownIps,
      allUserProviderEvents,
    ] = await Promise.all([
      this.getRecentLoginEvents(event),
      this.getRecentCredentialEvents(event),
      this.getRecentAccountEvents(event),
      this.getKnownIps(event),
      this.getRecentUserProviderEvents(event),
    ]);

    return {
      event,
      recentLoginEvents,
      recentCredentialEvents,
      recentAccountEvents,
      knownIps,
      allUserProviderEvents,
    };
  }

  /**
   * Returns recent LOGIN events for the same connectedAccount within the lookback window.
   * Used by UNFAMILIAR_LOGIN and RAPID_CREDENTIAL_CREATION rules.
   *
   * @param {object} event - primary SecurityEvent
   * @returns {Promise<object[]>}
   */
  async getRecentLoginEvents(event) {
    if (!event.connectedAccountId) return [];

    const db = getDb();
    const lookbackMs = config.detectionUnfamiliarLoginLookbackDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - lookbackMs;

    // Fetch events excluding the current event itself
    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId: event.connectedAccountId,
      eventType: 'LOGIN',
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(200)
      .all();

    // Filter by time window (using numeric epoch comparison) and exclude primary event
    return events.filter(
      (e) => e.id !== event.id && new Date(e.occurredAt || e.createdAt).getTime() >= cutoffTime
    );
  }

  /**
   * Returns recent TOKEN_CREATED and SSH_KEY_CREATED events for the same connectedAccount
   * within the rapid-credential creation window.
   * Used by RAPID_CREDENTIAL_CREATION rule.
   *
   * @param {object} event - primary SecurityEvent
   * @returns {Promise<object[]>}
   */
  async getRecentCredentialEvents(event) {
    if (!event.connectedAccountId) return [];

    const db = getDb();
    const windowMs = config.detectionRapidCredentialWindowMinutes * 60 * 1000;
    const cutoffTime = Date.now() - windowMs;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId: event.connectedAccountId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(100)
      .all();

    return events.filter(
      (e) =>
        e.id !== event.id &&
        (e.eventType === 'TOKEN_CREATED' || e.eventType === 'SSH_KEY_CREATED') &&
        new Date(e.occurredAt || e.createdAt).getTime() >= cutoffTime
    );
  }

  /**
   * Returns all recent events for the same connectedAccount within the takeover window.
   * Used by POSSIBLE_ACCOUNT_TAKEOVER_CHAIN rule for sequence detection.
   *
   * @param {object} event - primary SecurityEvent
   * @returns {Promise<object[]>}
   */
  async getRecentAccountEvents(event) {
    if (!event.connectedAccountId) return [];

    const db = getDb();
    const windowMs = config.detectionTakeoverWindowMinutes * 60 * 1000;
    const cutoffTime = Date.now() - windowMs;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId: event.connectedAccountId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(200)
      .all();

    return events.filter(
      (e) => e.id !== event.id && new Date(e.occurredAt || e.createdAt).getTime() >= cutoffTime
    );
  }

  /**
   * Returns distinct source IPs from historical LOGIN events for the same connectedAccount
   * within the lookback window. Used by UNFAMILIAR_LOGIN rule.
   *
   * @param {object} event - primary SecurityEvent
   * @returns {Promise<Set<string>>} set of known IP addresses
   */
  async getKnownIps(event) {
    if (!event.connectedAccountId) return new Set();

    const db = getDb();
    const lookbackMs = config.detectionUnfamiliarLoginLookbackDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - lookbackMs;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId: event.connectedAccountId,
      eventType: 'LOGIN',
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(500)
      .all();

    const knownIps = new Set();
    for (const e of events) {
      // Exclude the current event — we want PRIOR known IPs only
      if (e.id !== event.id && e.sourceIp && new Date(e.occurredAt || e.createdAt).getTime() >= cutoffTime) {
        knownIps.add(e.sourceIp);
      }
    }
    return knownIps;
  }

  /**
   * Returns all recent events for the same user across ALL connected accounts
   * within the cross-account window.
   * Used by CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY rule.
   *
   * @param {object} event - primary SecurityEvent
   * @returns {Promise<object[]>}
   */
  async getRecentUserProviderEvents(event) {
    const db = getDb();
    const windowMs = config.detectionCrossAccountWindowMinutes * 60 * 1000;
    const cutoffTime = Date.now() - windowMs;

    const events = await db.orm.public.SecurityEvent.where({
      userId: event.userId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(500)
      .all();

    return events.filter(
      (e) => e.id !== event.id && new Date(e.occurredAt || e.createdAt).getTime() >= cutoffTime
    );
  }
}

module.exports = new DetectionContextService();
