'use strict';

const { graphRepository } = require('./graph.repository');
const { checkNeo4jHealth } = require('../infrastructure/neo4j/neo4j.client');
const { redactSensitive } = require('../utils/redaction');
const config = require('../config/env');

/**
 * Approved relationship types for Blast Radius traversal.
 * Graph exploration strictly follows ONLY these relationship types.
 */
const APPROVED_RELATIONSHIPS = Object.freeze([
  'OWNS',
  'USES_PROVIDER',
  'GENERATED',
  'RELATED_TO',
  'HAS_EVIDENCE',
  'PRECEDES',
  'CORRELATED_WITH',
  'AUTHORIZED',
  'HAS_SSH_KEY',
  'HAS_SESSION',
  'USED_DEVICE',
]);

class BlastRadiusRepository {
  constructor() {
    this.approvedRelationships = new Set(APPROVED_RELATIONSHIPS);
  }

  /**
   * Traverses the graph from an identified source node to calculate blast radius.
   *
   * @param {object} params
   * @param {string} params.userId - Authenticated user ID (tenant boundary)
   * @param {'INCIDENT'|'ACCOUNT'|'SECURITY_EVENT'} params.sourceType
   * @param {string} params.sourceId
   * @param {object} [params.options]
   * @param {number} [params.options.maxDepth]
   * @param {number} [params.options.maxNodes]
   * @param {number} [params.options.maxPaths]
   * @param {number} [params.options.timeoutMs]
   * @returns {Promise<object>}
   */
  async traverseBlastRadius({ userId, sourceType, sourceId, options = {} }) {
    const maxDepth = Math.max(1, Math.min(10, parseInt(options.maxDepth, 10) || config.blastRadiusMaxDepth || 5));
    const maxNodes = Math.max(1, Math.min(1000, parseInt(options.maxNodes, 10) || config.blastRadiusMaxNodes || 500));
    const maxPaths = Math.max(1, Math.min(500, parseInt(options.maxPaths, 10) || config.blastRadiusMaxPaths || 100));
    const timeoutMs = Math.max(500, Math.min(60000, parseInt(options.timeoutMs, 10) || config.blastRadiusTimeoutMs || 10000));

    // Determine whether to use In-Memory store (mock/offline mode) or live Neo4j
    const isMock = graphRepository.isMockMode();
    let isConnected = false;
    if (!isMock) {
      try {
        const health = await checkNeo4jHealth();
        isConnected = Boolean(health.healthy);
      } catch {
        isConnected = false;
      }
    }

    if (isMock || !isConnected) {
      return this._traverseInMemory({
        userId,
        sourceType,
        sourceId,
        maxDepth,
        maxNodes,
        maxPaths,
        timeoutMs,
      });
    }

    try {
      return await this._traverseCypher({
        userId,
        sourceType,
        sourceId,
        maxDepth,
        maxNodes,
        maxPaths,
        timeoutMs,
      });
    } catch (err) {
      // Safe fallback to in-memory store if Neo4j query fails
      return this._traverseInMemory({
        userId,
        sourceType,
        sourceId,
        maxDepth,
        maxNodes,
        maxPaths,
        timeoutMs,
      });
    }
  }

