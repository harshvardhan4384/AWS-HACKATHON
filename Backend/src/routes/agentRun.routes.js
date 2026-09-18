'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const investigationController = require('../controllers/investigation.controller');

// All agent-run routes require authentication
router.use(authenticate);

// GET /api/agent-runs/:id — Get AgentRun detail
router.get('/:id', investigationController.getAgentRun);

module.exports = router;

