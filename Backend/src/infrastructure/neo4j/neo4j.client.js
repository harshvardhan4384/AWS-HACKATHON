'use strict';

const neo4j = require('neo4j-driver');
const config = require('../../config/env');

/**
 * Neo4j Client Infrastructure — Singleton driver management with lifecycle controls.
 *
 * Enforces:
 * - Singleton driver instance with connection pooling
 * - Safe credential isolation (passwords never logged or exposed)
 * - Observable connection failure without crashing the process
 * - Configurable database name and connection timeouts
 * - Driver injection for deterministic unit/offline testing
 */

let _driver = null;
let _mockDriver = null;
let _isClosed = false;

/**
 * Creates or retrieves the singleton Neo4j driver.
 *
 * @returns {import('neo4j-driver').Driver|object}
 */
function getDriver() {
  if (_mockDriver) {
    return _mockDriver;
  }

  if (_driver && !_isClosed) {
    return _driver;
  }

  const uri = config.neo4jUri || 'bolt://localhost:7687';
  const username = config.neo4jUsername || 'neo4j';
  const password = config.neo4jPassword || '';

  const auth = password ? neo4j.auth.basic(username, password) : undefined;

  _driver = neo4j.driver(uri, auth, {
    maxConnectionLifetime: config.neo4jMaxConnectionLifetimeMs || 3600000,
    connectionTimeout: config.neo4jConnectionTimeoutMs || 5000,
    disableLosslessIntegers: true, // Native JavaScript numbers
  });

  _isClosed = false;
  return _driver;
}

/**
 * Opens a new managed session on the default or specified database.
 *
 * @param {object} [options]
 * @param {string} [options.database]
 * @param {'READ'|'WRITE'} [options.defaultAccessMode]
 * @returns {import('neo4j-driver').Session|object}
 */
function getSession(options = {}) {
  const driver = getDriver();
  const sessionConfig = {
    database: options.database || config.neo4jDatabase || 'neo4j',
  };

  if (options.defaultAccessMode) {
    sessionConfig.defaultAccessMode =
      options.defaultAccessMode === 'READ'
        ? neo4j.session.READ
        : neo4j.session.WRITE;
  }

  return driver.session(sessionConfig);
}

let _lastHealthCheck = null;
let _lastHealthTime = 0;

/**
 * Performs a safe, non-blocking health check against the Neo4j instance.
 * Never throws unhandled errors or exposes credentials.
 * Uses 5-second TTL cache to prevent connection probe storms when offline.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{ healthy: boolean, status: string, latencyMs?: number, message?: string }>}
 */
async function checkNeo4jHealth(forceRefresh = false) {
  if (_mockDriver) {
    if (typeof _mockDriver.checkHealth === 'function') {
      return await _mockDriver.checkHealth();
    }
    return {
      healthy: true,
      status: 'healthy',
      latencyMs: 1,
      mode: 'mock',
    };
  }

  const now = Date.now();
  if (!forceRefresh && _lastHealthCheck && (now - _lastHealthTime < 5000)) {
    return _lastHealthCheck;
  }

  const startTime = now;

  try {
    const driver = getDriver();
    const timeoutMs = Math.min(config.neo4jConnectionTimeoutMs || 1500, 1500);

    const probePromise = driver.verifyConnectivity ? driver.verifyConnectivity() : Promise.resolve();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout to Neo4j')), timeoutMs);
    });

    await Promise.race([probePromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    _lastHealthCheck = {
      healthy: true,
      status: 'healthy',
      latencyMs,
    };
    _lastHealthTime = Date.now();
    return _lastHealthCheck;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const safeMessage = err.code || err.message || 'Connection failed';

    _lastHealthCheck = {
      healthy: false,
      status: 'unavailable',
      latencyMs,
      message: safeMessage.replace(new RegExp(config.neo4jPassword || '___none___', 'g'), '[REDACTED]'),
    };
    _lastHealthTime = Date.now();
    return _lastHealthCheck;
  }
}

/**
 * Gracefully closes the active driver instance.
 *
 * @returns {Promise<void>}
 */
async function closeDriver() {
  if (_driver) {
    try {
      await _driver.close();
    } catch (err) {
      console.error('[Neo4j Client] Error during driver shutdown:', err.message);
    } finally {
      _driver = null;
      _isClosed = true;
    }
  }
}

/**
 * Injects a mock driver for unit testing / offline verification.
 *
 * @param {object|null} mock
 */
function setMockDriver(mock) {
  _mockDriver = mock;
}

module.exports = {
  getDriver,
  getSession,
  checkNeo4jHealth,
  closeDriver,
  setMockDriver,
};
