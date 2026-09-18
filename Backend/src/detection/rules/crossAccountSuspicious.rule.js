'use strict';

const BaseDetectionRule = require('./base.rule');
const config = require('../../config/env');

/**
 * Rule: CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY
 *
 * Triggered when the same Re:COVER user has LOGIN or SESSION_CREATED events
 * on 2 or more DIFFERENT connected provider accounts within the configured
 * cross-account detection window.
 *
 * Rationale: Simultaneous or near-simultaneous logins across multiple accounts
 * may indicate credential stuffing, account compromise propagation, or stolen
 * session reuse.
 *
 * NOTE: This rule evaluates the primary event against ALL of the user's recent
 * cross-account activity — not just the connected account of the primary event.
 *
 * SECURITY: Only reads structured fields (eventType, connectedAccountId).
 * Does NOT inspect eventData content.
 */
class CrossAccountSuspiciousRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY',
      name: 'Suspicious Cross-Account Activity',
      description: `Triggers when the same user has LOGIN/SESSION_CREATED events across ≥2 different connected accounts within ${config.detectionCrossAccountWindowMinutes} minutes.`,
      providers: [],
      eventTypes: ['LOGIN', 'SESSION_CREATED'],
      severity: 'HIGH',
      enabled: true,
    });
  }

  async evaluate(context) {
    const { event, allUserProviderEvents } = context;

    if (!event.connectedAccountId) return null;

    // Only look at LOGIN and SESSION_CREATED events across ALL user accounts within window
    const crossAccountLoginEvents = allUserProviderEvents.filter(
      (e) =>
        (e.eventType === 'LOGIN' || e.eventType === 'SESSION_CREATED') &&
        e.connectedAccountId &&
        e.connectedAccountId !== event.connectedAccountId
    );

    if (crossAccountLoginEvents.length === 0) return null;

    // Count distinct connected accounts with login/session activity
    const activeAccountIds = new Set(crossAccountLoginEvents.map((e) => e.connectedAccountId));
    // Include the primary event's account
    activeAccountIds.add(event.connectedAccountId);

    // Require at least 2 distinct accounts
    if (activeAccountIds.size < 2) return null;

    const relatedEventIds = [...new Set(crossAccountLoginEvents.map((e) => e.id))];

    return {
      ruleId: this.id,
      type: this.id,
      severity: 'HIGH',
      confidence: 0.65,
      summary: `Login/session activity detected across ${activeAccountIds.size} connected accounts within ${config.detectionCrossAccountWindowMinutes} minutes.`,
      relatedEventIds,
      metadata: {
        primaryConnectedAccountId: event.connectedAccountId,
        activeAccountCount: activeAccountIds.size,
        activeAccountIds: Array.from(activeAccountIds),
        crossAccountEventCount: crossAccountLoginEvents.length,
        windowMinutes: config.detectionCrossAccountWindowMinutes,
      },
    };
  }
}

module.exports = CrossAccountSuspiciousRule;
