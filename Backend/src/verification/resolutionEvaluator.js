'use strict';

const { CHECK_STATUS, PERSISTENCE_STATUS, RESIDUAL_RISK } = require('./verificationTypes');
const config = require('../config/env');

/**
 * ResolutionEvaluator — Deterministic 8-condition gate for evaluating whether
 * a security incident may transition to RESOLVED status.
 *
 * Guarantees:
 * - Incident status is NEVER marked RESOLVED based on action execution alone.
 * - Every required condition must evaluate to true deterministically.
 * - Zero LLM authority: AI cannot override this evaluator.
 * - Residual risk is computed as a verification outcome and never alters Task 9 riskScore.
 */
class ResolutionEvaluator {
  /**
   * Evaluates whether an incident can be resolved based on authoritative verification results.
   *
   * @param {object} params
   * @param {Array<object>} params.recoveryActions - All recovery actions for the incident
   * @param {Array<object>} params.verificationChecks - All verification checks produced
   * @param {object} params.persistence - Aggregated persistence result
   * @param {boolean} params.providerStateVerified - Whether provider state was verified
   * @param {boolean} params.graphConsistent - Whether graph projection is consistent
   * @param {number} params.recoveryCycles - Number of recovery cycles attempted
   * @param {Array<object>} [params.suspiciousPostRecoveryEvents] - Unresolved post-recovery events
   * @returns {{
   *   canResolve: boolean,
   *   residualRisk: string,
   *   resolutionConditions: object,
   *   unresolvedReasons: string[]
   * }}
   */
  evaluateResolution({
    recoveryActions = [],
    verificationChecks = [],
    persistence = { status: PERSISTENCE_STATUS.NO_PERSISTENCE, items: [] },
    providerStateVerified = true,
    graphConsistent = true,
    recoveryCycles = 0,
    suspiciousPostRecoveryEvents = [],
  }) {
    const unresolvedReasons = [];
    const maxCycles = config.maxRecoveryCyclesPerIncident || 3;

    // ── Condition 1: Required recovery actions executed ─────────────────────
    const hasActions = recoveryActions.length > 0;
    const allActionsCompleted = hasActions && recoveryActions.every(
      (a) => a.status === 'COMPLETED'
    );
    if (!hasActions) {
      unresolvedReasons.push('NO_RECOVERY_ACTIONS_PLANNED_OR_EXECUTED');
    } else if (!allActionsCompleted) {
      unresolvedReasons.push('RECOVERY_ACTIONS_NOT_ALL_COMPLETED');
    }

    // ── Condition 2: Required verification checks passed ─────────────────────
    // At least one applicable check must exist and all non-N/A checks must PASS
    const activeChecks = verificationChecks.filter(
      (c) => c.status !== CHECK_STATUS.NOT_APPLICABLE
    );
    const hasActiveChecks = activeChecks.length > 0;
    const requiredChecksPassed = hasActiveChecks && activeChecks.every(
      (c) => c.status === CHECK_STATUS.PASS
    );
    if (!hasActiveChecks) {
      unresolvedReasons.push('NO_APPLICABLE_VERIFICATION_CHECKS_PERFORMED');
    } else if (!requiredChecksPassed) {
      unresolvedReasons.push('VERIFICATION_CHECKS_FAILED_OR_INCONCLUSIVE');
    }

    // ── Condition 3: No known persistence found ──────────────────────────────
    const noPersistence = persistence.status === PERSISTENCE_STATUS.NO_PERSISTENCE &&
      (!persistence.items || persistence.items.length === 0);
    if (!noPersistence) {
      unresolvedReasons.push('ATTACKER_PERSISTENCE_DETECTED');
    }

    // ── Condition 4: No critical verification gaps exist ─────────────────────
    const criticalChecksInconclusive = activeChecks.filter(
      (c) => c.status === CHECK_STATUS.INCONCLUSIVE && c.isCritical !== false
    );
    const noCriticalVerificationGaps = criticalChecksInconclusive.length === 0;
    if (!noCriticalVerificationGaps) {
      unresolvedReasons.push('CRITICAL_VERIFICATION_CHECK_INCONCLUSIVE');
    }

    // ── Condition 5: Provider state is sufficiently verified ─────────────────
    if (!providerStateVerified) {
      unresolvedReasons.push('PROVIDER_STATE_UNVERIFIED_OR_OUTAGE');
    }

    // ── Condition 6: No unresolved suspicious post-recovery events ───────────
    const noSuspiciousEvents = !suspiciousPostRecoveryEvents ||
      suspiciousPostRecoveryEvents.length === 0;
    if (!noSuspiciousEvents) {
      unresolvedReasons.push('UNRESOLVED_POST_RECOVERY_SUSPICIOUS_EVENTS');
    }

    // ── Condition 7: Recovery-cycle limit not exceeded ────────────────────────
    const cycleLimitNotExceeded = recoveryCycles < maxCycles;
    if (!cycleLimitNotExceeded) {
      unresolvedReasons.push('RECOVERY_CYCLE_LIMIT_EXCEEDED');
    }

    // ── Condition 8: Graph state is consistent (not blocking if provider state verified) ──
    const graphAcceptable = graphConsistent !== false;
    if (!graphAcceptable && !providerStateVerified) {
      unresolvedReasons.push('GRAPH_STALENESS_PREVENTS_RELIABLE_RESOLUTION');
    }

    // Evaluate overall resolution capability
    const canResolve = (
      allActionsCompleted &&
      requiredChecksPassed &&
      noPersistence &&
      noCriticalVerificationGaps &&
      providerStateVerified &&
      noSuspiciousEvents &&
      cycleLimitNotExceeded
    );

    // Calculate Residual Risk deterministically
    const residualRisk = this._calculateResidualRisk({
      canResolve,
      persistenceStatus: persistence.status,
      hasFailedChecks: activeChecks.some((c) => c.status === CHECK_STATUS.FAIL),
      hasInconclusiveChecks: activeChecks.some((c) => c.status === CHECK_STATUS.INCONCLUSIVE),
      providerStateVerified,
      cycleLimitExceeded: !cycleLimitNotExceeded,
    });

    return {
      canResolve,
      residualRisk,
      resolutionConditions: {
        requiredRecoveryActionsExecuted: allActionsCompleted,
        requiredChecksPassed,
        noPersistence,
        noCriticalVerificationGaps,
        providerStateVerified,
        noUnresolvedPostRecoverySuspiciousEvents: noSuspiciousEvents,
        recoveryCycleLimitNotExceeded: cycleLimitNotExceeded,
        graphAcceptable,
      },
      unresolvedReasons,
    };
  }

