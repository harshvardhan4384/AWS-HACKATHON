'use strict';

const BaseDetectionRule = require('./base.rule');

/**
 * Rule: NEW_CREDENTIAL_CREATED
 *
 * Triggered whenever a TOKEN_CREATED event is observed (API tokens, PATs,
 * access keys). Credential creation may indicate legitimate developer activity
 * OR attacker persistence — context from correlation rules will elevate severity.
 */
class NewCredentialRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'NEW_CREDENTIAL_CREATED',
      name: 'New API Credential Created',
      description: 'Triggers on any TOKEN_CREATED event. Credential creation warrants awareness.',
      providers: [],
      eventTypes: ['TOKEN_CREATED'],
      severity: 'MEDIUM',
      enabled: true,
    });
  }

  async evaluate(context) {
    const { event } = context;

    return {
      ruleId: this.id,
      type: this.id,
      severity: 'MEDIUM',
      confidence: 0.9,
      summary: `New API credential (token) created on ${event.provider} account.`,
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

module.exports = NewCredentialRule;
