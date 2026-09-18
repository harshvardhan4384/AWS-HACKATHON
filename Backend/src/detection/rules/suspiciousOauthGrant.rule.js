'use strict';

const BaseDetectionRule = require('./base.rule');

/**
 * Rule: NEW_OAUTH_GRANT
 *
 * Triggered whenever an OAUTH_GRANTED event is observed. OAuth grants expand
 * the attack surface by authorizing third-party applications to access the account.
 * Unexpected grants may indicate account compromise.
 */
class SuspiciousOauthGrantRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'NEW_OAUTH_GRANT',
      name: 'New OAuth Authorization Grant',
      description: 'Triggers on any OAUTH_GRANTED event. Third-party access was authorized.',
      providers: [],
      eventTypes: ['OAUTH_GRANTED'],
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
      confidence: 0.8,
      summary: `New OAuth authorization grant issued on ${event.provider} account.`,
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

module.exports = SuspiciousOauthGrantRule;
