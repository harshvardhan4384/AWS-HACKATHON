'use strict';

const { policyEngineService } = require('../services/policyEngine.service');
const { userPolicyRepository } = require('../repositories/userPolicy.repository');
const {
  updatePolicyPreferencesSchema,
  evaluatePolicySchema,
  validate,
} = require('../validators/policy.validator');

/**
 * POST /api/recovery-actions/:id/policy-evaluate
 * Deterministically evaluates security policy for an action.
 */
async function evaluatePolicy(req, res, next) {
  try {
    const { data, error } = validate(evaluatePolicySchema, req.body || {});
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error });
    }

    const decision = await policyEngineService.evaluateAction({
      userId: req.user.id,
      actionId: req.params.id,
      clientActionHash: data?.clientActionHash || null,
    });

    return res.status(200).json({
      success: true,
      ...decision,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * GET /api/policy/preferences
 * Returns the current user's explicit automation policy settings.
 */
async function getPreferences(req, res, next) {
  try {
    const preferences = await userPolicyRepository.getUserPolicy(req.user.id);
    return res.status(200).json({
      success: true,
      preferences,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/policy/preferences
 * Updates the current user's explicit automation policy settings.
 */
async function updatePreferences(req, res, next) {
  try {
    const { data, error } = validate(updatePolicyPreferencesSchema, req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error });
    }

    const preferences = await userPolicyRepository.updateUserPolicy(req.user.id, data);
    return res.status(200).json({
      success: true,
      preferences,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  evaluatePolicy,
  getPreferences,
  updatePreferences,
};

