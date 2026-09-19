'use strict';

const { randomUUID } = require('crypto');
const { graphRepository } = require('../repositories/graph.repository');
const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const incidentRepository = require('../repositories/incident.repository');
const securityEventRepository = require('../repositories/securityEvent.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { redactSensitive } = require('../utils/redaction');

/**
 * GraphService — Core service for reading and querying the Neo4j Identity / Attack Graph.
 *
 * Enforces:
 * - Strict tenant boundaries: User A cannot read or know of User B's graph objects
 * - Complete data minimization & sanitization (passwords, tokens, private keys redacted)
 * - Standardized frontend-friendly format: { nodes: [...], edges: [...] }
 * - Security audit logging on graph queries
 */
class GraphService {
  /**
   * Retrieves the neighborhood graph for a specific connected account.
   *
   * @param {string} userId - Authenticated user ID
   * @param {string} accountId - Target connected account ID
   * @returns {Promise<{ nodes: object[], edges: object[] }>}
   */
  async getAccountGraph(userId, accountId) {
    // 1. Enforce Tenant Ownership in PostgreSQL Authority
    const account = await connectedAccountRepository.findById(accountId);
    if (!account || account.userId !== userId) {
      const err = new Error('Account not found');
      err.statusCode = 404;
      throw err;
    }

    const correlationId = randomUUID();

    // 2. Query Graph Repository
    const graphData = await graphRepository.getAccountNeighborhood(userId, accountId);

    // 3. Audit query
    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'GRAPH_QUERY_EXECUTED',
      targetType: 'Account',
      targetId: accountId,
      result: 'SUCCESS',
      correlationId,
      metadata: { query: 'getAccountNeighborhood' },
    });

    if (!graphData) {
      // Fallback: If not yet projected into Neo4j, return single synthesized node from PG
      return {
        nodes: [
          {
            id: account.id,
            type: 'Account',
            label: account.providerDisplayName || account.provider,
            properties: redactSensitive({
              id: account.id,
              userId: account.userId,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              status: account.status,
              createdAt: account.createdAt,
            }),
          },
        ],
        edges: [],
      };
    }

    return this._sanitizeGraphData(graphData);
  }

  /**
   * Retrieves the neighborhood graph for a security incident.
   *
   * @param {string} userId - Authenticated user ID
   * @param {string} incidentId - Target incident ID
   * @returns {Promise<{ nodes: object[], edges: object[] }>}
   */
  async getIncidentGraph(userId, incidentId) {
    // 1. Enforce Tenant Ownership in PostgreSQL Authority
    const incident = await incidentRepository.findByIdAndUserId(incidentId, userId);
    if (!incident) {
      const err = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    const correlationId = randomUUID();

    // 2. Query Graph Repository
    const graphData = await graphRepository.getIncidentNeighborhood(userId, incidentId);

    // 3. Audit query
    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'GRAPH_QUERY_EXECUTED',
      targetType: 'Incident',
      targetId: incidentId,
      result: 'SUCCESS',
      correlationId,
      metadata: { query: 'getIncidentNeighborhood' },
    });

    if (!graphData) {
      return {
        nodes: [
          {
            id: incident.id,
            type: 'Incident',
            label: incident.title,
            properties: redactSensitive({
              id: incident.id,
              userId: incident.userId,
              title: incident.title,
              severity: incident.severity,
              status: incident.status,
              startedAt: incident.startedAt,
            }),
          },
        ],
        edges: [],
      };
    }

    return this._sanitizeGraphData(graphData);
  }

  /**
   * Retrieves the neighborhood graph for a specific security event.
   *
   * @param {string} userId - Authenticated user ID
   * @param {string} eventId - Target security event ID
   * @returns {Promise<{ nodes: object[], edges: object[] }>}
   */
  async getEventGraph(userId, eventId) {
    // 1. Enforce Tenant Ownership in PostgreSQL Authority
    const event = await securityEventRepository.findById(eventId);
    if (!event || event.userId !== userId) {
      const err = new Error('SecurityEvent not found');
      err.statusCode = 404;
      throw err;
    }

    const correlationId = randomUUID();

    // 2. Query Graph Repository
    const graphData = await graphRepository.getEventNeighborhood(userId, eventId);

    // 3. Audit query
    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'GRAPH_QUERY_EXECUTED',
      targetType: 'SecurityEvent',
      targetId: eventId,
      result: 'SUCCESS',
      correlationId,
      metadata: { query: 'getEventNeighborhood' },
    });

    if (!graphData) {
      return {
        nodes: [
          {
            id: event.id,
            type: 'SecurityEvent',
            label: event.eventType,
            properties: redactSensitive({
              id: event.id,
              userId: event.userId,
              eventType: event.eventType,
              provider: event.provider,
              severity: event.severity,
              occurredAt: event.occurredAt,
            }),
          },
        ],
        edges: [],
      };
    }

    return this._sanitizeGraphData(graphData);
  }

  /**
   * Retrieves the comprehensive overview graph for the authenticated user.
   *
   * @param {string} userId - Authenticated user ID
   * @returns {Promise<{ nodes: object[], edges: object[] }>}
   */
  async getOverviewGraph(userId) {
    const correlationId = randomUUID();

    const graphData = await graphRepository.getUserOverviewGraph(userId);

    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'GRAPH_QUERY_EXECUTED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      correlationId,
      metadata: { query: 'getUserOverviewGraph' },
    });

    return this._sanitizeGraphData(graphData || { nodes: [], edges: [] });
  }

  /**
   * Scrubs all node and edge properties to prevent leaking sensitive credentials.
   *
   * @param {{ nodes: object[], edges: object[] }} graphData
   * @returns {{ nodes: object[], edges: object[] }}
   * @private
   */
  _sanitizeGraphData(graphData) {
    const nodes = (graphData.nodes || []).map((node) => ({
      id: String(node.id),
      type: node.type || 'Node',
      label: String(node.label || node.id),
      properties: redactSensitive(node.properties || {}),
    }));

    const edges = (graphData.edges || []).map((edge) => ({
      id: String(edge.id),
      source: String(edge.source),
      target: String(edge.target),
      type: edge.type || 'RELATED',
      properties: redactSensitive(edge.properties || {}),
    }));

    return { nodes, edges };
  }
}

const graphService = new GraphService();

module.exports = {
  GraphService,
  graphService,
};

