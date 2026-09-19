'use strict';

/**
 * Policy Rules & Reason Codes — Task 14
 *
 * Deterministic policy decision constants and structured reason codes.
 * Zero LLM involvement.
 */

const POLICY_DECISIONS = Object.freeze({
  ALLOW: 'ALLOW',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  DENY: 'DENY',
});

const POLICY_REASON_CODES = Object.freeze({
  // Automation allowed
  LOW_RISK_AUTOMATION_ALLOWED: 'LOW_RISK_AUTOMATION_ALLOWED',
  KNOWN_MALICIOUS_OAUTH_AUTOMATION_ALLOWED: 'KNOWN_MALICIOUS_OAUTH_AUTOMATION_ALLOWED',

  // Approval required
  LOW_RISK_REQUIRES_APPROVAL: 'LOW_RISK_REQUIRES_APPROVAL',
  MEDIUM_RISK_REQUIRES_APPROVAL: 'MEDIUM_RISK_REQUIRES_APPROVAL',
  HIGH_RISK_REQUIRES_APPROVAL: 'HIGH_RISK_REQUIRES_APPROVAL',
  CRITICAL_ACTION_REQUIRES_APPROVAL: 'CRITICAL_ACTION_REQUIRES_APPROVAL',
  AUTOMATION_NOT_ENABLED: 'AUTOMATION_NOT_ENABLED',

  // Denials
  PROVIDER_CAPABILITY_UNSUPPORTED: 'PROVIDER_CAPABILITY_UNSUPPORTED',
  ACTION_NOT_ALLOWLISTED: 'ACTION_NOT_ALLOWLISTED',
  ACTION_ALREADY_EXECUTED: 'ACTION_ALREADY_EXECUTED',
  ACTION_OWNERSHIP_MISMATCH: 'ACTION_OWNERSHIP_MISMATCH',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  DESTRUCTIVE_ACTION_DENIED: 'DESTRUCTIVE_ACTION_DENIED',
  APPROVAL_EXPIRED: 'APPROVAL_EXPIRED',
  AUTHORIZATION_INVALID: 'AUTHORIZATION_INVALID',
  ACTION_STATE_INVALID: 'ACTION_STATE_INVALID',
  ACTION_HASH_MISMATCH: 'ACTION_HASH_MISMATCH',
  ACTION_NOT_FOUND: 'ACTION_NOT_FOUND',
  INCIDENT_NOT_FOUND: 'INCIDENT_NOT_FOUND',
});

/**
 * Checks if an evidence record indicates known malicious activity for an OAuth application.
 * Deterministic — checks structured evidenceData and evidenceType.
 *
 * @param {Array<object>} evidenceList
 * @param {string|null} targetId
 * @returns {boolean}
 */
function isKnownMaliciousOAuthEvidence(evidenceList, targetId) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
    return false;
  }

  for (const ev of evidenceList) {
    let data = ev.evidenceData;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
    }
    data = data || {};

    const type = String(ev.evidenceType || '').toUpperCase();

    // Check if evidence explicitly marks this target or general malicious OAuth
    const isTargetMatch =
      !targetId ||
      data.targetId === targetId ||
      data.appId === targetId ||
      data.connectedAccountId === targetId ||
      ev.connectedAccountId === targetId;

    const isMaliciousIndicator =
      data.isMalicious === true ||
      data.malicious === true ||
      data.knownMalicious === true ||
      data.classification === 'MALICIOUS' ||
      type === 'KNOWN_MALICIOUS_APP' ||
      type === 'MALICIOUS_OAUTH_APP' ||
      (type === 'SUSPICIOUS_OAUTH_GRANT' && (data.confidence >= 0.8 || data.severity === 'CRITICAL'));

    if (isTargetMatch && isMaliciousIndicator) {
      return true;
    }
  }

  return false;
}

module.exports = {
  POLICY_DECISIONS,
  POLICY_REASON_CODES,
  isKnownMaliciousOAuthEvidence,
};

