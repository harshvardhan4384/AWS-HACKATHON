'use strict';

const { PERSISTENCE_STATUS, SUSPICIOUS_POST_RECOVERY_EVENTS } = require('./verificationTypes');
const config = require('../config/env');

/**
 * PersistenceDetector — inspects post-recovery state, resource baseline differences,
 * and security events to detect attacker persistence mechanisms.
 *
 * Guarantees:
 * - Legitimate untargeted resources are NEVER falsely flagged as persistence.
 * - Targeted resources that remain active are deterministically classified as PERSISTENCE_FOUND.
 * - Newly created / unexpected active credentials or grants are flagged.
 * - Bounded inspection: honors maxPersistenceItems and maxPostRecoveryEvents.
 * - Secret-free: never leaks secrets or tokens in output items.
 */
class PersistenceDetector {
  /**
   * Evaluates provider state and baseline resources for persistence.
   *
   * @param {object} params
   * @param {string} params.actionType - RecoveryActionType enum
   * @param {string} params.targetId - ID of targeted resource
   * @param {string} params.primaryObservedState - Observed state of targeted resource
   * @param {Array<object>} [params.currentResources] - List of current resources from provider
   * @param {Array<string>} [params.knownLegitimateIds] - Known baseline resource IDs
   * @returns {{ status: string, items: Array<object> }}
   */
  evaluateResourcePersistence({
    actionType,
    targetId,
    primaryObservedState,
    currentResources = [],
    knownLegitimateIds = [],
  }) {
    const items = [];
    const maxItems = config.maxPersistenceItems || 100;
    const legitimateSet = new Set(knownLegitimateIds || []);

    // 1. Check if the specifically targeted resource is still active
    const targetStillActive = primaryObservedState === 'ACTIVE' || primaryObservedState === 'active';
    if (targetStillActive) {
      items.push({
        type: this._mapActionToResourceType(actionType),
        id: targetId,
        reason: `Targeted resource '${targetId}' remains active following recovery execution`,
        evidenceReferences: [`action:${targetId}`],
      });
    }

    // 2. Inspect remaining current resources against baseline
    for (const resource of currentResources) {
      if (items.length >= maxItems) break;

      const resId = resource.id;
      // Skip if this is the targeted resource (already checked above)
      if (resId === targetId) continue;

      // Legitimate untargeted resource: do NOT flag!
      if (legitimateSet.has(resId)) continue;

      // If resource is marked revoked/removed/inactive, it is not persistence
      const state = (resource.status || resource.state || '').toLowerCase();
      if (['revoked', 'removed', 'terminated', 'disabled', 'inactive'].includes(state)) {
        continue;
      }

      // Found an unexpected active resource not in legitimate baseline
      items.push({
        type: this._mapActionToResourceType(actionType),
        id: resId,
        reason: `Unexpected active resource '${resId}' detected outside legitimate baseline`,
        evidenceReferences: [`resource:${resId}`],
      });
    }

    let status = PERSISTENCE_STATUS.NO_PERSISTENCE;
    if (items.length > 0) {
      status = PERSISTENCE_STATUS.PERSISTENCE_FOUND;
    }

    return { status, items };
  }

