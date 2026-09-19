'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const recoveryController = require('../controllers/recovery.controller');
const policyController = require('../controllers/policy.controller');
const approvalController = require('../controllers/approval.controller');

// All recovery action routes require authentication
router.use(authenticate);

// GET /api/recovery-actions/:id — Get a single recovery action
router.get('/:id', recoveryController.getAction);

// POST /api/recovery-actions/:id/execute — Execute with explicit authorization
router.post('/:id/execute', recoveryController.executeAction);

// POST /api/recovery-actions/:id/policy-evaluate — Deterministically evaluate security policy
router.post('/:id/policy-evaluate', policyController.evaluatePolicy);

// POST /api/recovery-actions/:id/approval-request — Request approval or auto-authorize
router.post('/:id/approval-request', approvalController.requestApproval);

// GET /api/recovery-actions/:id/approval — Get latest approval for recovery action
router.get('/:id/approval', approvalController.getApprovalForAction);

const verificationController = require('../controllers/verification.controller');

// POST /api/recovery-actions/:id/verify — Authoritatively verify recovery action outcome
router.post('/:id/verify', verificationController.verifyAction);

// GET /api/recovery-actions/:id/verification — Get verification outcome for recovery action
router.get('/:id/verification', verificationController.getActionVerification);

module.exports = router;


