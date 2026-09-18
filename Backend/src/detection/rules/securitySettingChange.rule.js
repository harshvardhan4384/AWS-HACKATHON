'use strict';

const BaseDetectionRule = require('./base.rule');

/**
 * Rule: SECURITY_SETTING_CHANGED
 *
 * Triggered whenever a SECURITY_SETTING_CHANGED event is observed.
 * Security setting modifications (2FA disable, trusted device removal, etc.)
 * are high-severity signals regardless of who performed them.
 */
class SecuritySettingChangeRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'SECURITY_SETTING_CHANGED',
      name: 'Security Setting Modified',
      description: 'Triggers on any SECURITY_SETTING_CHANGED event. Security posture may be weakened.',
      providers: [],
      eventTypes: ['SECURITY_SETTING_CHANGED'],
      severity: 'HIGH',
      enabled: true,
    });
  }

  async evaluate(context) {
    const { event } = context;

    return {
      ruleId: this.id,
      type: this.id,
      severity: 'HIGH',
      confidence: 0.9,
      summary: `Security setting changed on ${event.provider} account.`,
      relatedEventIds: [],
      metadata: {
        provider: event.provider,
        eventType: event.eventType,
        connectedAccountId: event.connectedAccountId,
        occurredAt: event.occurredAt || event.createdAt,
      },
    };
  }
}

module.exports = SecuritySettingChangeRule;
