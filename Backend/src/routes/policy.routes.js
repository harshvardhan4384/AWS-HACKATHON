'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const policyController = require('../controllers/policy.controller');

// All policy routes require authentication
router.use(authenticate);

// GET /api/policy/preferences — Get current user automation preferences
router.get('/preferences', policyController.getPreferences);

// PUT /api/policy/preferences — Update user automation preferences
router.put('/preferences', policyController.updatePreferences);

module.exports = router;

