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

module.exports = router;

