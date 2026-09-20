'use strict';

/**
 * Re:COVER Deterministic Risk Engine
 *
 * Input:  Array of Finding objects (from detection rules)
 * Output: { riskScore, severity, factors, explanation }
 *
 * GUARANTEES:
 * - Same findings → same output, always (no randomness, no LLM, no external calls)
 * - Score is 0–100, capped with Math.min(total, 100)
 * - Each finding type is counted at most once (deduplication prevents score inflation)
 * - Severity mapping is deterministic threshold-based (not fuzzy)
 * - Confidence (0.0–1.0) is evidence confidence, NOT attacker probability
 *
 * SCORE CONTRIBUTIONS (per finding type, each counted at most once):
 *   UNFAMILIAR_LOGIN               → 25 points
 *   NEW_SSH_KEY                    → 30 points
 *   NEW_CREDENTIAL_CREATED         → 30 points
 *   NEW_OAUTH_GRANT                → 20 points
 *   SECURITY_SETTING_CHANGED       → 25 points
 *   RAPID_CREDENTIAL_CREATION      → 20 points
 *   POSSIBLE_ACCOUNT_TAKEOVER_CHAIN → 30 points
 *   CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY → 20 points
 *
 * SEVERITY THRESHOLDS:
 *   0–19:   INFO
 *   20–39:  LOW
 *   40–59:  MEDIUM
 *   60–79:  HIGH
 *   80–100: CRITICAL
 */

/** @type {Object.<string, number>} Score contribution per finding type */
const SCORE_CONTRIBUTIONS = {
  UNFAMILIAR_LOGIN: 25,
  SUSPICIOUS_LOGIN: 40,
  NEW_SSH_KEY: 30,
  NEW_CREDENTIAL_CREATED: 30,
  NEW_OAUTH_GRANT: 20,
  SECURITY_SETTING_CHANGED: 25,
  RAPID_CREDENTIAL_CREATION: 20,
  POSSIBLE_ACCOUNT_TAKEOVER_CHAIN: 30,
  CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY: 20,
};

/**
 * Maps a numeric risk score (0–100) to a severity label.
 * Thresholds are deterministic.
 *
 * @param {number} score
 * @returns {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'}
 */
function scoreToSeverity(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'INFO';
}

/**
 * Builds a human-readable explanation string from risk factors.
 *
 * @param {object[]} factors
 * @param {number} riskScore
 * @returns {string}
 */
function buildExplanation(factors, riskScore) {
  if (factors.length === 0) {
    return 'No risk factors detected. Score is 0.';
  }

  const factorDescriptions = factors.map(
    (f) => `${f.type} (+${f.contribution}, confidence ${f.confidence.toFixed(2)})`
  );

  return `Risk score ${riskScore}/100 based on: ${factorDescriptions.join('; ')}.`;
}

/**
 * Calculates a deterministic risk score and severity from an array of findings.
 *
 * @param {object[]} findings - Array of Finding objects from detection rules
 * @param {string} findings[].type - Finding type (e.g. 'UNFAMILIAR_LOGIN')
 * @param {number} findings[].confidence - Confidence score 0.0–1.0
 * @returns {{ riskScore: number, severity: string, factors: object[], explanation: string }}
 */
function calculate(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return {
      riskScore: 0,
      severity: 'INFO',
      factors: [],
      explanation: 'No findings detected. Risk score is 0.',
    };
  }

  // Deduplicate by finding type — each type contributes at most once
  const seen = new Set();
  const factors = [];
  let rawScore = 0;

  for (const finding of findings) {
    if (!finding || !finding.type) continue;
    if (seen.has(finding.type)) continue;

    seen.add(finding.type);

    let contribution = SCORE_CONTRIBUTIONS[finding.type] || 0;
    if (finding.severity === 'INFO') {
      contribution = 0;
    }
    if (contribution > 0) {
      factors.push({
        type: finding.type,
        contribution,
        confidence: typeof finding.confidence === 'number' ? finding.confidence : 0,
        severity: finding.severity,
      });
      rawScore += contribution;
    }
  }

  const riskScore = Math.min(rawScore, 100);
  const severity = scoreToSeverity(riskScore);
  const explanation = buildExplanation(factors, riskScore);

  return {
    riskScore,
    severity,
    factors,
    explanation,
  };
}

module.exports = {
  calculate,
  scoreToSeverity,
  SCORE_CONTRIBUTIONS,
};
