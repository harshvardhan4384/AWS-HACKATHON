'use strict';

const { Router } = require('express');
const { getHealth, getDbHealth } = require('../controllers/health.controller');

const router = Router();

// GET /api/health  — liveness (Express is running)
router.get('/', getHealth);

// GET /api/health/db — readiness (Prisma → PostgreSQL connectivity)
router.get('/db', getDbHealth);

module.exports = router;
