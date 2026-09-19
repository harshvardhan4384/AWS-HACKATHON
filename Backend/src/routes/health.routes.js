'use strict';

const { Router } = require('express');
const { getHealth, getDbHealth, getNeo4jHealth } = require('../controllers/health.controller');

const router = Router();

// GET /api/health — liveness (Express is running, reports subsystem statuses)
router.get('/', getHealth);

// GET /api/health/db — readiness (Prisma → PostgreSQL connectivity)
router.get('/db', getDbHealth);

// GET /api/health/neo4j — readiness (Neo4j graph connectivity)
router.get('/neo4j', getNeo4jHealth);

module.exports = router;
