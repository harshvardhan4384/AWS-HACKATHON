'use strict';

/**
 * Prisma 8 RC — CommonJS-compatible database client singleton.
 *
 * Prisma 8 RC uses `@prisma/orm-postgres` runtime (NOT `new PrismaClient()`).
 * The scaffolded `src/prisma/db.ts` uses ESM-only import assertions
 * (`import ... with { type: 'json' }`), which cannot run in a CommonJS project.
 *
 * This module is the CommonJS equivalent:
 *   - Loads contract.json via require() (CommonJS-safe)
 *   - Initializes the @prisma/orm-postgres client once (singleton)
 *   - Never exposes DATABASE_URL in logs or errors
 *
 * Usage:
 *   const { getDb } = require('./lib/db');
 *   const db = getDb();
 *   await db.execute`SELECT 1`;
 */

const config = require('../config/env');

let _db = null;

/**
 * Returns the singleton Prisma 8 database client.
 * Lazy-initializes on first call.
 *
 * @returns {object} Prisma 8 db client
 * @throws {Error} If DATABASE_URL is not set or packages are missing
 */
function getDb() {
  if (_db) return _db;

  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not configured. ' +
      'Add it to Backend/.env before using the database.'
    );
  }

  // require() is CommonJS-safe for loading JSON
  let contractJson;
  try {
    contractJson = require('../prisma/contract.json');
  } catch (err) {
    throw new Error(
      'contract.json not found. Run: npx prisma contract emit\n' +
      'Original: ' + err.message
    );
  }

  // Load the @prisma/orm-postgres runtime
  let postgres;
  try {
    postgres = require('@prisma/orm-postgres/runtime');
    // Handle both default export shapes (CJS default wrapper vs direct)
    if (postgres && typeof postgres.default === 'function') {
      postgres = postgres.default;
    }
  } catch (err) {
    throw new Error(
      '@prisma/orm-postgres is not installed. Run: npm install @prisma/orm-postgres\n' +
      'Original: ' + err.message
    );
  }

  _db = postgres({
    contractJson,
    url: config.databaseUrl,
  });

  return _db;
}

module.exports = { getDb };

