'use strict';

const config = require('../config/env');
const recoveryActionRepository = require('../repositories/recoveryAction.repository');
const incidentRepository = require('../repositories/incident.repository');
const findingRepository = require('../repositories/finding.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { userPolicyRepository } = require('../repositories/userPolicy.repository');
const { computeActionHash } = require('./actionExecutor.service');
const {
  isActionTypeAllowed,
  getCapability,
  CAPABILITY_STATUS,
  DENIED_ACTION_TYPES,
} = require('../recovery/recoveryCapabilities');
const {
  POLICY_DECISIONS,
  POLICY_REASON_CODES,
  isKnownMaliciousOAuthEvidence,
} = require('../policy/policyRules');

/**
 * Deterministic Policy Engine — Task 14
 *
 * Evaluates recovery actions against security policy rules with strict precedence.
 * Zero LLM authority — purely deterministic.
 */
class PolicyEngineService {
  /**
   * Evaluates policy for a specific recovery action.
   *
   * @param {object} params
   * @param {string} params.userId - Authenticated user ID
   * @param {string} params.actionId - RecoveryAction ID
   * @param {string} [params.clientActionHash] - Optional client hash to verify against server calculation
   * @returns {Promise<object>} Structured policy decision
   */
  async evaluateAction({ userId, actionId, clientActionHash = null }) {
    const evaluatedAt = new Date().toISOString();
    const policyVersion = config.policyVersion || 'v1';
    const conditions = [];

    // ── 1. Authentication Check ────────────────────────────────────────────────
    if (!userId) {
      return this._formatDecision(
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_OWNERSHIP_MISMATCH,
        policyVersion,
        actionId,
        null,
        ['UNAUTHENTICATED'],
        evaluatedAt
      );
    }

    // ── 2. Action Existence ────────────────────────────────────────────────────
    const action = await recoveryActionRepository.findById(actionId);
    if (!action) {
      return this._formatDecision(
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_NOT_FOUND,
        policyVersion,
        actionId,
        null,
        ['ACTION_DOES_NOT_EXIST'],
        evaluatedAt
      );
    }

    // ── 3. Tenant & Incident Ownership ─────────────────────────────────────────
    const incident = await incidentRepository.findById(action.incidentId);
    if (!incident || incident.userId !== userId) {
      return this._formatDecision(
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_OWNERSHIP_MISMATCH,
        policyVersion,
        actionId,
        null,
        ['TENANT_ISOLATION_VIOLATION'],
        evaluatedAt
      );
    }

    // Extract metadata from providerResult JSON
    let providerMeta = {};
    try {
      providerMeta =
        typeof action.providerResult === 'string'
          ? JSON.parse(action.providerResult)
          : action.providerResult || {};
    } catch {
      providerMeta = {};
    }

    const targetType = providerMeta.targetType || null;
    const targetId = providerMeta.targetId || null;
    const provider = providerMeta.provider || 'simulated';

    // Compute authoritative action hash
    const authoritativeHash = computeActionHash(action, targetType, targetId);

    // ── 4. Action State Checks ────────────────────────────────────────────────
    if (action.status === 'COMPLETED') {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_ALREADY_EXECUTED,
        policyVersion,
        authoritativeHash,
        ['ACTION_STATUS_COMPLETED'],
        evaluatedAt
      );
    }

    if (['FAILED', 'REJECTED', 'CANCELLED'].includes(action.status)) {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_STATE_INVALID,
        policyVersion,
        authoritativeHash,
        [`ACTION_STATUS_${action.status}`],
        evaluatedAt
      );
    }

    // ── 5. Destructive Action Deny Rules ───────────────────────────────────────
    if (DENIED_ACTION_TYPES.includes(action.actionType)) {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.DESTRUCTIVE_ACTION_DENIED,
        policyVersion,
        authoritativeHash,
        ['EXPLICIT_DENY_LIST_MATCH'],
        evaluatedAt
      );
    }

    // ── 6. Allowlist Check ────────────────────────────────────────────────────
    if (!isActionTypeAllowed(action.actionType)) {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_NOT_ALLOWLISTED,
        policyVersion,
        authoritativeHash,
        ['NOT_IN_RECOVERY_ALLOWLIST'],
        evaluatedAt
      );
    }

    // ── 7. Provider Capability Check ──────────────────────────────────────────
    const capability = getCapability(provider, action.actionType);
    if (capability !== CAPABILITY_STATUS.SUPPORTED) {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.PROVIDER_CAPABILITY_UNSUPPORTED,
        policyVersion,
        authoritativeHash,
        [`PROVIDER_${provider.toUpperCase()}_UNSUPPORTED`],
        evaluatedAt
      );
    }

    // ── 8. Action Hash Integrity Check ────────────────────────────────────────
    if (clientActionHash && clientActionHash !== authoritativeHash) {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.ACTION_HASH_MISMATCH,
        policyVersion,
        authoritativeHash,
        ['CLIENT_HASH_MISMATCH'],
        evaluatedAt
      );
    }

    // ── 9. Evidence Requirements ──────────────────────────────────────────────
    const evidenceList = await findingRepository.findByIncidentId(action.incidentId);
    // Action must have evidence, linked incident summary, or plan reasoning
    const hasEvidence =
      (Array.isArray(evidenceList) && evidenceList.length > 0) ||
      Boolean(providerMeta.reasoning) ||
      Boolean(incident.summary);

    if (!hasEvidence) {
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.DENY,
        false,
        POLICY_REASON_CODES.INSUFFICIENT_EVIDENCE,
        policyVersion,
        authoritativeHash,
        ['NO_EVIDENCE_ATTACHED_TO_INCIDENT'],
        evaluatedAt
      );
    }
    conditions.push('EVIDENCE_VERIFIED');

    // ── 10. Explicit Automation Evaluation ────────────────────────────────────
    const userPolicy = await userPolicyRepository.getUserPolicy(userId);

    // Rule 10.1: Known Malicious OAuth Application Automation
    if (action.actionType === 'REVOKE_OAUTH') {
      const isMalicious = isKnownMaliciousOAuthEvidence(evidenceList, targetId);
      if (isMalicious) {
        conditions.push('MALICIOUS_OAUTH_EVIDENCE_IDENTIFIED');
        if (userPolicy.automaticMaliciousOAuthRevocation === true) {
          conditions.push('OPT_IN_MALICIOUS_OAUTH_AUTOMATION_ENABLED');
          return await this._recordAndReturn(
            userId,
            action,
            POLICY_DECISIONS.ALLOW,
            false,
            POLICY_REASON_CODES.KNOWN_MALICIOUS_OAUTH_AUTOMATION_ALLOWED,
            policyVersion,
            authoritativeHash,
            conditions,
            evaluatedAt
          );
        } else {
          conditions.push('OPT_IN_MALICIOUS_OAUTH_AUTOMATION_DISABLED');
          return await this._recordAndReturn(
            userId,
            action,
            POLICY_DECISIONS.REQUIRE_APPROVAL,
            true,
            POLICY_REASON_CODES.HIGH_RISK_REQUIRES_APPROVAL,
            policyVersion,
            authoritativeHash,
            conditions,
            evaluatedAt
          );
        }
      }
    }

    // Rule 10.2: Low Risk Explicit Automation
    const riskLevel = (action.riskLevel || '').toUpperCase();
    if (riskLevel === 'LOW') {
      if (
        userPolicy.automaticRecovery === true ||
        (Array.isArray(userPolicy.allowedAutomationTypes) &&
          userPolicy.allowedAutomationTypes.includes(action.actionType))
      ) {
        conditions.push('LOW_RISK_AUTOMATION_OPTED_IN');
        return await this._recordAndReturn(
          userId,
          action,
          POLICY_DECISIONS.ALLOW,
          false,
          POLICY_REASON_CODES.LOW_RISK_AUTOMATION_ALLOWED,
          policyVersion,
          authoritativeHash,
          conditions,
          evaluatedAt
        );
      } else {
        conditions.push('LOW_RISK_AUTOMATION_OPTED_OUT');
        return await this._recordAndReturn(
          userId,
          action,
          POLICY_DECISIONS.REQUIRE_APPROVAL,
          true,
          POLICY_REASON_CODES.LOW_RISK_REQUIRES_APPROVAL,
          policyVersion,
          authoritativeHash,
          conditions,
          evaluatedAt
        );
      }
    }

    // ── 11. Baseline Risk-Level Policy ─────────────────────────────────────────
    if (riskLevel === 'MEDIUM') {
      conditions.push('MEDIUM_RISK_DEFAULT_APPROVAL_REQUIRED');
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.REQUIRE_APPROVAL,
        true,
        POLICY_REASON_CODES.MEDIUM_RISK_REQUIRES_APPROVAL,
        policyVersion,
        authoritativeHash,
        conditions,
        evaluatedAt
      );
    }

    if (riskLevel === 'CRITICAL') {
      conditions.push('CRITICAL_RISK_MANDATORY_APPROVAL');
      return await this._recordAndReturn(
        userId,
        action,
        POLICY_DECISIONS.REQUIRE_APPROVAL,
        true,
        POLICY_REASON_CODES.CRITICAL_ACTION_REQUIRES_APPROVAL,
        policyVersion,
        authoritativeHash,
        conditions,
        evaluatedAt
      );
    }

    // Default for HIGH and all other actions: REQUIRE_APPROVAL
    conditions.push('HIGH_RISK_DEFAULT_APPROVAL_REQUIRED');
    return await this._recordAndReturn(
      userId,
      action,
      POLICY_DECISIONS.REQUIRE_APPROVAL,
      true,
      POLICY_REASON_CODES.HIGH_RISK_REQUIRES_APPROVAL,
      policyVersion,
      authoritativeHash,
      conditions,
      evaluatedAt
    );
  }

  /**
   * Helper to format the structured decision object.
   * @private
   */
  _formatDecision(
    decision,
    approvalRequired,
    reasonCode,
    policyVersion,
    actionId,
    actionHash,
    conditions,
    evaluatedAt
  ) {
    return {
      decision,
      approvalRequired,
      reasonCode,
      policyVersion,
      actionId,
      actionHash,
      conditions,
      evaluatedAt,
    };
  }

  /**
   * Records audit log and returns decision.
   * @private
   */
  async _recordAndReturn(
    userId,
    action,
    decision,
    approvalRequired,
    reasonCode,
    policyVersion,
    actionHash,
    conditions,
    evaluatedAt
  ) {
    const actionType =
      decision === POLICY_DECISIONS.ALLOW
        ? 'POLICY_AUTOMATION_ALLOWED'
        : decision === POLICY_DECISIONS.DENY
        ? 'POLICY_DENIED'
        : 'POLICY_APPROVAL_REQUIRED';

    try {
      await auditLogRepository.create({
        userId,
        incidentId: action.incidentId,
        actorType: 'SYSTEM',
        actorId: 'PolicyEngine',
        actionType,
        targetType: 'RecoveryAction',
        targetId: action.id,
        result: decision === POLICY_DECISIONS.DENY ? 'FAILURE' : 'SUCCESS',
        metadata: {
          decision,
          approvalRequired,
          reasonCode,
          policyVersion,
          actionType: action.actionType,
          riskLevel: action.riskLevel,
        },
      });
    } catch {
      // Non-blocking audit failure
    }

    return this._formatDecision(
      decision,
      approvalRequired,
      reasonCode,
      policyVersion,
      action.id,
      actionHash,
      conditions,
      evaluatedAt
    );
  }
}

const policyEngineService = new PolicyEngineService();

module.exports = {
  PolicyEngineService,
  policyEngineService,
};

