'use strict';

const BaseDetectionRule = require('./base.rule');
const config = require('../../config/env');

/**
 * Rule: UNFAMILIAR_LOGIN
 *
 * Triggered when a LOGIN event originates from an IP address not seen
 * in the user's login history for the same connected account during
 * the configured lookback window.
 *
 * SECURITY: Reads only event.sourceIp (a structured field). Does NOT
 * read eventData content. IP is compared to a set of historically observed
 * IPs — no external IP reputation services are called.
 */
class UnfamiliarLoginRule extends BaseDetectionRule {
  constructor() {
    super({
      id: 'UNFAMILIAR_LOGIN',
      name: 'Login from Unfamiliar IP',
      description: `Triggers when a LOGIN event originates from an IP not seen in the last ${config.detectionUnfamiliarLoginLookbackDays} days for this account.`,
      providers: [],
      eventTypes: ['LOGIN'],
      severity: 'MEDIUM',
      enabled: true,
    });
  }

  async evaluate(context) {
    const { event, knownIps } = context;

    // Cannot determine unfamiliarity without source IP
    if (!event.sourceIp) return null;

    if (knownIps.size === 0) {
      // First observed login for this account — no baseline exists
      return {
        ruleId: this.id,
        type: this.id,
        severity: 'INFO',
        confidence: 0.3,
        summary: 'First login observed for this connected account — no historical IP baseline exists.',
        relatedEventIds: [],
        metadata: {
          observedIp: event.sourceIp,
          knownIpCount: 0,
          lookbackDays: config.detectionUnfamiliarLoginLookbackDays,
          note: 'First-ever login event for this account.',
        },
      };
    }

    if (!knownIps.has(event.sourceIp)) {
      return {
        ruleId: this.id,
        type: this.id,
        severity: 'MEDIUM',
        confidence: 0.7,
        summary: `Login from IP ${event.sourceIp} — not seen in the last ${config.detectionUnfamiliarLoginLookbackDays} days for this account.`,
        relatedEventIds: [],
        metadata: {
          observedIp: event.sourceIp,
          knownIpCount: knownIps.size,
          lookbackDays: config.detectionUnfamiliarLoginLookbackDays,
        },
      };
    }

    // IP is familiar — no finding
    return null;
  }
}

module.exports = UnfamiliarLoginRule;
