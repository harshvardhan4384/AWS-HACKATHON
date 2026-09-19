'use strict';

const { getSession } = require('./neo4j.client');

/**
 * Neo4j Schema & Constraints Definition.
 *
 * Enforces uniqueness constraints on stable entity identifiers to guarantee
 * that repeated synchronizations cannot produce duplicate nodes.
 */
const SCHEMA_CONSTRAINTS = [
  {
    name: 'user_id_unique',
    cypher: 'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
  },
  {
    name: 'provider_id_unique',
    cypher: 'CREATE CONSTRAINT provider_id_unique IF NOT EXISTS FOR (p:Provider) REQUIRE p.id IS UNIQUE',
  },
  {
    name: 'account_id_unique',
    cypher: 'CREATE CONSTRAINT account_id_unique IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE',
  },
  {
    name: 'security_event_id_unique',
    cypher: 'CREATE CONSTRAINT security_event_id_unique IF NOT EXISTS FOR (e:SecurityEvent) REQUIRE e.id IS UNIQUE',
  },
  {
    name: 'incident_id_unique',
    cypher: 'CREATE CONSTRAINT incident_id_unique IF NOT EXISTS FOR (i:Incident) REQUIRE i.id IS UNIQUE',
  },
  {
    name: 'evidence_id_unique',
    cypher: 'CREATE CONSTRAINT evidence_id_unique IF NOT EXISTS FOR (ev:Evidence) REQUIRE ev.id IS UNIQUE',
  },
  {
    name: 'oauth_app_id_unique',
    cypher: 'CREATE CONSTRAINT oauth_app_id_unique IF NOT EXISTS FOR (o:OAuthApp) REQUIRE o.id IS UNIQUE',
  },
  {
    name: 'ssh_key_id_unique',
    cypher: 'CREATE CONSTRAINT ssh_key_id_unique IF NOT EXISTS FOR (s:SSHKey) REQUIRE s.id IS UNIQUE',
  },
  {
    name: 'session_id_unique',
    cypher: 'CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (sess:Session) REQUIRE sess.id IS UNIQUE',
  },
  {
    name: 'device_id_unique',
    cypher: 'CREATE CONSTRAINT device_id_unique IF NOT EXISTS FOR (d:Device) REQUIRE d.id IS UNIQUE',
  },
];

/**
 * Applies all schema constraints to the active Neo4j database.
 * Idempotent: `IF NOT EXISTS` syntax ensures existing constraints are untouched.
 *
 * @param {object} [customSession] - Optional injected session
 * @returns {Promise<{ applied: string[], skipped: string[], errors: string[] }>}
 */
async function initGraphSchema(customSession = null) {
  const applied = [];
  const skipped = [];
  const errors = [];

  const { checkNeo4jHealth } = require('./neo4j.client');
  const health = await checkNeo4jHealth();
  if (!health.healthy) {
    return {
      applied,
      skipped,
      errors: ['Neo4j instance is offline or unavailable'],
    };
  }

  let session = customSession;
  let shouldClose = false;

  if (!session) {
    try {
      session = getSession({ defaultAccessMode: 'WRITE' });
      shouldClose = true;
    } catch (err) {
      return {
        applied: [],
        skipped: [],
        errors: [`Could not open session: ${err.message}`],
      };
    }
  }

  try {
    for (const constraint of SCHEMA_CONSTRAINTS) {
      try {
        await session.run(constraint.cypher);
        applied.push(constraint.name);
      } catch (err) {
        // Handle database syntax compatibility differences or already exists errors
        if (err.message && (err.message.includes('already exists') || err.message.includes('An equivalent constraint'))) {
          skipped.push(constraint.name);
        } else {
          errors.push(`${constraint.name}: ${err.message}`);
        }
      }
    }
  } finally {
    if (shouldClose && session && typeof session.close === 'function') {
      try {
        await session.close();
      } catch {
        // Safe swallow
      }
    }
  }

  return { applied, skipped, errors };
}

module.exports = {
  SCHEMA_CONSTRAINTS,
  initGraphSchema,
};
