'use strict';

const express = require('express');
const eventController = require('../controllers/event.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// All event ingestion and query routes are strictly protected by Re:COVER user session
router.use(authenticate);

// Event ingestion
router.post('/ingest', eventController.ingest);

// AWS simulation (hackathon demo convenience)
router.post('/simulate-aws', eventController.simulateAws);

// Event queries & tenant-isolated details
router.get('/', eventController.list);
router.get('/:id', eventController.getById);

// Blast radius analysis for security event
const blastRadiusController = require('../controllers/blastRadius.controller');
router.post('/:id/blast-radius', blastRadiusController.getEventBlastRadius);
router.get('/:id/blast-radius', blastRadiusController.getEventBlastRadius);

module.exports = router;

