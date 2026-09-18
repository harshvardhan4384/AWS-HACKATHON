'use strict';

/**
 * GET /api/health
 *
 * Liveness check — confirms the Express process is running.
 * No DB or external service probes here.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    service: 'Re:COVER Backend',
    status: 'healthy',
  });
};

/**
 * GET /api/health/db
 *
 * Readiness check — verifies Prisma 8 RC → PostgreSQL connectivity.
 *
 * Prisma 8 RC raw SQL pattern:
 *   const plan = db.raw.sql`SELECT 1`.affectedCount().build();
 *   await db.runtime().execute(plan);
 *
 * Response NEVER exposes:
 *   - DATABASE_URL or any credentials
 *   - Raw Prisma/PostgreSQL error messages
 *   - Internal stack traces
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getDbHealth = async (req, res) => {
  try {
    const { getDb } = require('../lib/db');
    const db = getDb();

    // Prisma 8 RC: build the plan, then execute via runtime
    const plan = db.raw.sql`SELECT 1`.affectedCount().build();
    const runtime = await db.runtime();
    await runtime.execute(plan);

    res.status(200).json({
      success: true,
      database: 'connected',
    });
  } catch (err) {
    // Log real error server-side only — never expose to client
    console.error('[DB Health] connectivity check failed:', err.message);

    res.status(503).json({
      success: false,
      database: 'unavailable',
    });
  }
};

module.exports = { getHealth, getDbHealth };
