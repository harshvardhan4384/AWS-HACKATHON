'use strict';

const BaseDetectionRule = require('./base.rule');

/**
 * Rule: NEW_SSH_KEY
 *
 * Triggered whenever an SSH_KEY_CREATED event is observed on any connected account.
 * SSH key creation is a high-severity signal because an attacker who creates an SSH key
 * gains persistent access that survives password resets.
 */
class NewSshKeyRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'NEW_SSH_KEY',
      name: 'New SSH Key Created',
      description: 'Triggers on any SSH_KEY_CREATED event. Persistent access credential detected.',
      providers: [],
      eventTypes: ['SSH_KEY_CREATED'],
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
      summary: `New SSH key created on ${event.provider} account.`,
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

module.exports = NewSshKeyRule;
