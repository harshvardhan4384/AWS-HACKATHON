'use strict';

const { checkNeo4jHealth } = require('../infrastructure/neo4j/neo4j.client');

/**
 * GET /api/health
 *
 * Liveness check — confirms the Express process is running.
 * Also reports non-blocking status of Neo4j graph subsystem.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getHealth = async (req, res) => {
  let neo4jStatus = 'unavailable';
  try {
    const neo4jHealth = await checkNeo4jHealth();
    neo4jStatus = neo4jHealth.healthy ? 'healthy' : 'unavailable';
  } catch {
    neo4jStatus = 'unavailable';
  }

  res.status(200).json({
    success: true,
    service: 'Re:COVER Backend',
    status: 'healthy',
    neo4j: neo4jStatus,
  });
};

/**
 * GET /api/health/db
 *
 * Readiness check — verifies Prisma 8 RC → PostgreSQL connectivity.
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

/**
 * GET /api/health/neo4j
 *
 * Readiness check for Neo4j Identity / Attack Graph subsystem.
 * Never exposes credentials or connection URIs.
 */
const getNeo4jHealth = async (req, res) => {
  try {
    const neo4jHealth = await checkNeo4jHealth();

    if (neo4jHealth.healthy) {
      return res.status(200).json({
        success: true,
        neo4j: 'healthy',
        latencyMs: neo4jHealth.latencyMs,
      });
    }

    return res.status(503).json({
      success: false,
      neo4j: 'unavailable',
      error: neo4jHealth.message || 'Connection failed',
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      neo4j: 'unavailable',
      error: 'Health check failed',
    });
  }
};

module.exports = {
  getHealth,
  getDbHealth,
  getNeo4jHealth,
};
