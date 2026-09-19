'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const detectionController = require('../controllers/detection.controller');
const investigationController = require('../controllers/investigation.controller');

// All incident routes require authentication
router.use(authenticate);

// GET /api/incidents — List incidents for the authenticated user
router.get('/', detectionController.listIncidents);

// GET /api/incidents/:id — Get incident with evidence and linked events
router.get('/:id', detectionController.getIncidentById);

// POST /api/incidents/:id/investigate — Start AI investigation
router.post('/:id/investigate', investigationController.investigate);

// GET /api/incidents/:id/investigation — Get latest AI investigation
router.get('/:id/investigation', investigationController.getInvestigation);

// POST /api/incidents/:id/blast-radius — Calculate blast radius for incident
const blastRadiusController = require('../controllers/blastRadius.controller');
router.post('/:id/blast-radius', blastRadiusController.getIncidentBlastRadius);
router.get('/:id/blast-radius', blastRadiusController.getIncidentBlastRadius);

// POST /api/incidents/:id/recovery-plan — Generate recovery plan for incident
// GET  /api/incidents/:id/recovery-plan — Get current recovery plan for incident
const recoveryController = require('../controllers/recovery.controller');
router.post('/:id/recovery-plan', recoveryController.createRecoveryPlan);
router.get('/:id/recovery-plan', recoveryController.getRecoveryPlan);

// Verification & Resolution routes (Task 15)
const verificationController = require('../controllers/verification.controller');
router.post('/:id/verify', verificationController.verifyIncident);
router.get('/:id/verification', verificationController.getIncidentVerification);

module.exports = router;

