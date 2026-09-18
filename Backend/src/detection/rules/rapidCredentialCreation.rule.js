'use strict';

const BaseDetectionRule = require('./base.rule');
const config = require('../../config/env');

/**
 * Rule: RAPID_CREDENTIAL_CREATION
 *
 * Triggered when a TOKEN_CREATED or SSH_KEY_CREATED event occurs within the
 * configurable rapid-credential window after a LOGIN on the same connected account.
 *
 * Pattern: LOGIN → TOKEN_CREATED|SSH_KEY_CREATED (within N minutes)
 *
 * This pattern is consistent with an attacker who gains access via login and
 * immediately creates credentials for persistent access.
 *
 * SECURITY: Only reads structured fields (eventType, occurredAt/createdAt, connectedAccountId).
 * Does NOT inspect eventData content.
 */
class RapidCredentialCreationRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'RAPID_CREDENTIAL_CREATION',
      name: 'Rapid Credential Creation After Login',
      description: `Triggers when TOKEN_CREATED or SSH_KEY_CREATED follows a LOGIN within ${config.detectionRapidCredentialWindowMinutes} minutes on the same account.`,
      providers: [],
      eventTypes: ['TOKEN_CREATED', 'SSH_KEY_CREATED'],
      severity: 'HIGH',
      enabled: true,
    });
  }

  async evaluate(context) {
    const { event, recentLoginEvents } = context;

    if (!event.connectedAccountId) return null;
    if (recentLoginEvents.length === 0) return null;

    const eventTime = new Date(event.occurredAt || event.createdAt).getTime();
    const windowMs = config.detectionRapidCredentialWindowMinutes * 60 * 1000;

    // Find LOGIN events that occurred within the window BEFORE the credential event
    const precedingLogins = recentLoginEvents.filter((loginEvent) => {
      const loginTime = new Date(loginEvent.occurredAt || loginEvent.createdAt).getTime();
      const timeDiff = eventTime - loginTime;
      // Login must precede credential creation, within window
      return timeDiff >= 0 && timeDiff <= windowMs;
    });

    if (precedingLogins.length === 0) return null;

    const closestLogin = precedingLogins.reduce((prev, curr) => {
      const prevDiff = Math.abs(eventTime - new Date(prev.occurredAt || prev.createdAt).getTime());
      const currDiff = Math.abs(eventTime - new Date(curr.occurredAt || curr.createdAt).getTime());
      return currDiff < prevDiff ? curr : prev;
    });

    const minutesSinceLogin = Math.round(
      (eventTime - new Date(closestLogin.occurredAt || closestLogin.createdAt).getTime()) / 60000
    );

    return {
      ruleId: this.id,
      type: this.id,
      severity: 'HIGH',
      confidence: 0.8,
      summary: `${event.eventType} occurred ${minutesSinceLogin} minute(s) after a LOGIN on the same account — rapid credential creation pattern detected.`,
      relatedEventIds: precedingLogins.map((e) => e.id),
      metadata: {
        credentialEventType: event.eventType,
        connectedAccountId: event.connectedAccountId,
        precedingLoginCount: precedingLogins.length,
        closestLoginId: closestLogin.id,
        minutesSinceLogin,
        windowMinutes: config.detectionRapidCredentialWindowMinutes,
      },
    };
  }
}

module.exports = RapidCredentialCreationRule;
