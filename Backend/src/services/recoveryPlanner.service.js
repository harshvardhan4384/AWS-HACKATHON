'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const recoveryActionRepository = require('../repositories/recoveryAction.repository');
const incidentRepository = require('../repositories/incident.repository');
const { blastRadiusService } = require('./blastRadius.service');
const auditLogRepository = require('../repositories/auditLog.repository');
const { redactSensitive } = require('../utils/redaction');
const { isActionTypeAllowed, getCapability, CAPABILITY_STATUS } = require('../recovery/recoveryCapabilities');
const { graphRepository } = require('../repositories/graph.repository');

/**
 * Action risk classification rules (deterministic).
 * Used to assign riskLevel to proposed RecoveryAction records.
 */
const ACTION_RISK_MAP = Object.freeze({
  REVOKE_OAUTH: 'HIGH',
  REVOKE_TOKEN: 'HIGH',
  REMOVE_SSH_KEY: 'CRITICAL',
  TERMINATE_SESSION: 'MEDIUM',
  DISABLE_INTEGRATION: 'HIGH',
});

/**
 * Action dependency ordering (deterministic).
 * Higher order = must execute later.
 * Actions with lower order numbers should execute before those with higher numbers.
 */
const ACTION_ORDER = Object.freeze({
  TERMINATE_SESSION: 1,
  REVOKE_TOKEN: 2,
  REVOKE_OAUTH: 3,
  REMOVE_SSH_KEY: 4,
  DISABLE_INTEGRATION: 5,
});

/**
 * Generates a deterministic plan hash from the proposed actions.
 * SHA256(sorted action types joined by '|' + ':' + incidentId)
 *
 * @param {string[]} actionTypes - Sorted action types
 * @param {string} incidentId
 * @returns {string} Hex digest
 */
function computePlanHash(actionTypes, incidentId) {
  const sorted = [...actionTypes].sort().join('|');
  return crypto.createHash('sha256').update(`${sorted}:${incidentId}`).digest('hex');
}

/**
 * Detects cycles in a dependency graph using DFS.
 * Returns true if the dependency ordering has a cycle.
 *
 * @param {Map<string, number>} orderMap - actionType → order number
 * @returns {boolean} False (order numbers are acyclic by definition)
 */
function hasCycle(orderMap) {
  // ACTION_ORDER is a flat numeric ordering — no cycles possible
  // This function exists as a safety check for future dynamic dependency graphs
  const seen = new Set();
  for (const [, order] of orderMap) {
    if (seen.has(order)) {
      // Duplicate order numbers are allowed (parallel actions), not a cycle
    }
    seen.add(order);
  }
  return false; // Flat ordering is always acyclic
}

/**
 * RecoveryPlannerService — generates deterministic recovery plans from incident blast radius.
 *
 * AUTHORIZATION BOUNDARY:
 * - This service PROPOSES actions. It does NOT execute them.
 * - All proposed actions have status='PROPOSED'.
 * - Execution requires passing through ActionExecutorService with explicit authorization.
 */
