'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const {
  getOverview,
  getAccountNeighborhood,
  getIncidentNeighborhood,
  getEventNeighborhood,
  syncUserGraph,
  reconcileGraph,
} = require('../controllers/graph.controller');

const router = Router();

// All graph routes require user authentication
router.use(authenticate);

// GET /api/graph/overview — Complete user digital identity and security graph
router.get('/overview', getOverview);

// GET /api/graph/account/:accountId — Neighborhood graph for connected account
router.get('/account/:accountId', getAccountNeighborhood);

// GET /api/graph/incident/:incidentId — Neighborhood graph for security incident
router.get('/incident/:incidentId', getIncidentNeighborhood);

// GET /api/graph/event/:eventId — Neighborhood graph for security event with attack paths
router.get('/event/:eventId', getEventNeighborhood);

// POST /api/graph/sync — Trigger explicit full synchronization of user graph
router.post('/sync', syncUserGraph);

// GET /api/graph/reconcile — Check graph consistency against PostgreSQL authority
router.get('/reconcile', reconcileGraph);

module.exports = router;

