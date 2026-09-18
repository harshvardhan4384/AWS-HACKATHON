'use strict';

const BaseDetectionRule = require('./base.rule');
const config = require('../../config/env');

/**
 * Rule: POSSIBLE_ACCOUNT_TAKEOVER_CHAIN
 *
 * Triggered when a REPOSITORY_ACCESS event is preceded by all of:
 * - A LOGIN on the same connected account (within the takeover window)
 * - A TOKEN_CREATED or SSH_KEY_CREATED on the same connected account (within the takeover window)
 *
 * Pattern: LOGIN → (TOKEN_CREATED | SSH_KEY_CREATED) → REPOSITORY_ACCESS
 *
 * This three-event sequence within a short window is highly consistent with
 * a post-compromise takeover pattern: attacker logs in, creates persistence credential,
 * then accesses resources.
 *
 * SECURITY: Only reads structured fields. Does NOT inspect eventData content.
 * This is a correlation rule — all three events must exist in context window.
 */
class LoginCredentialAccessRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'POSSIBLE_ACCOUNT_TAKEOVER_CHAIN',
      name: 'Possible Account Takeover Chain Detected',
      description: `Triggers when REPOSITORY_ACCESS is preceded by LOGIN + credential creation within ${config.detectionTakeoverWindowMinutes} minutes on the same account.`,
      providers: [],
      eventTypes: ['REPOSITORY_ACCESS'],
      severity: 'CRITICAL',
      enabled: true,
    });
  }

  async evaluate(context) {
    const { event, recentAccountEvents } = context;

    if (!event.connectedAccountId) return null;
    if (recentAccountEvents.length === 0) return null;

    const eventTime = new Date(event.occurredAt || event.createdAt).getTime();
    const windowMs = config.detectionTakeoverWindowMinutes * 60 * 1000;

    // Only consider events that occurred before this event within the window
    const windowEvents = recentAccountEvents.filter((e) => {
      const t = new Date(e.occurredAt || e.createdAt).getTime();
      return t <= eventTime && eventTime - t <= windowMs;
    });

    const loginEvents = windowEvents.filter((e) => e.eventType === 'LOGIN');
    const credentialEvents = windowEvents.filter(
      (e) => e.eventType === 'TOKEN_CREATED' || e.eventType === 'SSH_KEY_CREATED'
    );

    // Require at least one login AND one credential event to trigger
    if (loginEvents.length === 0 || credentialEvents.length === 0) return null;

    const earliestLogin = loginEvents.reduce((prev, curr) => {
      return new Date(prev.occurredAt || prev.createdAt) < new Date(curr.occurredAt || curr.createdAt)
        ? prev
        : curr;
    });

    const latestCredential = credentialEvents.reduce((prev, curr) => {
      return new Date(prev.occurredAt || prev.createdAt) > new Date(curr.occurredAt || curr.createdAt)
        ? prev
        : curr;
    });

    const totalWindowMinutes = Math.round((eventTime - new Date(earliestLogin.occurredAt || earliestLogin.createdAt).getTime()) / 60000);

    return {
      ruleId: this.id,
      type: this.id,
      severity: 'CRITICAL',
      confidence: 0.75,
      summary: `Possible account takeover chain: LOGIN → credential creation → REPOSITORY_ACCESS within ${totalWindowMinutes} minute(s).`,
      relatedEventIds: [
        ...loginEvents.map((e) => e.id),
        ...credentialEvents.map((e) => e.id),
      ],
      metadata: {
        connectedAccountId: event.connectedAccountId,
        loginEventCount: loginEvents.length,
        credentialEventCount: credentialEvents.length,
        earliestLoginId: earliestLogin.id,
        latestCredentialId: latestCredential.id,
        latestCredentialType: latestCredential.eventType,
        totalWindowMinutes,
        windowMinutes: config.detectionTakeoverWindowMinutes,
        chainPattern: ['LOGIN', latestCredential.eventType, 'REPOSITORY_ACCESS'],
      },
    };
  }
}

module.exports = LoginCredentialAccessRule;