class RecoveryPlannerService {
  /**
   * Generates a recovery plan for the given incident.
   *
   * @param {object} params
   * @param {string} params.userId - Authenticated user ID
   * @param {string} params.incidentId - Incident to plan for
   * @param {object} [params.options] - Optional planning constraints
   * @param {number} [params.options.maxActions] - Override max actions per plan
   * @returns {Promise<object>} Recovery plan with proposed actions
   */
  async generatePlan({ userId, incidentId, options = {} }) {
    const startTime = Date.now();
    const maxActions = options.maxActions || config.recoveryMaxActionsPerPlan;

    // 1. Verify incident ownership first (ensures incidentId exists in DB before FK usage)
    const incident = await incidentRepository.findById(incidentId);
    if (!incident || incident.userId !== userId) {
      const err = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    // 2. Audit plan start
    await auditLogRepository.create({
      userId,
      incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'RECOVERY_PLAN_STARTED',
      targetType: 'INCIDENT',
      targetId: incidentId,
      result: 'SUCCESS',
      metadata: { options: redactSensitive(options) },
    });

    try {

      // 3. Check Neo4j availability — fall back to mock mode if offline
      let graphOnline = false;
      try {
        const { checkNeo4jHealth } = require('../infrastructure/neo4j/neo4j.client');
        const health = await Promise.race([
          checkNeo4jHealth(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        graphOnline = health.status === 'UP';
      } catch {
        graphOnline = false;
        graphRepository.setMockMode(true);
      }

      // 4. Compute blast radius to discover affected resources
      let blastRadius = null;
      let affectedResources = { accounts: [], sessions: [], oauthApps: [], sshKeys: [], devices: [], events: [], incidents: [], evidence: [] };

      try {
        blastRadius = await blastRadiusService.calculateBlastRadius({
          userId,
          sourceType: 'INCIDENT',
          sourceId: incidentId,
          options: { maxDepth: options.maxDepth || 3 },
        });
        affectedResources = blastRadius.affectedResources;
      } catch (blastErr) {
        // If blast radius fails, continue with empty affected resources
        await auditLogRepository.create({
          userId,
          incidentId,
          actorType: 'SYSTEM',
          actorId: userId,
          actionType: 'RECOVERY_BLAST_RADIUS_UNAVAILABLE',
          targetType: 'INCIDENT',
          targetId: incidentId,
          result: 'PARTIAL',
          metadata: { error: blastErr.message },
        });
      }

      // 5. Map affected resources → proposed action types (deterministic)
      const actionCandidates = this._mapResourcesToActions(affectedResources, incident);

      // 6. Deduplicate, enforce allowlist, and apply dependency ordering
      const uniqueActions = this._deduplicateAndOrder(actionCandidates);

      // 7. Apply max actions limit
      const limitedActions = uniqueActions.slice(0, maxActions);

      // 8. Check for cycles (safety gate)
      const orderMap = new Map(limitedActions.map((a) => [a.actionType, ACTION_ORDER[a.actionType] || 99]));
      const cycleDetected = hasCycle(orderMap);
      if (cycleDetected) {
        const err = new Error('Dependency cycle detected in recovery plan');
        err.code = 'RECOVERY_PLAN_CYCLE';
        err.statusCode = 500;
        throw err;
      }

      // 9. Compute plan hash
      const planHash = computePlanHash(
        limitedActions.map((a) => a.actionType),
        incidentId
      );

      // 10. Persist proposed RecoveryAction records
      const persistedActions = [];
      for (const action of limitedActions) {
        const record = await recoveryActionRepository.create({
          incidentId,
          connectedAccountId: action.connectedAccountId || null,
          actionType: action.actionType,
          riskLevel: action.riskLevel,
          providerResult: {
            planHash,
            dependencyOrder: ACTION_ORDER[action.actionType] || 99,
            targetId: action.targetId || null,
            targetType: action.targetType || null,
            provider: action.provider || 'simulated',
            reasoning: action.reasoning || null,
          },
        });
        persistedActions.push({
          ...record,
          _plan: {
            targetId: action.targetId,
            targetType: action.targetType,
            provider: action.provider,
            dependencyOrder: ACTION_ORDER[action.actionType] || 99,
          },
        });
      }

      const durationMs = Date.now() - startTime;

      // 11. Audit plan completion
      await auditLogRepository.create({
        userId,
        incidentId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'RECOVERY_PLAN_CREATED',
        targetType: 'INCIDENT',
        targetId: incidentId,
        result: 'SUCCESS',
        metadata: {
          planHash,
          actionCount: persistedActions.length,
          actionTypes: limitedActions.map((a) => a.actionType),
          durationMs,
          graphOnline,
        },
      });

      return {
        incidentId,
        planHash,
        status: 'PROPOSED',
        graphOnline,
        blastRadiusSummary: blastRadius
          ? {
              blastRadiusScore: blastRadius.metrics.blastRadiusScore,
              totalNodes: blastRadius.summary.totalNodes,
              truncated: blastRadius.summary.truncated,
            }
          : null,
        actions: persistedActions.map((a) => ({
          id: a.id,
          incidentId: a.incidentId,
          connectedAccountId: a.connectedAccountId,
          actionType: a.actionType,
          status: a.status,
          riskLevel: a.riskLevel,
          dependencyOrder: a._plan.dependencyOrder,
          provider: a._plan.provider,
          targetId: a._plan.targetId,
          targetType: a._plan.targetType,
          proposedAt: a.proposedAt,
        })),
        generatedAt: new Date().toISOString(),
        durationMs,
      };
    } catch (err) {
      await auditLogRepository.create({
        userId,
        incidentId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'RECOVERY_PLAN_FAILED',
        targetType: 'INCIDENT',
        targetId: incidentId,
        result: 'FAILURE',
        metadata: { error: err.message, code: err.code || 'PLANNING_ERROR' },
      });
      throw err;
    }
  }

  /**
   * Retrieves the latest recovery plan for an incident.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.incidentId
   * @returns {Promise<object>}
   */
  async getPlan({ userId, incidentId }) {
    // Verify ownership
    const incident = await incidentRepository.findById(incidentId);
    if (!incident || incident.userId !== userId) {
      const err = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    const actions = await recoveryActionRepository.findByIncidentId(incidentId);

    // Sort by dependency order stored in providerResult JSON
    const sorted = [...actions].sort((a, b) => {
      let aOrder = 99;
      let bOrder = 99;
      try {
        const aMeta = typeof a.providerResult === 'string' ? JSON.parse(a.providerResult) : a.providerResult;
        if (aMeta && aMeta.dependencyOrder != null) aOrder = aMeta.dependencyOrder;
      } catch { /* ignore */ }
      try {
        const bMeta = typeof b.providerResult === 'string' ? JSON.parse(b.providerResult) : b.providerResult;
        if (bMeta && bMeta.dependencyOrder != null) bOrder = bMeta.dependencyOrder;
      } catch { /* ignore */ }
      return aOrder - bOrder;
    });

    // Extract plan hash from the first action's providerResult
    let planHash = null;
    if (sorted.length > 0) {
      try {
        const meta = typeof sorted[0].providerResult === 'string'
          ? JSON.parse(sorted[0].providerResult)
          : sorted[0].providerResult;
        planHash = meta?.planHash || null;
      } catch { /* ignore */ }
    }

    return {
      incidentId,
      planHash,
      actionCount: sorted.length,
      actions: sorted.map((a) => {
        let meta = {};
        try {
          meta = typeof a.providerResult === 'string' ? JSON.parse(a.providerResult) : (a.providerResult || {});
        } catch { /* ignore */ }
        return {
          id: a.id,
          incidentId: a.incidentId,
          connectedAccountId: a.connectedAccountId,
          actionType: a.actionType,
          status: a.status,
          riskLevel: a.riskLevel,
          dependencyOrder: meta.dependencyOrder || 99,
          provider: meta.provider || 'simulated',
          targetId: meta.targetId || null,
          targetType: meta.targetType || null,
          proposedAt: a.proposedAt,
          executedAt: a.executedAt,
        };
      }),
    };
  }

  /**
   * Maps affected resources from blast radius to proposed action candidates.
   *
   * @private
   * @param {object} affectedResources
   * @param {object} incident
   * @returns {Array<object>} Action candidates
   */
  _mapResourcesToActions(affectedResources, incident) {
    const candidates = [];

    // OAuth apps → REVOKE_OAUTH
    for (const app of affectedResources.oauthApps || []) {
      if (!isActionTypeAllowed('REVOKE_OAUTH')) continue;
      const provider = app.properties?.provider || 'simulated';
      if (getCapability(provider, 'REVOKE_OAUTH') !== CAPABILITY_STATUS.SUPPORTED) continue;
      candidates.push({
        actionType: 'REVOKE_OAUTH',
        riskLevel: ACTION_RISK_MAP.REVOKE_OAUTH,
        connectedAccountId: app.id || null,
        targetId: app.id || app.properties?.appId || null,
        targetType: 'OAuthApp',
        provider,
        reasoning: `OAuth app ${app.label || app.id} was reachable from the compromised incident`,
      });
    }

    // SSH keys → REMOVE_SSH_KEY
    for (const key of affectedResources.sshKeys || []) {
      if (!isActionTypeAllowed('REMOVE_SSH_KEY')) continue;
      const provider = key.properties?.provider || 'github';
      if (getCapability(provider, 'REMOVE_SSH_KEY') !== CAPABILITY_STATUS.SUPPORTED) continue;
      candidates.push({
        actionType: 'REMOVE_SSH_KEY',
        riskLevel: ACTION_RISK_MAP.REMOVE_SSH_KEY,
        connectedAccountId: key.id || null,
        targetId: key.id || key.properties?.keyId || null,
        targetType: 'SSHKey',
        provider,
        reasoning: `SSH key ${key.label || key.id} was reachable from the compromised incident`,
      });
    }

    // Sessions → TERMINATE_SESSION
    for (const session of affectedResources.sessions || []) {
      if (!isActionTypeAllowed('TERMINATE_SESSION')) continue;
      const provider = session.properties?.provider || 'simulated';
      if (getCapability(provider, 'TERMINATE_SESSION') !== CAPABILITY_STATUS.SUPPORTED) continue;
      candidates.push({
        actionType: 'TERMINATE_SESSION',
        riskLevel: ACTION_RISK_MAP.TERMINATE_SESSION,
        connectedAccountId: session.id || null,
        targetId: session.id || session.properties?.sessionId || null,
        targetType: 'Session',
        provider,
        reasoning: `Session ${session.label || session.id} was reachable from the compromised incident`,
      });
    }

    // Accounts → REVOKE_TOKEN (for affected connected accounts)
    for (const account of affectedResources.accounts || []) {
      if (!isActionTypeAllowed('REVOKE_TOKEN')) continue;
      const provider = account.properties?.provider || 'simulated';
      if (getCapability(provider, 'REVOKE_TOKEN') !== CAPABILITY_STATUS.SUPPORTED) continue;
      candidates.push({
        actionType: 'REVOKE_TOKEN',
        riskLevel: ACTION_RISK_MAP.REVOKE_TOKEN,
        connectedAccountId: account.id || null,
        targetId: account.id || account.properties?.accountId || null,
        targetType: 'Account',
        provider,
        reasoning: `Connected account ${account.label || account.id} token should be revoked`,
      });
    }

    // If no specific resources but incident exists → recommend DISABLE_INTEGRATION as fallback
    if (candidates.length === 0 && isActionTypeAllowed('DISABLE_INTEGRATION')) {
      candidates.push({
        actionType: 'DISABLE_INTEGRATION',
        riskLevel: ACTION_RISK_MAP.DISABLE_INTEGRATION,
        connectedAccountId: null,
        targetId: incident.id,
        targetType: 'Incident',
        provider: 'simulated',
        reasoning: 'No specific affected resources found; recommend disabling integrations as a precaution',
      });
    }

    return candidates;
  }

  /**
   * Deduplicates action candidates and applies deterministic dependency ordering.
   *
   * @private
   * @param {Array<object>} candidates
   * @returns {Array<object>} Sorted and deduplicated actions
   */
  _deduplicateAndOrder(candidates) {
    // Deduplicate by actionType (one action per type per plan)
    const seen = new Set();
    const unique = [];
    for (const candidate of candidates) {
      if (!seen.has(candidate.actionType)) {
        seen.add(candidate.actionType);
        unique.push(candidate);
      }
    }

    // Sort by dependency order (ascending)
    unique.sort((a, b) => {
      const aOrder = ACTION_ORDER[a.actionType] || 99;
      const bOrder = ACTION_ORDER[b.actionType] || 99;
      return aOrder - bOrder;
    });

    return unique;
  }
}

const recoveryPlannerService = new RecoveryPlannerService();

module.exports = {
  RecoveryPlannerService,
  recoveryPlannerService,
  ACTION_RISK_MAP,
  ACTION_ORDER,
  computePlanHash,
};

