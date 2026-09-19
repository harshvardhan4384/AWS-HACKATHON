'use strict';

const { approvalService } = require('../services/approval.service');
const { rejectApprovalSchema, validate } = require('../validators/approval.validator');

/**
 * POST /api/recovery-actions/:id/approval-request
 * Requests approval for a recovery action (or immediately authorizes if policy permits).
 */
async function requestApproval(req, res, next) {
  try {
    const result = await approvalService.requestApproval({
      userId: req.user.id,
      actionId: req.params.id,
    });

    const statusCode = result.status === 'AUTOMATION_AUTHORIZED' ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        ...(err.decision ? { decision: err.decision } : {}),
      });
    }
    next(err);
  }
}

/**
 * GET /api/recovery-actions/:id/approval
 * Retrieves the latest approval record for a specific recovery action.
 */
async function getApprovalForAction(req, res, next) {
  try {
    const approval = await approvalService.getApprovalForAction({
      userId: req.user.id,
      actionId: req.params.id,
    });

    if (!approval) {
      return res.status(404).json({ error: 'No approval record found for this recovery action' });
    }

    return res.status(200).json({
      success: true,
      approval,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * POST /api/approvals/:id/approve
 * Approves a pending approval and issues an authorization token for execution.
 */
async function approve(req, res, next) {
  try {
    const result = await approvalService.approve({
      userId: req.user.id,
      approvalId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * POST /api/approvals/:id/reject
 * Rejects a pending approval.
 */
async function reject(req, res, next) {
  try {
    const { data, error } = validate(rejectApprovalSchema, req.body || {});
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error });
    }

    const result = await approvalService.reject({
      userId: req.user.id,
      approvalId: req.params.id,
      reason: data?.reason,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * GET /api/approvals
 * Lists approvals for the authenticated user.
 */
async function listApprovals(req, res, next) {
  try {
    const approvals = await approvalService.listApprovals({
      userId: req.user.id,
      status: req.query.status,
    });

    return res.status(200).json({
      success: true,
      approvals,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestApproval,
  getApprovalForAction,
  approve,
  reject,
  listApprovals,
};