  /**
   * Calculates residual risk score based strictly on verification outcomes.
   * Does NOT alter Task 9 risk scores.
   * @private
   */
  _calculateResidualRisk({
    canResolve,
    persistenceStatus,
    hasFailedChecks,
    hasInconclusiveChecks,
    providerStateVerified,
    cycleLimitExceeded,
  }) {
    if (persistenceStatus === PERSISTENCE_STATUS.PERSISTENCE_FOUND || hasFailedChecks) {
      return RESIDUAL_RISK.HIGH;
    }

    if (cycleLimitExceeded) {
      return RESIDUAL_RISK.HIGH;
    }

    if (!providerStateVerified || persistenceStatus === PERSISTENCE_STATUS.INCONCLUSIVE) {
      return RESIDUAL_RISK.UNKNOWN;
    }

    if (hasInconclusiveChecks || persistenceStatus === PERSISTENCE_STATUS.POSSIBLE_PERSISTENCE) {
      return RESIDUAL_RISK.MEDIUM;
    }

    if (canResolve) {
      return RESIDUAL_RISK.NONE;
    }

    return RESIDUAL_RISK.LOW;
  }
}

const resolutionEvaluator = new ResolutionEvaluator();

module.exports = {
  ResolutionEvaluator,
  resolutionEvaluator,
};

