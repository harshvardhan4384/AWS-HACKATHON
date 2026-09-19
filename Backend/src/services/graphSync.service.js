'use strict';

const { randomUUID } = require('crypto');
const { graphRepository } = require('../repositories/graph.repository');
const userRepository = require('../repositories/user.repository');
const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const securityEventRepository = require('../repositories/securityEvent.repository');
const incidentRepository = require('../repositories/incident.repository');
const findingRepository = require('../repositories/finding.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { getDb } = require('../lib/db');

/**
 * GraphSyncService — Orchestrates idempotent synchronization of PostgreSQL records
 * into the derived Neo4j Identity and Attack Graph projection.
 *
 * Guarantees:
 * - PostgreSQL is ALWAYS the authoritative source of truth
 * - Zero rollbacks in PostgreSQL if Neo4j is offline or fails
 * - Audit logging of all sync attempts and outcomes
 * - Fully idempotent: repeated synchronization produces no duplicate nodes or edges
 */
class GraphSyncService {
  /**
   * Synchronizes a single user root node.
   *
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async syncUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error(`User '${userId}' not found`);
    }
    return await graphRepository.mergeUser(user);
  }

  /**
   * Synchronizes a connected account and its provider link.
   *
   * @param {string} userId
   * @param {string} accountId
   * @returns {Promise<object>}
   */
  async syncAccount(userId, accountId) {
    const account = await connectedAccountRepository.findById(accountId);
    if (!account || account.userId !== userId) {
      throw new Error(`Account '${accountId}' not found or does not belong to user '${userId}'`);
    }

    // 1. Merge Provider node
    await graphRepository.mergeProvider(account.provider);

    // 2. Merge Account node
    await graphRepository.mergeAccount(account);

    // 3. Link User -> Account
    await graphRepository.linkUserToAccount(userId, account.id);

    // 4. Link Account -> Provider
    await graphRepository.linkAccountToProvider(account.id, account.provider);

    return account;
  }

  /**
   * Synchronizes a security event and its account link.
   *
   * @param {string} userId
   * @param {string} eventId
   * @returns {Promise<object>}
   */
  async syncSecurityEvent(userId, eventId) {
    const event = await securityEventRepository.findById(eventId);
    if (!event || event.userId !== userId) {
      throw new Error(`SecurityEvent '${eventId}' not found or does not belong to user '${userId}'`);
    }

    // 1. Merge SecurityEvent node
    await graphRepository.mergeSecurityEvent(event);

    // 2. Link Account -> SecurityEvent if connectedAccountId present
    if (event.connectedAccountId) {
      await graphRepository.linkAccountToEvent(event.connectedAccountId, event.id);
    }

    // 3. Link SecurityEvent -> Incident if incidentId present
    if (event.incidentId) {
      await graphRepository.linkEventToIncident(event.id, event.incidentId);
    }

    return event;
  }

  /**
   * Synchronizes an incident, its evidence, and linked event relationships.
   *
   * @param {string} userId
   * @param {string} incidentId
   * @returns {Promise<object>}
   */
  async syncIncident(userId, incidentId) {
    const incident = await incidentRepository.findWithEvidence(incidentId, userId);
    if (!incident) {
      throw new Error(`Incident '${incidentId}' not found or does not belong to user '${userId}'`);
    }

    // 1. Merge Incident node
    await graphRepository.mergeIncident(incident);

    // 2. Merge and link all Evidence records
    if (incident.evidence && incident.evidence.length > 0) {
      for (const ev of incident.evidence) {
        await graphRepository.mergeEvidence(ev);
        await graphRepository.linkIncidentToEvidence(incident.id, ev.id);
      }
    }

    // 3. Link related SecurityEvents
    if (incident.linkedEvents && incident.linkedEvents.length > 0) {
      for (const ev of incident.linkedEvents) {
        await graphRepository.linkEventToIncident(ev.id, incident.id);
      }
    }

    return incident;
  }

  /**
   * Synchronizes a single evidence record.
   *
   * @param {string} userId
   * @param {string} evidenceId
   * @returns {Promise<object>}
   */
  async syncEvidence(userId, evidenceId) {
    const evidence = await findingRepository.findById(evidenceId);
    if (!evidence) {
      throw new Error(`Evidence '${evidenceId}' not found`);
    }

    // Verify parent incident belongs to user
    const incident = await incidentRepository.findByIdAndUserId(evidence.incidentId, userId);
    if (!incident) {
      throw new Error(`Evidence parent incident not accessible to user '${userId}'`);
    }

    await graphRepository.mergeEvidence(evidence);
    await graphRepository.linkIncidentToEvidence(evidence.incidentId, evidence.id);
    return evidence;
  }

  /**
   * Complete, idempotent projection of a user's entire digital identity and security graph.
   *
   * @param {string} userId
   * @param {object} [options]
   * @param {string} [options.correlationId]
   * @returns {Promise<{ success: boolean, status: string, counts: object, error?: string }>}
   */
  async syncFullUserGraph(userId, options = {}) {
    const correlationId = options.correlationId || randomUUID();

    // 1. Audit Start
    await auditLogRepository.create({
      userId,
      actorType: 'SYSTEM',
      actorId: 'GraphSyncService',
      actionType: 'GRAPH_SYNC_STARTED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      correlationId,
      metadata: { initiatedAt: new Date().toISOString() },
    });

    const counts = {
      accounts: 0,
      events: 0,
      incidents: 0,
      evidence: 0,
      sequences: 0,
    };

    try {
      // 2. Fetch User & Sync Root Node
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new Error(`User '${userId}' not found`);
      }
      await graphRepository.mergeUser(user);

      // 3. Fetch and Sync Connected Accounts
      const accounts = await connectedAccountRepository.listByUserId(userId);
      for (const acc of accounts) {
        await graphRepository.mergeProvider(acc.provider);
        await graphRepository.mergeAccount(acc);
        await graphRepository.linkUserToAccount(userId, acc.id);
        await graphRepository.linkAccountToProvider(acc.id, acc.provider);
        counts.accounts++;
      }

      // 4. Fetch and Sync SecurityEvents for User
      const db = getDb();
      const events = await db.orm.public.SecurityEvent.where({ userId })
        .limit(500)
        .all();

      events.sort((a, b) => new Date(a.occurredAt || a.createdAt).getTime() - new Date(b.occurredAt || b.createdAt).getTime());

      for (const ev of events) {
        await graphRepository.mergeSecurityEvent(ev);
        if (ev.connectedAccountId) {
          await graphRepository.linkAccountToEvent(ev.connectedAccountId, ev.id);
        }
        if (ev.incidentId) {
          await graphRepository.linkEventToIncident(ev.id, ev.incidentId);
        }
        counts.events++;
      }

      // 5. Correlate Event Sequences (Attack Sequences)
      // Group events by connected account and link chronological pairs (PRECEDES)
      const eventsByAccount = new Map();
      for (const ev of events) {
        if (!ev.connectedAccountId) continue;
        if (!eventsByAccount.has(ev.connectedAccountId)) {
          eventsByAccount.set(ev.connectedAccountId, []);
        }
        eventsByAccount.get(ev.connectedAccountId).push(ev);
      }

      for (const [, accEvents] of eventsByAccount.entries()) {
        for (let i = 0; i < accEvents.length - 1; i++) {
          const first = accEvents[i];
          const second = accEvents[i + 1];

          const t1 = new Date(first.occurredAt || first.createdAt).getTime();
          const t2 = new Date(second.occurredAt || second.createdAt).getTime();
          const intervalMs = Math.abs(t2 - t1);

          // If events occurred within 60 minutes, create temporal PRECEDES relationship
          if (intervalMs <= 60 * 60 * 1000) {
            await graphRepository.linkEventSequence(first.id, second.id, {
              correlationType: 'TEMPORAL',
              intervalMs,
              source: 'GRAPH_SYNC_ENGINE',
            });
            counts.sequences++;
          }
        }
      }

      // 6. Fetch and Sync Incidents & Evidence
      const incidents = await db.orm.public.Incident.where({ userId })
        .limit(100)
        .all();

      incidents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      for (const inc of incidents) {
        await graphRepository.mergeIncident(inc);
        counts.incidents++;

        // Sync evidence attached to incident
        const evidenceList = await findingRepository.findByIncidentId(inc.id);
        for (const ev of evidenceList) {
          await graphRepository.mergeEvidence(ev);
          await graphRepository.linkIncidentToEvidence(inc.id, ev.id);
          counts.evidence++;
        }
      }

      // 7. Audit Completion
      await auditLogRepository.create({
        userId,
        actorType: 'SYSTEM',
        actorId: 'GraphSyncService',
        actionType: 'GRAPH_SYNC_COMPLETED',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        correlationId,
        metadata: { counts, completedAt: new Date().toISOString() },
      });

      return {
        success: true,
        status: 'NEO4J_SYNC_SUCCESS',
        counts,
      };
    } catch (err) {
      // 8. Failure handling: PostgreSQL is NOT rolled back
      await auditLogRepository.create({
        userId,
        actorType: 'SYSTEM',
        actorId: 'GraphSyncService',
        actionType: 'GRAPH_SYNC_FAILED',
        targetType: 'User',
        targetId: userId,
        result: 'FAILURE',
        correlationId,
        metadata: { error: err.message },
      });

      return {
        success: false,
        status: 'NEO4J_SYNC_FAILED',
        counts,
        error: err.message,
      };
    }
  }

  /**
   * Checks graph consistency between PostgreSQL and Neo4j for a user.
   *
   * @param {string} userId
   * @returns {Promise<object>} Reconciliation report
   */
  async reconcileUserGraph(userId) {
    const correlationId = randomUUID();

    await auditLogRepository.create({
      userId,
      actorType: 'SYSTEM',
      actorId: 'GraphSyncService',
      actionType: 'GRAPH_RECONCILIATION_STARTED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      correlationId,
    });

    const db = getDb();
    const [pgAccounts, events, incidents] = await Promise.all([
      connectedAccountRepository.listByUserId(userId),
      db.orm.public.SecurityEvent.where({ userId }).all(),
      db.orm.public.Incident.where({ userId }).all(),
    ]);

    const pgEvents = events.length;
    const pgIncidents = incidents.length;

    const graphCounts = await graphRepository.getCountsForUser(userId);

    const accountsDiff = pgAccounts.length - graphCounts.accounts;
    const eventsDiff = pgEvents - graphCounts.events;
    const incidentsDiff = pgIncidents - graphCounts.incidents;

    const isConsistent = accountsDiff === 0 && eventsDiff === 0 && incidentsDiff === 0;

    const report = {
      userId,
      consistent: isConsistent,
      pgCounts: {
        accounts: pgAccounts.length,
        events: pgEvents,
        incidents: pgIncidents,
      },
      graphCounts,
      differences: {
        accountsDiff,
        eventsDiff,
        incidentsDiff,
      },
      reconciledAt: new Date().toISOString(),
    };

    await auditLogRepository.create({
      userId,
      actorType: 'SYSTEM',
      actorId: 'GraphSyncService',
      actionType: 'GRAPH_RECONCILIATION_COMPLETED',
      targetType: 'User',
      targetId: userId,
      result: isConsistent ? 'SUCCESS' : 'FAILURE',
      correlationId,
      metadata: report,
    });

    return report;
  }
}

const graphSyncService = new GraphSyncService();

module.exports = {
  GraphSyncService,
  graphSyncService,
};