  /**
   * Evaluates security events occurring in the post-recovery time window.
   *
   * @param {object} params
   * @param {string} params.executedAt - Timestamp of recovery action execution
   * @param {Array<object>} params.securityEvents - Events to inspect
   * @param {number} [params.windowMinutes] - Configurable window in minutes
   * @returns {{ status: string, items: Array<object>, eventsEvaluated: number }}
   */
  evaluatePostRecoveryEvents({
    executedAt,
    securityEvents = [],
    windowMinutes = config.verificationEventWindowMinutes,
  }) {
    const items = [];
    const maxEvents = config.maxPostRecoveryEvents || 100;
    const maxItems = config.maxPersistenceItems || 100;

    const execTime = new Date(executedAt).getTime();
    if (isNaN(execTime)) {
      return {
        status: PERSISTENCE_STATUS.INCONCLUSIVE,
        items: [],
        eventsEvaluated: 0,
        warning: 'Invalid executedAt timestamp',
      };
    }

    const windowEnd = execTime + (windowMinutes * 60 * 1000);
    const seenEventIds = new Set();
    let evaluatedCount = 0;

    for (const event of securityEvents) {
      if (evaluatedCount >= maxEvents || items.length >= maxItems) break;

      // Handle duplicate events
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);

      // Handle missing timestamps safely
      const eventTimeRaw = event.occurredAt || event.createdAt;
      if (!eventTimeRaw) continue;

      const eventTime = new Date(eventTimeRaw).getTime();
      if (isNaN(eventTime)) continue;

      // Boundary Check: Must fall strictly inside [executedAt, executedAt + windowMinutes]
      if (eventTime < execTime || eventTime > windowEnd) {
        continue;
      }

      evaluatedCount++;

      // Check if eventType indicates suspicious post-recovery attacker activity
      if (SUSPICIOUS_POST_RECOVERY_EVENTS.includes(event.eventType)) {
        items.push({
          type: 'POST_RECOVERY_EVENT',
          id: event.id,
          eventType: event.eventType,
          occurredAt: eventTimeRaw,
          reason: `Suspicious post-recovery event '${event.eventType}' detected within ${windowMinutes}-minute window`,
          evidenceReferences: [`event:${event.id}`],
        });
      }
    }

    let status = PERSISTENCE_STATUS.NO_PERSISTENCE;
    if (items.length > 0) {
      status = PERSISTENCE_STATUS.PERSISTENCE_FOUND;
    }

    return {
      status,
      items,
      eventsEvaluated: evaluatedCount,
    };
  }

  /**
   * Aggregates multiple persistence evaluation results into a single deterministic classification.
   *
   * @param {Array<{ status: string, items: Array<object> }>} results
   * @returns {{ status: string, items: Array<object>, requiresInvestigation: boolean }}
   */
  aggregatePersistence(results = []) {
    const allItems = [];
    let hasPersistenceFound = false;
    let hasPossiblePersistence = false;
    let hasInconclusive = false;

    for (const res of results) {
      if (!res) continue;
      if (Array.isArray(res.items)) {
        allItems.push(...res.items);
      }
      if (res.status === PERSISTENCE_STATUS.PERSISTENCE_FOUND) {
        hasPersistenceFound = true;
      } else if (res.status === PERSISTENCE_STATUS.POSSIBLE_PERSISTENCE) {
        hasPossiblePersistence = true;
      } else if (res.status === PERSISTENCE_STATUS.INCONCLUSIVE) {
        hasInconclusive = true;
      }
    }

    let status = PERSISTENCE_STATUS.NO_PERSISTENCE;
    if (hasPersistenceFound || allItems.length > 0) {
      status = PERSISTENCE_STATUS.PERSISTENCE_FOUND;
    } else if (hasPossiblePersistence) {
      status = PERSISTENCE_STATUS.POSSIBLE_PERSISTENCE;
    } else if (hasInconclusive) {
      status = PERSISTENCE_STATUS.INCONCLUSIVE;
    }

    return {
      status,
      items: allItems.slice(0, config.maxPersistenceItems || 100),
      requiresInvestigation: status === PERSISTENCE_STATUS.PERSISTENCE_FOUND,
    };
  }

  /**
   * Maps actionType to human-readable resource type.
   * @private
   */
  _mapActionToResourceType(actionType) {
    switch (actionType) {
      case 'REVOKE_OAUTH': return 'OAUTH_APP';
      case 'REVOKE_TOKEN': return 'ACCESS_TOKEN';
      case 'TERMINATE_SESSION': return 'SESSION';
      case 'REMOVE_SSH_KEY': return 'SSH_KEY';
      case 'DISABLE_INTEGRATION': return 'CONNECTED_ACCOUNT';
      default: return 'RESOURCE';
    }
  }
}

const persistenceDetector = new PersistenceDetector();

module.exports = {
  PersistenceDetector,
  persistenceDetector,
};

