'use strict';

const crypto = require('crypto');
const recoveryActionRepository = require('../repositories/recoveryAction.repository');
const incidentRepository = require('../repositories/incident.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { redactSensitive } = require('../utils/redaction');
const { isActionTypeAllowed } = require('../recovery/recoveryCapabilities');
const { recoveryAdapterRegistry } = require('../adapters/recovery/recoveryAdapter.registry');

/**
 * Computes the deterministic action hash used for authorization binding.
 * Format: SHA256(incidentId|actionId|actionType|targetType|targetId|connectedAccountId)
 *
 * @param {object} action - RecoveryAction record
 * @param {string|null} targetType - From providerResult metadata
 * @param {string|null} targetId - From providerResult metadata
 * @returns {string} Hex digest
 */
function computeActionHash(action, targetType, targetId) {
  const parts = [
    action.incidentId || '',
    action.id || '',
    action.actionType || '',
    targetType || '',
    targetId || '',
    action.connectedAccountId || '',
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * ActionExecutorService — executes authorized recovery actions.
 *
 * AUTHORIZATION BOUNDARY:
 * - EVERY execution attempt must supply a valid authorization context.
 * - Authorization validation order:
 *   1. Authorization record exists and is non-null
 *   2. authorization.recoveryActionId === action.id
 *   3. actionHash matches
 *   4. authorization.expiresAt > Date.now()
 *   5. Authorization not already consumed (replay defense)
 *   6. Incident ownership: action.incidentId must match a user-owned incident
 *
 * - Status guards:
 *   - COMPLETED → returns ALREADY_EXECUTED (idempotent)
 *   - EXECUTING → returns 409 ALREADY_EXECUTING (concurrency guard)
 *   - FAILED/REJECTED/CANCELLED → returns appropriate error
 *
 * - Execution flow: PROPOSED/APPROVED → EXECUTING → COMPLETED/FAILED
 */
class ActionExecutorService {
  /**
   * Executes a recovery action with explicit authorization.
   *
   * @param {object} params
   * @param {string} params.userId - Authenticated user ID
   * @param {string} params.actionId - RecoveryAction ID
   * @param {object} params.authorization - Authorization context (from request body)
   * @param {string} params.authorization.authorizationId - Approval record ID
   * @param {string} params.authorization.actionHash - Hash of the action being authorized
   * @param {string} params.authorization.recoveryActionId - Expected RecoveryAction ID
   * @param {string} params.authorization.expiresAt - ISO expiry timestamp
   * @returns {Promise<object>} Execution result
   */
  async execute({ userId, actionId, authorization }) {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();

    // ── 0. Fetch the action ────────────────────────────────────────────────────
    const action = await recoveryActionRepository.findById(actionId);
    if (!action) {
      const err = new Error('Recovery action not found');
      err.statusCode = 404;
      err.code = 'ACTION_NOT_FOUND';
      throw err;
    }

    // ── 1. Verify incident ownership ──────────────────────────────────────────
    const incident = await incidentRepository.findById(action.incidentId);
    if (!incident || incident.userId !== userId) {
      const err = new Error('Recovery action not found');
      err.statusCode = 404;
      err.code = 'ACTION_NOT_FOUND';
      throw err;
    }

    // ── 2. Idempotency guard ──────────────────────────────────────────────────
    if (action.status === 'COMPLETED') {
      return {
        status: 'ALREADY_EXECUTED',
        actionId,
        message: 'This recovery action has already been executed successfully',
        executedAt: action.executedAt,
      };
    }

    // ── 3. Concurrency guard ──────────────────────────────────────────────────
    if (action.status === 'EXECUTING') {
      const err = new Error('Recovery action is already executing');
      err.statusCode = 409;
      err.code = 'ALREADY_EXECUTING';
      throw err;
    }

    // ── 4. Terminal status guards ─────────────────────────────────────────────
    if (['FAILED', 'REJECTED', 'CANCELLED'].includes(action.status)) {
      const err = new Error(`Recovery action is in terminal status: ${action.status}`);
      err.statusCode = 409;
      err.code = `ACTION_${action.status}`;
      throw err;
    }

    // ── 5. Allowlist check ────────────────────────────────────────────────────
    if (!isActionTypeAllowed(action.actionType)) {
      await auditLogRepository.create({
        userId,
        incidentId: action.incidentId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'RECOVERY_ACTION_DENIED',
        targetType: 'RecoveryAction',
        targetId: actionId,
        result: 'FAILURE',
        metadata: { reason: 'ACTION_TYPE_NOT_ALLOWED', actionType: action.actionType },
        correlationId,
      });
      const err = new Error(`Action type '${action.actionType}' is not in the execution allowlist`);
      err.statusCode = 403;
      err.code = 'ACTION_TYPE_NOT_ALLOWED';
      throw err;
    }

    // ── 6. Authorization validation ───────────────────────────────────────────
    await this._validateAuthorization(action, authorization, userId, correlationId);

    // ── 7. Transition to EXECUTING (atomic concurrency guard) ─────────────────
    let transitioned;
    try {
      transitioned = await recoveryActionRepository.updateStatus(actionId, 'EXECUTING', {
        updatedAt: new Date().toISOString(),
      });
    } catch {
      transitioned = null;
    }

    if (!transitioned) {
      const err = new Error('Failed to acquire execution lock — concurrent execution detected');
      err.statusCode = 409;
      err.code = 'EXECUTION_LOCK_FAILED';
      throw err;
    }

    // ── 8. Audit execution start ──────────────────────────────────────────────
    await auditLogRepository.create({
      userId,
      incidentId: action.incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'RECOVERY_ACTION_EXECUTING',
      targetType: 'RecoveryAction',
      targetId: actionId,
      result: 'SUCCESS',
      metadata: {
        actionType: action.actionType,
        riskLevel: action.riskLevel,
        authorizationId: authorization.authorizationId,
      },
      correlationId,
    });

    // ── 9. Resolve adapter and dispatch ──────────────────────────────────────
    let providerMeta = {};
    try {
      providerMeta = typeof action.providerResult === 'string'
        ? JSON.parse(action.providerResult)
        : (action.providerResult || {});
    } catch { /* ignore */ }

    const provider = providerMeta.provider || 'simulated';
    const targetId = providerMeta.targetId || actionId;
    const targetType = providerMeta.targetType || null;
    const adapter = recoveryAdapterRegistry.get(provider);

    let adapterResult;
    try {
      adapterResult = await this._dispatchToAdapter(adapter, action.actionType, {
        connectedAccountId: action.connectedAccountId,
        targetId,
        metadata: { incidentId: action.incidentId, correlationId },
      });
    } catch (adapterErr) {
      // Mark action as FAILED
      await recoveryActionRepository.updateStatus(actionId, 'FAILED', {
        errorMessage: adapterErr.message,
        providerResult: JSON.stringify({
          ...providerMeta,
          error: adapterErr.message,
          failedAt: new Date().toISOString(),
        }),
      });

      await auditLogRepository.create({
        userId,
        incidentId: action.incidentId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'RECOVERY_ACTION_FAILED',
        targetType: 'RecoveryAction',
        targetId: actionId,
        result: 'FAILURE',
        metadata: redactSensitive({
          actionType: action.actionType,
          error: adapterErr.message,
          provider,
        }),
        correlationId,
      });

      const err = new Error(`Action execution failed: ${adapterErr.message}`);
      err.statusCode = 500;
      err.code = 'EXECUTION_FAILED';
      err.details = { provider, actionType: action.actionType };
      throw err;
    }

    // ── 10. Mark as COMPLETED ─────────────────────────────────────────────────
    const executedAt = new Date().toISOString();
    await recoveryActionRepository.updateStatus(actionId, 'COMPLETED', {
      executedAt,
      verificationStatus: 'PENDING',
      providerResult: JSON.stringify({
        ...providerMeta,
        executionResult: redactSensitive(adapterResult),
        executedAt,
        provider,
        correlationId,
      }),
    });

    // ── 11. Mark authorization as consumed (replay prevention) ────────────────
    await recoveryActionRepository.markApprovalConsumed(authorization.authorizationId, actionId);

    const durationMs = Date.now() - startTime;

    // ── 12. Audit successful completion ──────────────────────────────────────
    await auditLogRepository.create({
      userId,
      incidentId: action.incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'RECOVERY_ACTION_COMPLETED',
      targetType: 'RecoveryAction',
      targetId: actionId,
      result: 'SUCCESS',
      metadata: {
        actionType: action.actionType,
        riskLevel: action.riskLevel,
        provider,
        durationMs,
        verificationStatus: 'PENDING',
      },
      correlationId,
    });

    return {
      status: 'COMPLETED',
      actionId,
      actionType: action.actionType,
      riskLevel: action.riskLevel,
      provider,
      executedAt,
      durationMs,
      correlationId,
      result: redactSensitive(adapterResult),
    };
  }

  /**
   * Validates the authorization context against the action and approval record.
   * Throws with appropriate error code on any validation failure.
   *
   * @private
   */
  async _validateAuthorization(action, authorization, userId, correlationId) {
    if (!authorization) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_MISSING', 'No authorization context provided', correlationId);
      const err = new Error('Explicit authorization is required to execute a recovery action');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_MISSING';
      throw err;
    }

    // Validate recoveryActionId binding
    if (authorization.recoveryActionId !== action.id) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_ACTION_MISMATCH', 'Authorization is bound to a different action', correlationId);
      const err = new Error('Authorization is bound to a different recovery action');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_ACTION_MISMATCH';
      throw err;
    }

    // Recompute and validate action hash
    let providerMeta = {};
    try {
      providerMeta = typeof action.providerResult === 'string'
        ? JSON.parse(action.providerResult)
        : (action.providerResult || {});
    } catch { /* ignore */ }

    const expectedHash = computeActionHash(action, providerMeta.targetType, providerMeta.targetId);
    if (authorization.actionHash !== expectedHash) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_HASH_MISMATCH', 'Action hash does not match', correlationId);
      const err = new Error('Authorization action hash does not match the current action state');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_HASH_MISMATCH';
      throw err;
    }

    // Validate expiry
    const expiresAt = new Date(authorization.expiresAt).getTime();
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_EXPIRED', 'Authorization has expired', correlationId);
      const err = new Error('Authorization has expired');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_EXPIRED';
      throw err;
    }

    // Validate approval record exists and is APPROVED
    if (!authorization.authorizationId) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_MISSING_ID', 'Authorization ID not provided', correlationId);
      const err = new Error('Authorization ID is required');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_MISSING_ID';
      throw err;
    }

    const approval = await recoveryActionRepository.findApprovalById(authorization.authorizationId);
    if (!approval) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_NOT_FOUND', 'Approval record not found', correlationId);
      const err = new Error('Authorization record not found');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_NOT_FOUND';
      throw err;
    }

    if (approval.status !== 'APPROVED') {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_NOT_APPROVED', `Approval status is ${approval.status}`, correlationId);
      const err = new Error(`Authorization is not in APPROVED status (current: ${approval.status})`);
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_NOT_APPROVED';
      throw err;
    }

    // Check approval record binding
    if (approval.recoveryActionId !== action.id || approval.incidentId !== action.incidentId) {
      await this._auditAuthFailure(userId, action, 'AUTHORIZATION_BINDING_MISMATCH', 'Approval record is bound to a different action/incident', correlationId);
      const err = new Error('Authorization record is bound to a different action or incident');
      err.statusCode = 403;
      err.code = 'AUTHORIZATION_BINDING_MISMATCH';
      throw err;
    }

    // Replay attack prevention
    const consumed = await recoveryActionRepository.isApprovalConsumed(authorization.authorizationId);
    if (consumed) {
      await auditLogRepository.create({
        userId,
        incidentId: action.incidentId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'AUTHORIZATION_REPLAY_REJECTED',
        targetType: 'RecoveryAction',
        targetId: action.id,
        result: 'FAILURE',
        metadata: {
          authorizationId: authorization.authorizationId,
          actionType: action.actionType,
        },
        correlationId,
      });
      const err = new Error('Authorization has already been consumed — replay attack rejected');
      err.statusCode = 409;
      err.code = 'AUTHORIZATION_REPLAY_REJECTED';
      throw err;
    }
  }

  /**
   * Records an authorization failure audit log.
   * @private
   */
  async _auditAuthFailure(userId, action, code, reason, correlationId) {
    await auditLogRepository.create({
      userId,
      incidentId: action.incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'AUTHORIZATION_FAILED',
      targetType: 'RecoveryAction',
      targetId: action.id,
      result: 'FAILURE',
      metadata: { code, reason, actionType: action.actionType },
      correlationId,
    });
  }

  /**
   * Dispatches to the appropriate adapter method based on action type.
   * @private
   */
  async _dispatchToAdapter(adapter, actionType, params) {
    switch (actionType) {
      case 'REVOKE_OAUTH':
        return await adapter.revokeOAuthApp(params);
      case 'REVOKE_TOKEN':
        return await adapter.revokeAccessToken(params);
      case 'TERMINATE_SESSION':
        return await adapter.terminateSession(params);
      case 'REMOVE_SSH_KEY':
        return await adapter.removeSSHKey(params);
      case 'DISABLE_INTEGRATION':
        return await adapter.disableConnectedAccount(params);
      default: {
        const err = new Error(`No adapter dispatch for action type: ${actionType}`);
        err.code = 'UNSUPPORTED_ACTION_TYPE';
        throw err;
      }
    }
  }
}

const actionExecutorService = new ActionExecutorService();

module.exports = {
  ActionExecutorService,
  actionExecutorService,
  computeActionHash,
};

