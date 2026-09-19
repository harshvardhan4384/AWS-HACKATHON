'use strict';

const { recoveryPlannerService } = require('../services/recoveryPlanner.service');
const { actionExecutorService } = require('../services/actionExecutor.service');
const recoveryActionRepository = require('../repositories/recoveryAction.repository');
const incidentRepository = require('../repositories/incident.repository');
const { createRecoveryPlanSchema, executeActionSchema, validate } = require('../validators/recovery.validator');

/**
 * POST /api/incidents/:id/recovery-plan
 * Generates and persists a recovery plan for the authenticated user's incident.
 */
async function createRecoveryPlan(req, res, next) {
  try {
    const { data, error } = validate(createRecoveryPlanSchema, req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error });
    }

    const plan = await recoveryPlannerService.generatePlan({
      userId: req.user.id,
      incidentId: req.params.id,
      options: data.options || {},
    });

    return res.status(201).json(plan);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * GET /api/incidents/:id/recovery-plan
 * Returns the current recovery plan (all proposed/executed actions) for an incident.
 */
async function getRecoveryPlan(req, res, next) {
  try {
    const plan = await recoveryPlannerService.getPlan({
      userId: req.user.id,
      incidentId: req.params.id,
    });

    return res.status(200).json(plan);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * POST /api/recovery-actions/:id/execute
 * Executes a recovery action with explicit authorization.
 * AUTHORIZATION BOUNDARY: Will reject without a valid authorization context.
 */
async function executeAction(req, res, next) {
  try {
    const { data, error } = validate(executeActionSchema, req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error });
    }

    const result = await actionExecutorService.execute({
      userId: req.user.id,
      actionId: req.params.id,
      authorization: data.authorization,
    });

    // Idempotent: already executed returns 200 not 201
    const statusCode = result.status === 'ALREADY_EXECUTED' ? 200 : 200;
    return res.status(statusCode).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    next(err);
  }
}

/**
 * GET /api/recovery-actions/:id
 * Returns a single RecoveryAction record for the authenticated user.
 */
async function getAction(req, res, next) {
  try {
    const action = await recoveryActionRepository.findById(req.params.id);
    if (!action) {
      return res.status(404).json({ error: 'Recovery action not found' });
    }

    // Verify ownership through incident
    const incident = await incidentRepository.findById(action.incidentId);
    if (!incident || incident.userId !== req.user.id) {
      return res.status(404).json({ error: 'Recovery action not found' });
    }

    return res.status(200).json(action);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRecoveryPlan,
  getRecoveryPlan,
  executeAction,
  getAction,
};

