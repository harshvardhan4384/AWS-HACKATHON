'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const detectionController = require('../controllers/detection.controller');

// All detection routes require authentication
router.use(authenticate);

// POST /api/events/:id/analyze — Run detection pipeline on an event
router.post('/:id/analyze', detectionController.analyze);

// GET /api/events/:id/findings — Get finding Evidence records for an event
router.get('/:id/findings', detectionController.getFindings);

module.exports = router;
