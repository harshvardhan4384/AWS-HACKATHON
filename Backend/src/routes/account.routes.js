'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const blastRadiusController = require('../controllers/blastRadius.controller');

const router = Router();

// All account routes require authentication
router.use(authenticate);

// Blast radius analysis for connected account
router.post('/:id/blast-radius', blastRadiusController.getAccountBlastRadius);
router.get('/:id/blast-radius', blastRadiusController.getAccountBlastRadius);

module.exports = router;