  /**
   * Deterministic Breadth-First-Search (BFS) traversal over the in-memory graph store.
   *
   * @private
   */
  _traverseInMemory({ userId, sourceType, sourceId, maxDepth, maxNodes, maxPaths, timeoutMs }) {
    const startTime = Date.now();
    const store = graphRepository.inMemoryStore;

    // 1. Locate source node in graph store
    const sourceNode = store.getNode(sourceId);
    if (!sourceNode) {
      return null;
    }

    // 2. Validate tenant ownership of source node
    if (!this._nodeBelongsToTenant(sourceNode, userId, store)) {
      return null;
    }

    // Node distance tracking & deduplication: nodeId -> minimum distance
    const nodeDistances = new Map();
    nodeDistances.set(sourceId, 0);

    const collectedNodes = new Map(); // nodeId -> node object
    collectedNodes.set(sourceId, sourceNode);

    const collectedEdges = new Map(); // edgeId -> edge object
    const collectedPaths = [];        // array of path objects

    let truncated = false;
    let truncationReason = null;
    let pathsTruncated = false;
    let maxDepthReached = 0;

    // Queue for BFS traversal: { nodeId, distance, pathNodes, pathEdges }
    const queue = [
      {
        nodeId: sourceId,
        distance: 0,
        pathNodes: [sourceId],
        pathEdges: [],
      },
    ];

    while (queue.length > 0) {
      // Timeout check
      if (Date.now() - startTime > timeoutMs) {
        const timeoutError = new Error(`Blast radius traversal exceeded timeout limit of ${timeoutMs}ms`);
        timeoutError.statusCode = 504;
        timeoutError.code = 'BLAST_RADIUS_TIMEOUT';
        throw timeoutError;
      }

      const current = queue.shift();
      const currentDistance = current.distance;

      if (currentDistance > maxDepthReached) {
        maxDepthReached = currentDistance;
      }

      if (currentDistance >= maxDepth) {
        continue;
      }

      const edges = store.getEdgesForNode(current.nodeId);
      for (const edge of edges) {
        // Enforce approved relationship types
        if (!this.approvedRelationships.has(edge.type)) {
          continue;
        }

        const neighborId = edge.source === current.nodeId ? edge.target : edge.source;

        // Prevent cycles in the current path
        if (current.pathNodes.includes(neighborId)) {
          continue;
        }

        const neighborNode = store.getNode(neighborId);
        if (!neighborNode) {
          continue;
        }

        // Strict tenant isolation boundary check
        if (!this._nodeBelongsToTenant(neighborNode, userId, store)) {
          continue;
        }

        const nextDistance = currentDistance + 1;

        // Record or update minimum distance
        if (!nodeDistances.has(neighborId) || nextDistance < nodeDistances.get(neighborId)) {
          nodeDistances.set(neighborId, nextDistance);
        }

        // Collect node respecting maxNodes boundary
        if (!collectedNodes.has(neighborId)) {
          if (collectedNodes.size >= maxNodes) {
            truncated = true;
            truncationReason = 'MAX_NODES_REACHED';
            continue;
          }
          collectedNodes.set(neighborId, neighborNode);
        }

        // Collect edge
        collectedEdges.set(edge.id, edge);

        // Record path respecting maxPaths boundary
        const newPathNodes = [...current.pathNodes, neighborId];
        const newPathEdges = [...current.pathEdges, edge.type];

        if (collectedPaths.length < maxPaths) {
          collectedPaths.push({
            pathId: newPathNodes.join('->'),
            source: sourceId,
            target: neighborId,
            length: nextDistance,
            nodes: newPathNodes,
            relationships: newPathEdges,
          });
        } else {
          pathsTruncated = true;
        }

        // Enqueue next hop if depth allows and not truncated
        if (nextDistance < maxDepth && !truncated) {
          queue.push({
            nodeId: neighborId,
            distance: nextDistance,
            pathNodes: newPathNodes,
            pathEdges: newPathEdges,
          });
        }
      }
    }

    // Format final response nodes
    const formattedNodes = Array.from(collectedNodes.values()).map((n) => {
      const distance = nodeDistances.get(n.id) ?? 0;
      let impactType = 'INDIRECT';
      if (distance === 0) {
        impactType = 'SOURCE';
      } else if (distance === 1) {
        impactType = 'DIRECT';
      }

      return {
        id: n.id,
        type: n.label,
        label: n.properties?.displayName || n.properties?.title || n.properties?.eventType || n.properties?.name || n.id,
        distance,
        impactType,
        properties: redactSensitive(n.properties || {}),
      };
    });

    // Format final response edges
    const formattedEdges = Array.from(collectedEdges.values()).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      properties: redactSensitive(e.properties || {}),
    }));

    return {
      sourceNode: {
        id: sourceNode.id,
        type: sourceNode.label,
        label: sourceNode.properties?.displayName || sourceNode.properties?.title || sourceNode.id,
        properties: redactSensitive(sourceNode.properties || {}),
      },
      nodes: formattedNodes,
      relationships: formattedEdges,
      paths: collectedPaths,
      maxDepthReached,
      truncated,
      truncationReason,
      pathsTruncated,
    };
  }

  /**
   * Traversal using 100% parameterized Cypher for live Neo4j.
   *
   * @private
   */
  async _traverseCypher({ userId, sourceType, sourceId, maxDepth, maxNodes, maxPaths, timeoutMs }) {
    const startTime = Date.now();

    // 1. Parameterized lookup of source node
    const sourceCypher = `
      MATCH (source { id: $sourceId })
      WHERE ($sourceType = 'INCIDENT' AND source:Incident AND source.userId = $userId)
         OR ($sourceType = 'ACCOUNT' AND source:Account AND source.userId = $userId)
         OR ($sourceType = 'SECURITY_EVENT' AND source:SecurityEvent AND source.userId = $userId)
      RETURN source, labels(source) AS labels
    `;

    const sourceRecords = await graphRepository.executeQuery(
      sourceCypher,
      { sourceId, sourceType, userId },
      'READ'
    );

    if (!sourceRecords || sourceRecords.length === 0) {
      return null;
    }

    const sourceRecord = sourceRecords[0];
    const rawSource = sourceRecord.get('source');
    const sourceLabels = sourceRecord.get('labels') || [];
    const sourceLabel = sourceLabels[0] || sourceType;
    const sourceProps = redactSensitive(rawSource.properties || {});

    // 2. Parameterized path traversal query with clamped depth
    const clampedDepth = Math.max(1, Math.min(10, maxDepth));
    const traversalCypher = `
      MATCH (source { id: $sourceId })
      WHERE ($sourceType = 'INCIDENT' AND source:Incident AND source.userId = $userId)
         OR ($sourceType = 'ACCOUNT' AND source:Account AND source.userId = $userId)
         OR ($sourceType = 'SECURITY_EVENT' AND source:SecurityEvent AND source.userId = $userId)
      MATCH p = (source)-[r:OWNS|USES_PROVIDER|GENERATED|RELATED_TO|HAS_EVIDENCE|PRECEDES|CORRELATED_WITH|AUTHORIZED|HAS_SSH_KEY|HAS_SESSION|USED_DEVICE*1..${clampedDepth}]-(target)
      WHERE (target.userId IS NULL OR target.userId = $userId)
      RETURN p, length(p) AS depth
      ORDER BY depth ASC
      LIMIT $queryLimit
    `;

    const queryLimit = Math.max(maxPaths * 2, 200);
    const pathRecords = await graphRepository.executeQuery(
      traversalCypher,
      { sourceId, sourceType, userId, queryLimit },
      'READ'
    );

    if (Date.now() - startTime > timeoutMs) {
      const timeoutError = new Error(`Blast radius traversal exceeded timeout limit of ${timeoutMs}ms`);
      timeoutError.statusCode = 504;
      timeoutError.code = 'BLAST_RADIUS_TIMEOUT';
      throw timeoutError;
    }

    // Process records into structured result
    const nodeDistances = new Map();
    nodeDistances.set(sourceId, 0);

    const collectedNodes = new Map();
    collectedNodes.set(sourceId, {
      id: sourceId,
      type: sourceLabel,
      label: sourceProps.displayName || sourceProps.title || sourceProps.eventType || sourceId,
      distance: 0,
      impactType: 'SOURCE',
      properties: sourceProps,
    });

    const collectedEdges = new Map();
    const collectedPaths = [];

    let truncated = false;
    let truncationReason = null;
    let pathsTruncated = false;
    let maxDepthReached = 0;

    for (const record of pathRecords) {
      const path = record.get('p');
      const depth = typeof record.get('depth')?.toNumber === 'function'
        ? record.get('depth').toNumber()
        : Number(record.get('depth') || 0);

      if (depth > maxDepthReached) {
        maxDepthReached = depth;
      }

      if (!path) continue;

      const segments = path.segments || [];
      const pathNodeIds = [sourceId];
      const pathRelTypes = [];

      for (const segment of segments) {
        const start = segment.start;
        const end = segment.end;
        const relationship = segment.relationship;

        const startId = start.properties.id || String(start.identity);
        const endId = end.properties.id || String(end.identity);

        const edgeId = `${startId}:${relationship.type}:${endId}`;
        if (!collectedEdges.has(edgeId)) {
          collectedEdges.set(edgeId, {
            id: edgeId,
            source: startId,
            target: endId,
            type: relationship.type,
            properties: redactSensitive(relationship.properties || {}),
          });
        }

        // Add node
        const targetNode = endId === sourceId ? start : end;
        const targetId = targetNode.properties.id || String(targetNode.identity);
        const targetLabel = (targetNode.labels && targetNode.labels[0]) || 'Unknown';
        const targetProps = redactSensitive(targetNode.properties || {});

        if (!nodeDistances.has(targetId) || depth < nodeDistances.get(targetId)) {
          nodeDistances.set(targetId, depth);
        }

        if (!collectedNodes.has(targetId)) {
          if (collectedNodes.size >= maxNodes) {
            truncated = true;
            truncationReason = 'MAX_NODES_REACHED';
          } else {
            let impactType = 'INDIRECT';
            if (depth === 1) {
              impactType = 'DIRECT';
            }

            collectedNodes.set(targetId, {
              id: targetId,
              type: targetLabel,
              label: targetProps.displayName || targetProps.title || targetProps.eventType || targetProps.name || targetId,
              distance: depth,
              impactType,
              properties: targetProps,
            });
          }
        }

        pathNodeIds.push(targetId);
        pathRelTypes.push(relationship.type);
      }

      if (collectedPaths.length < maxPaths) {
        collectedPaths.push({
          pathId: pathNodeIds.join('->'),
          source: sourceId,
          target: pathNodeIds[pathNodeIds.length - 1],
          length: depth,
          nodes: pathNodeIds,
          relationships: pathRelTypes,
        });
      } else {
        pathsTruncated = true;
      }
    }

    return {
      sourceNode: {
        id: sourceId,
        type: sourceLabel,
        label: sourceProps.displayName || sourceProps.title || sourceId,
        properties: sourceProps,
      },
      nodes: Array.from(collectedNodes.values()),
      relationships: Array.from(collectedEdges.values()),
      paths: collectedPaths,
      maxDepthReached,
      truncated,
      truncationReason,
      pathsTruncated,
    };
  }

  /**
   * Evaluates if a node belongs strictly to the authenticated tenant.
   *
   * @private
   */
  _nodeBelongsToTenant(node, userId, store) {
    if (!node) return false;

    // Direct user ID match
    if (node.properties?.userId === userId) {
      return true;
    }

    // User node itself
    if (node.label === 'User' && node.id === userId) {
      return true;
    }

    // Provider node is global, but only valid if connected to an Account owned by this user
    if (node.label === 'Provider') {
      const edges = store.getEdgesForNode(node.id);
      for (const edge of edges) {
        if (edge.type === 'USES_PROVIDER') {
          const accountNode = store.getNode(edge.source);
          if (accountNode && accountNode.properties?.userId === userId) {
            return true;
          }
        }
      }
      return false;
    }

    // Child entity of Account (OAuthApp, SSHKey, Session, Device)
    if (node.properties?.accountId) {
      const accountNode = store.getNode(node.properties.accountId);
      return Boolean(accountNode && accountNode.properties?.userId === userId);
    }

    // Evidence attached to Incident
    if (node.properties?.incidentId) {
      const incidentNode = store.getNode(node.properties.incidentId);
      return Boolean(incidentNode && incidentNode.properties?.userId === userId);
    }

    return false;
  }
}

const blastRadiusRepository = new BlastRadiusRepository();

module.exports = {
  BlastRadiusRepository,
  blastRadiusRepository,
  APPROVED_RELATIONSHIPS,
};

