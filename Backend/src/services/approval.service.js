'use strict';

const config = require('../config/env');
const approvalRepository = require('../repositories/approval.repository');
const recoveryActionRepository = require('../repositories/recoveryAction.repository');
const incidentRepository = require('../repositories/incident.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { policyEngineService } = require('./policyEngine.service');
const { computeActionHash } = require('./actionExecutor.service');
const { POLICY_DECISIONS } = require('../policy/policyRules');

/**
 * Approval Service — Task 14
 *
 * Manages approval requests, decision lifecycle, synchronous expiration checks,
 * action hash verification, and authorization issuance for Task 13 Action Executor.
 */
class ApprovalService {
  constructor() {
    this._locks = new Set();
  }

  /**
   * Requests an approval for a recovery action.
   * If policy is ALLOW (explicit automation), immediately issues authorization.
   * If policy is REQUIRE_APPROVAL, creates a PENDING approval record.
   * If policy is DENY, throws a 403 error.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.actionId
   * @returns {Promise<object>}
   */
  async requestApproval({ userId, actionId }) {
    const lockKey = `action:${actionId}`;
    if (this._locks.has(lockKey)) {
      const err = new Error('Concurrent approval request in progress');
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_IN_PROGRESS';
      throw err;
    }
    this._locks.add(lockKey);

    try {
      return await this._executeRequestApproval({ userId, actionId });
    } finally {
      this._locks.delete(lockKey);
    }
  }

  /**
   * Internal implementation of requestApproval.
   * @private
   */
  async _executeRequestApproval({ userId, actionId }) {
    // 1. Evaluate policy first
    const evaluation = await policyEngineService.evaluateAction({ userId, actionId });

    if (evaluation.decision === POLICY_DECISIONS.DENY) {
      const err = new Error(`Action denied by policy: ${evaluation.reasonCode}`);
      err.statusCode = 403;
      err.code = evaluation.reasonCode;
      err.decision = evaluation;
      throw err;
    }

    const action = await recoveryActionRepository.findById(actionId);
    const incident = await incidentRepository.findById(action.incidentId);
    const policyVersion = evaluation.policyVersion || config.policyVersion || 'v1';
    const expiryMinutes = config.approvalExpiryMinutes || 30;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    // 2. Case: Policy is ALLOW (Explicit Automation)
    if (evaluation.decision === POLICY_DECISIONS.ALLOW) {
      const approval = await approvalRepository.create({
        userId,
        incidentId: action.incidentId,
        recoveryActionId: action.id,
        status: 'APPROVED',
        expiresAt,
        decisionMetadata: {
          actionHash: evaluation.actionHash,
          policyVersion,
          authorizationType: 'EXPLICIT_AUTOMATION',
          reasonCode: evaluation.reasonCode,
          conditions: evaluation.conditions,
          authorizedBy: 'EXPLICIT_AUTOMATION',
          decidedAt: new Date().toISOString(),
        },
      });

      // Transition action to APPROVED
      await recoveryActionRepository.updateStatus(action.id, 'APPROVED');

      const authorization = {
        authorizationId: approval.id,
        authorizedBy: userId,
        authorizationType: 'EXPLICIT_AUTOMATION',
        authorizedAt: new Date().toISOString(),
        expiresAt,
        incidentId: action.incidentId,
        recoveryActionId: action.id,
        actionHash: evaluation.actionHash,
        policyVersion,
      };

      await auditLogRepository.create({
        userId,
        incidentId: action.incidentId,
        actorType: 'SYSTEM',
        actorId: 'ApprovalService',
        actionType: 'AUTHORIZATION_ISSUED',
        targetType: 'RecoveryAction',
        targetId: action.id,
        result: 'SUCCESS',
        metadata: {
          authorizationId: approval.id,
          authorizationType: 'EXPLICIT_AUTOMATION',
          actionHash: evaluation.actionHash,
          reasonCode: evaluation.reasonCode,
        },
      });

      return {
        status: 'AUTOMATION_AUTHORIZED',
        actionId: action.id,
        decision: evaluation,
        approval,
        authorization,
      };
    }

    // 3. Case: Policy is REQUIRE_APPROVAL
    // Check if an active, unexpired PENDING approval already exists
    const existingApprovals = await approvalRepository.findByRecoveryActionId(action.id);
    const existingPending = existingApprovals.find(
      (a) => a.status === 'PENDING' && new Date(a.expiresAt).getTime() > Date.now()
    );

    if (existingPending) {
      return {
        status: 'PENDING_APPROVAL',
        actionId: action.id,
        approval: existingPending,
        decision: evaluation,
      };
    }

    const approval = await approvalRepository.create({
      userId,
      incidentId: action.incidentId,
      recoveryActionId: action.id,
      status: 'PENDING',
      expiresAt,
      decisionMetadata: {
        actionHash: evaluation.actionHash,
        policyVersion,
        reasonCode: evaluation.reasonCode,
        conditions: evaluation.conditions,
      },
    });

    // Transition action to PENDING_APPROVAL
    await recoveryActionRepository.updateStatus(action.id, 'PENDING_APPROVAL');

    await auditLogRepository.create({
      userId,
      incidentId: action.incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'APPROVAL_REQUESTED',
      targetType: 'Approval',
      targetId: approval.id,
      result: 'SUCCESS',
      metadata: {
        recoveryActionId: action.id,
        actionHash: evaluation.actionHash,
        expiresAt,
        reasonCode: evaluation.reasonCode,
      },
    });

    return {
      status: 'PENDING_APPROVAL',
      actionId: action.id,
      approval,
      decision: evaluation,
    };
  }

  /**
   * Approves a pending recovery action approval and issues authorization for Task 13 Executor.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.approvalId
   * @returns {Promise<object>}
   */
  async approve({ userId, approvalId }) {
    const lockKey = `approval:${approvalId}`;
    if (this._locks.has(lockKey)) {
      const err = new Error('Concurrent approval decision in progress');
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_DECIDED';
      throw err;
    }
    this._locks.add(lockKey);

    try {
      return await this._executeApprove({ userId, approvalId });
    } finally {
      this._locks.delete(lockKey);
    }
  }

  /**
   * Internal implementation of approve.
   * @private
   */
  async _executeApprove({ userId, approvalId }) {
    // 1. Fetch approval and verify ownership
    const approval = await approvalRepository.findById(approvalId);
    if (!approval || approval.userId !== userId) {
      const err = new Error('Approval not found');
      err.statusCode = 404;
      err.code = 'APPROVAL_NOT_FOUND';
      throw err;
    }

    // 2. Concurrency guard: Must be PENDING
    if (approval.status !== 'PENDING') {
      const err = new Error(`Approval is already in ${approval.status} status`);
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_DECIDED';
      throw err;
    }

    // 3. Synchronous expiration check
    const expiresAt = new Date(approval.expiresAt).getTime();
    if (Date.now() >= expiresAt) {
      await approvalRepository.updateStatus(approval.id, 'EXPIRED');
      await auditLogRepository.create({
        userId,
        incidentId: approval.incidentId,
        actorType: 'SYSTEM',
        actorId: 'ApprovalService',
        actionType: 'APPROVAL_EXPIRED',
        targetType: 'Approval',
        targetId: approval.id,
        result: 'FAILURE',
        metadata: { reason: 'APPROVAL_EXPIRED_DURING_DECISION' },
      });
      const err = new Error('Approval has expired and cannot be approved');
      err.statusCode = 400;
      err.code = 'APPROVAL_EXPIRED';
      throw err;
    }

    // 4. Fetch action & verify ownership
    const action = await recoveryActionRepository.findById(approval.recoveryActionId);
    if (!action) {
      const err = new Error('Associated recovery action not found');
      err.statusCode = 404;
      err.code = 'ACTION_NOT_FOUND';
      throw err;
    }

    if (action.status === 'COMPLETED') {
      const err = new Error('Recovery action has already been executed');
      err.statusCode = 409;
      err.code = 'ACTION_ALREADY_EXECUTED';
      throw err;
    }

    if (['FAILED', 'REJECTED', 'CANCELLED'].includes(action.status)) {
      const err = new Error(`Recovery action is in terminal status: ${action.status}`);
      err.statusCode = 409;
      err.code = 'ACTION_STATE_INVALID';
      throw err;
    }

    // 5. Action Hash Integrity Check
    let providerMeta = {};
    try {
      providerMeta =
        typeof action.providerResult === 'string'
          ? JSON.parse(action.providerResult)
          : action.providerResult || {};
    } catch {
      providerMeta = {};
    }

    const currentHash = computeActionHash(
      action,
      providerMeta.targetType || null,
      providerMeta.targetId || null
    );

    let approvalMeta = {};
    try {
      approvalMeta =
        typeof approval.decisionMetadata === 'string'
          ? JSON.parse(approval.decisionMetadata)
          : approval.decisionMetadata || {};
    } catch {
      approvalMeta = {};
    }

    if (approvalMeta.actionHash && approvalMeta.actionHash !== currentHash) {
      // Invalidate the approval due to action tampering
      await approvalRepository.updateStatus(approval.id, 'REJECTED', {
        decisionMetadata: {
          ...approvalMeta,
          invalidated: true,
          invalidationReason: 'ACTION_HASH_MISMATCH',
        },
      });

      await auditLogRepository.create({
        userId,
        incidentId: approval.incidentId,
        actorType: 'SYSTEM',
        actorId: 'ApprovalService',
        actionType: 'APPROVAL_INVALIDATED',
        targetType: 'Approval',
        targetId: approval.id,
        result: 'FAILURE',
        metadata: {
          expectedHash: approvalMeta.actionHash,
          currentHash,
          reason: 'ACTION_TAMPERED_AFTER_REQUEST',
        },
      });

      const err = new Error('Action state has changed since approval was requested');
      err.statusCode = 400;
      err.code = 'ACTION_HASH_MISMATCH';
      throw err;
    }

    // 6. Stale Policy Re-evaluation
    const reEval = await policyEngineService.evaluateAction({
      userId,
      actionId: action.id,
      clientActionHash: currentHash,
    });

    if (reEval.decision === POLICY_DECISIONS.DENY) {
      await approvalRepository.updateStatus(approval.id, 'REJECTED', {
        decisionMetadata: {
          ...approvalMeta,
          invalidated: true,
          invalidationReason: reEval.reasonCode,
        },
      });
      const err = new Error(`Policy no longer permits this action: ${reEval.reasonCode}`);
      err.statusCode = 403;
      err.code = reEval.reasonCode;
      throw err;
    }

    // 7. Atomic Transition to APPROVED (concurrency lock)
    const decidedAt = new Date().toISOString();
    const updatedApproval = await approvalRepository.updateStatus(
      approval.id,
      'APPROVED',
      {
        decidedAt,
        decisionMetadata: {
          ...approvalMeta,
          decidedBy: userId,
          decision: 'APPROVED',
          decidedAt,
        },
      },
      'PENDING'
    );

    if (!updatedApproval) {
      const err = new Error('Approval decision conflict: already decided or concurrent decision in progress');
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_DECIDED';
      throw err;
    }

    await recoveryActionRepository.updateStatus(action.id, 'APPROVED');

    // 8. Issue Authorization Contract conforming to Task 13
    const authorization = {
      authorizationId: approval.id,
      authorizedBy: userId,
      authorizationType: 'HUMAN_APPROVAL',
      authorizedAt: decidedAt,
      expiresAt: approval.expiresAt,
      incidentId: action.incidentId,
      recoveryActionId: action.id,
      actionHash: currentHash,
      policyVersion: config.policyVersion || 'v1',
    };

    // 9. Audit Logging
    await auditLogRepository.create({
      userId,
      incidentId: action.incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'APPROVAL_APPROVED',
      targetType: 'Approval',
      targetId: approval.id,
      result: 'SUCCESS',
      metadata: {
        actionId: action.id,
        actionType: action.actionType,
        actionHash: currentHash,
      },
    });

    await auditLogRepository.create({
      userId,
      incidentId: action.incidentId,
      actorType: 'SYSTEM',
      actorId: 'ApprovalService',
      actionType: 'AUTHORIZATION_ISSUED',
      targetType: 'RecoveryAction',
      targetId: action.id,
      result: 'SUCCESS',
      metadata: {
        authorizationId: approval.id,
        authorizationType: 'HUMAN_APPROVAL',
        actionHash: currentHash,
        expiresAt: approval.expiresAt,
      },
    });

    return {
      status: 'APPROVED',
      approvalId: approval.id,
      actionId: action.id,
      authorization,
      approval: updatedApproval,
    };
  }

  /**
   * Rejects a pending approval.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.approvalId
   * @param {string} [params.reason]
   * @returns {Promise<object>}
   */
  async reject({ userId, approvalId, reason = 'User rejected' }) {
    const lockKey = `approval:${approvalId}`;
    if (this._locks.has(lockKey)) {
      const err = new Error('Concurrent approval decision in progress');
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_DECIDED';
      throw err;
    }
    this._locks.add(lockKey);

    try {
      return await this._executeReject({ userId, approvalId, reason });
    } finally {
      this._locks.delete(lockKey);
    }
  }

  /**
   * Internal implementation of reject.
   * @private
   */
  async _executeReject({ userId, approvalId, reason }) {
    const approval = await approvalRepository.findById(approvalId);
    if (!approval || approval.userId !== userId) {
      const err = new Error('Approval not found');
      err.statusCode = 404;
      err.code = 'APPROVAL_NOT_FOUND';
      throw err;
    }

    if (approval.status !== 'PENDING') {
      const err = new Error(`Approval is already in ${approval.status} status`);
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_DECIDED';
      throw err;
    }

    const decidedAt = new Date().toISOString();
    let approvalMeta = {};
    try {
      approvalMeta =
        typeof approval.decisionMetadata === 'string'
          ? JSON.parse(approval.decisionMetadata)
          : approval.decisionMetadata || {};
    } catch {
      approvalMeta = {};
    }

    const updatedApproval = await approvalRepository.updateStatus(
      approval.id,
      'REJECTED',
      {
        decidedAt,
        decisionMetadata: {
          ...approvalMeta,
          decidedBy: userId,
          decision: 'REJECTED',
          decidedAt,
          rejectionReason: reason,
        },
      },
      'PENDING'
    );

    if (!updatedApproval) {
      const err = new Error('Approval decision conflict: already decided or concurrent decision in progress');
      err.statusCode = 409;
      err.code = 'APPROVAL_ALREADY_DECIDED';
      throw err;
    }

    // Transition action to REJECTED
    await recoveryActionRepository.updateStatus(approval.recoveryActionId, 'REJECTED');

    await auditLogRepository.create({
      userId,
      incidentId: approval.incidentId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'APPROVAL_REJECTED',
      targetType: 'Approval',
      targetId: approval.id,
      result: 'SUCCESS',
      metadata: {
        actionId: approval.recoveryActionId,
        reason,
      },
    });

    return {
      status: 'REJECTED',
      approvalId: approval.id,
      reason,
      approval: updatedApproval,
    };
  }

  /**
   * Retrieves the approval record for a specific recovery action.
   * Synchronously marks expired approvals.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.actionId
   * @returns {Promise<object|null>}
   */
  async getApprovalForAction({ userId, actionId }) {
    const action = await recoveryActionRepository.findById(actionId);
    if (!action) {
      const err = new Error('Recovery action not found');
      err.statusCode = 404;
      err.code = 'ACTION_NOT_FOUND';
      throw err;
    }

    const incident = await incidentRepository.findById(action.incidentId);
    if (!incident || incident.userId !== userId) {
      const err = new Error('Recovery action not found');
      err.statusCode = 404;
      err.code = 'ACTION_NOT_FOUND';
      throw err;
    }

    const approvals = await approvalRepository.findByRecoveryActionId(actionId);
    if (approvals.length === 0) {
      return null;
    }

    const latest = approvals[0];

    // Synchronously check expiration
    if (latest.status === 'PENDING' && new Date(latest.expiresAt).getTime() <= Date.now()) {
      await approvalRepository.updateStatus(latest.id, 'EXPIRED');
      latest.status = 'EXPIRED';
    }

    return latest;
  }

  /**
   * Lists approvals for the authenticated user, synchronously updating expired records.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} [params.status]
   * @returns {Promise<Array<object>>}
   */
  async listApprovals({ userId, status }) {
    const approvals = await approvalRepository.listByUserId(userId, { status });

    // Synchronously expire any overdue PENDING approvals
    const now = Date.now();
    for (const a of approvals) {
      if (a.status === 'PENDING' && new Date(a.expiresAt).getTime() <= now) {
        await approvalRepository.updateStatus(a.id, 'EXPIRED');
        a.status = 'EXPIRED';
      }
    }

    return status ? approvals.filter((a) => a.status === status) : approvals;
  }
}

const approvalService = new ApprovalService();

module.exports = {
  ApprovalService,
  approvalService,
};

