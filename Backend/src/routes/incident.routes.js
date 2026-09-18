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

module.exports = router;
