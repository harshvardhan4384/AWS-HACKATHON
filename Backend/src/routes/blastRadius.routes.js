'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const {
  calculate,
  getIncidentBlastRadius,
  getAccountBlastRadius,
  getEventBlastRadius,
} = require('../controllers/blastRadius.controller');

const router = Router();

// All blast radius calculations require user authentication
router.use(authenticate);

// POST /api/blast-radius/calculate — General calculation endpoint
router.post('/calculate', calculate);

// Incident blast radius
router.post('/incident/:id', getIncidentBlastRadius);
router.get('/incident/:id', getIncidentBlastRadius);

// Account blast radius
router.post('/account/:id', getAccountBlastRadius);
router.get('/account/:id', getAccountBlastRadius);

// Event blast radius
router.post('/event/:id', getEventBlastRadius);
router.get('/event/:id', getEventBlastRadius);

module.exports = router;

