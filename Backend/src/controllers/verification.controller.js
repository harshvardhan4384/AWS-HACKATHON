'use strict';

const { verificationService } = require('../services/verification.service');
const {
  uuidParamSchema,
  verifyActionSchema,
  verifyIncidentSchema,
  validate,
} = require('../validators/verification.validator');

/**
 * POST /api/recovery-actions/:id/verify
 * Triggers authoritative verification for a specific recovery action.
 */
async function verifyAction(req, res, next) {
  try {
    const paramValidation = validate(uuidParamSchema, req.params.id);
    if (paramValidation.error) {
      return res.status(400).json({ error: `Invalid action ID: ${paramValidation.error}` });
    }

    const bodyValidation = validate(verifyActionSchema, req.body || {});
    if (bodyValidation.error) {
      return res.status(400).json({ error: bodyValidation.error });
    }

    const result = await verificationService.verifyRecoveryAction({
      userId: req.user.id,
      actionId: req.params.id,
      correlationId: bodyValidation.data?.correlationId,
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * GET /api/recovery-actions/:id/verification
 * Retrieves the verification outcome for a recovery action.
 */
async function getActionVerification(req, res, next) {
  try {
    const paramValidation = validate(uuidParamSchema, req.params.id);
    if (paramValidation.error) {
      return res.status(400).json({ error: `Invalid action ID: ${paramValidation.error}` });
    }

    const result = await verificationService.getRecoveryActionVerification({
      userId: req.user.id,
      actionId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      verification: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * POST /api/incidents/:id/verify
 * Evaluates holistic recovery verification and incident resolution.
 */
async function verifyIncident(req, res, next) {
  try {
    const paramValidation = validate(uuidParamSchema, req.params.id);
    if (paramValidation.error) {
      return res.status(400).json({ error: `Invalid incident ID: ${paramValidation.error}` });
    }

    const bodyValidation = validate(verifyIncidentSchema, req.body || {});
    if (bodyValidation.error) {
      return res.status(400).json({ error: bodyValidation.error });
    }

    const result = await verificationService.verifyIncident({
      userId: req.user.id,
      incidentId: req.params.id,
      correlationId: bodyValidation.data?.correlationId,
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * GET /api/incidents/:id/verification
 * Retrieves the current verification and resolution summary for an incident.
 */
async function getIncidentVerification(req, res, next) {
  try {
    const paramValidation = validate(uuidParamSchema, req.params.id);
    if (paramValidation.error) {
      return res.status(400).json({ error: `Invalid incident ID: ${paramValidation.error}` });
    }

    const result = await verificationService.getIncidentVerification({
      userId: req.user.id,
      incidentId: req.params.id,
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

module.exports = {
  verifyAction,
  getActionVerification,
  verifyIncident,
  getIncidentVerification,
};

