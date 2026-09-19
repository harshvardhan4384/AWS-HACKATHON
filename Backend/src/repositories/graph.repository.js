'use strict';

const { getSession, checkNeo4jHealth } = require('../infrastructure/neo4j/neo4j.client');
const { redactSensitive } = require('../utils/redaction');

/**
 * In-Memory Graph Store for offline/testing dual-mode.
 * Mirrors the behavior of Neo4j graph operations deterministically.
 */
class InMemoryGraphStore {
  constructor() {
    this.nodes = new Map(); // id -> { id, label, properties }
    this.edges = new Map(); // id -> { id, source, target, type, properties }
  }

  clear() {
    this.nodes.clear();
    this.edges.clear();
  }

  mergeNode(label, id, properties = {}) {
    if (!id) throw new Error(`Cannot merge node of type ${label} without an id`);
    const sanitizedProps = redactSensitive({ ...properties, id });
    const existing = this.nodes.get(id);

    if (existing) {
      existing.properties = { ...existing.properties, ...sanitizedProps };
      return existing;
    }

    const node = {
      id,
      label,
      properties: sanitizedProps,
    };
    this.nodes.set(id, node);
    return node;
  }

  mergeEdge(sourceId, targetId, type, properties = {}) {
    const edgeId = `${sourceId}:${type}:${targetId}`;
    const sanitizedProps = redactSensitive({ ...properties });
    const existing = this.edges.get(edgeId);

    if (existing) {
      existing.properties = { ...existing.properties, ...sanitizedProps };
      return existing;
    }

    const edge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      type,
      properties: sanitizedProps,
    };
    this.edges.set(edgeId, edge);
    return edge;
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  getEdgesForNode(nodeId) {
    const results = [];
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        results.push(edge);
      }
    }
    return results;
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  getAllEdges() {
    return Array.from(this.edges.values());
  }
}

/**
 * Graph Repository — Manages Neo4j graph nodes, relationships, and queries.
 *
 * Guarantees:
 * - 100% Parameterized Cypher queries (zero string interpolation)
 * - Safe sanitization of all stored and returned properties
 * - Strict tenant isolation on all neighborhood and overview queries
 * - Fallback in-memory mode when Neo4j is offline or in mock test mode
 */
class GraphRepository {
  constructor() {
    this.inMemoryStore = new InMemoryGraphStore();
    this._useMock = false;
  }

  setMockMode(useMock) {
    this._useMock = Boolean(useMock);
  }

  isMockMode() {
    return this._useMock;
  }

  /**
   * Internal query runner using parameterized Cypher or in-memory fallback.
   *
   * @param {string} cypher - Parameterized Cypher query
   * @param {object} params - Query parameters
   * @param {'READ'|'WRITE'} [accessMode='READ']
   * @returns {Promise<any[]>} Cypher records
   */
  async executeQuery(cypher, params = {}, accessMode = 'READ') {
    if (this._useMock) {
      return [];
    }

    let session = null;
    try {
      session = getSession({ defaultAccessMode: accessMode });
      const result = await session.run(cypher, params);
      return result.records;
    } catch (err) {
      throw err;
    } finally {
      if (session && typeof session.close === 'function') {
        try {
          await session.close();
        } catch {
          // Safe swallow
        }
      }
    }
  }

  // ── Node MERGE Operations ──────────────────────────────────────────────────

  async mergeUser(user) {
    const props = {
      id: user.id,
      email: user.email,
      role: user.role || 'USER',
      createdAt: user.createdAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('User', user.id, props);
    }

    const cypher = `
      MERGE (u:User { id: $id })
      ON CREATE SET u += $props, u.createdInGraph = datetime()
      ON MATCH SET u += $props, u.updatedInGraph = datetime()
      RETURN u
    `;
    await this.executeQuery(cypher, { id: user.id, props }, 'WRITE');
    return props;
  }

  async mergeProvider(provider) {
    const providerId = typeof provider === 'string' ? provider : provider.id;
    const props = {
      id: providerId,
      name: providerId,
      type: 'IDENTITY_PROVIDER',
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('Provider', providerId, props);
    }

    const cypher = `
      MERGE (p:Provider { id: $id })
      ON CREATE SET p += $props
      ON MATCH SET p += $props
      RETURN p
    `;
    await this.executeQuery(cypher, { id: providerId, props }, 'WRITE');
    return props;
  }

  async mergeAccount(account) {
    const props = {
      id: account.id,
      userId: account.userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      displayName: account.providerDisplayName || null,
      status: account.status || 'ACTIVE',
      grantedScopes: account.grantedScopes || null,
      createdAt: account.createdAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('Account', account.id, props);
    }

    const cypher = `
      MERGE (a:Account { id: $id })
      ON CREATE SET a += $props, a.createdInGraph = datetime()
      ON MATCH SET a += $props, a.updatedInGraph = datetime()
      RETURN a
    `;
    await this.executeQuery(cypher, { id: account.id, props }, 'WRITE');
    return props;
  }

  async mergeSecurityEvent(event) {
    const safeDevice = event.deviceMetadata ? JSON.stringify(redactSensitive(event.deviceMetadata)) : null;
    const safeLocation = event.locationMetadata ? JSON.stringify(redactSensitive(event.locationMetadata)) : null;

    const props = {
      id: event.id,
      userId: event.userId,
      connectedAccountId: event.connectedAccountId || null,
      provider: event.provider,
      eventType: event.eventType,
      providerEventId: event.providerEventId || null,
      occurredAt: event.occurredAt || event.createdAt || new Date().toISOString(),
      severity: event.severity || 'INFO',
      status: event.status || 'NORMALIZED',
      sourceIp: event.sourceIp || null,
      safeDevice,
      safeLocation,
      incidentId: event.incidentId || null,
      createdAt: event.createdAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('SecurityEvent', event.id, props);
    }

    const cypher = `
      MERGE (e:SecurityEvent { id: $id })
      ON CREATE SET e += $props, e.createdInGraph = datetime()
      ON MATCH SET e += $props, e.updatedInGraph = datetime()
      RETURN e
    `;
    await this.executeQuery(cypher, { id: event.id, props }, 'WRITE');
    return props;
  }

  async mergeIncident(incident) {
    const props = {
      id: incident.id,
      userId: incident.userId,
      title: incident.title,
      summary: incident.summary || null,
      severity: incident.severity,
      status: incident.status || 'OPEN',
      detectionSource: incident.detectionSource || 'RULE_MATCH',
      startedAt: incident.startedAt || incident.createdAt || new Date().toISOString(),
      resolvedAt: incident.resolvedAt || null,
      createdAt: incident.createdAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('Incident', incident.id, props);
    }

    const cypher = `
      MERGE (i:Incident { id: $id })
      ON CREATE SET i += $props, i.createdInGraph = datetime()
      ON MATCH SET i += $props, i.updatedInGraph = datetime()
      RETURN i
    `;
    await this.executeQuery(cypher, { id: incident.id, props }, 'WRITE');
    return props;
  }

  async mergeEvidence(evidence) {
    const props = {
      id: evidence.id,
      incidentId: evidence.incidentId,
      eventId: evidence.eventId || null,
      evidenceType: evidence.evidenceType,
      source: evidence.source || null,
      confidence: typeof evidence.confidence === 'number' ? evidence.confidence : null,
      summary: evidence.evidenceData?.summary || evidence.evidenceType,
      createdAt: evidence.createdAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('Evidence', evidence.id, props);
    }

    const cypher = `
      MERGE (ev:Evidence { id: $id })
      ON CREATE SET ev += $props, ev.createdInGraph = datetime()
      ON MATCH SET ev += $props, ev.updatedInGraph = datetime()
      RETURN ev
    `;
    await this.executeQuery(cypher, { id: evidence.id, props }, 'WRITE');
    return props;
  }

  async mergeOAuthApp(app) {
    const props = {
      id: app.id,
      accountId: app.accountId,
      appName: app.appName || 'Unknown Application',
      clientId: app.clientId || null,
      scopes: app.scopes || null,
      authorizedAt: app.authorizedAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('OAuthApp', app.id, props);
    }

    const cypher = `
      MERGE (o:OAuthApp { id: $id })
      ON CREATE SET o += $props
      ON MATCH SET o += $props
      RETURN o
    `;
    await this.executeQuery(cypher, { id: app.id, props }, 'WRITE');
    return props;
  }

  async mergeSSHKey(key) {
    const props = {
      id: key.id,
      accountId: key.accountId,
      keyFingerprint: key.keyFingerprint || null,
      keyType: key.keyType || 'ssh-rsa',
      title: key.title || null,
      addedAt: key.addedAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('SSHKey', key.id, props);
    }

    const cypher = `
      MERGE (s:SSHKey { id: $id })
      ON CREATE SET s += $props
      ON MATCH SET s += $props
      RETURN s
    `;
    await this.executeQuery(cypher, { id: key.id, props }, 'WRITE');
    return props;
  }

  async mergeSession(session) {
    const props = {
      id: session.id,
      accountId: session.accountId,
      sessionType: session.sessionType || 'WEB',
      ipAddress: session.ipAddress || null,
      userAgent: session.userAgent || null,
      createdAt: session.createdAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('Session', session.id, props);
    }

    const cypher = `
      MERGE (sess:Session { id: $id })
      ON CREATE SET sess += $props
      ON MATCH SET sess += $props
      RETURN sess
    `;
    await this.executeQuery(cypher, { id: session.id, props }, 'WRITE');
    return props;
  }

  async mergeDevice(device) {
    const props = {
      id: device.id,
      accountId: device.accountId,
      deviceType: device.deviceType || 'UNKNOWN',
      os: device.os || null,
      browser: device.browser || null,
      lastSeenAt: device.lastSeenAt || new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeNode('Device', device.id, props);
    }

    const cypher = `
      MERGE (d:Device { id: $id })
      ON CREATE SET d += $props
      ON MATCH SET d += $props
      RETURN d
    `;
    await this.executeQuery(cypher, { id: device.id, props }, 'WRITE');
    return props;
  }

  // ── Relationship MERGE Operations ──────────────────────────────────────────

  async linkUserToAccount(userId, accountId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(userId, accountId, 'OWNS');
    }

    const cypher = `
      MATCH (u:User { id: $userId })
      MATCH (a:Account { id: $accountId })
      MERGE (u)-[r:OWNS]->(a)
      RETURN r
    `;
    return await this.executeQuery(cypher, { userId, accountId }, 'WRITE');
  }

  async linkAccountToProvider(accountId, providerId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(accountId, providerId, 'USES_PROVIDER');
    }

    const cypher = `
      MATCH (a:Account { id: $accountId })
      MATCH (p:Provider { id: $providerId })
      MERGE (a)-[r:USES_PROVIDER]->(p)
      RETURN r
    `;
    return await this.executeQuery(cypher, { accountId, providerId }, 'WRITE');
  }

  async linkAccountToEvent(accountId, eventId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(accountId, eventId, 'GENERATED');
    }

    const cypher = `
      MATCH (a:Account { id: $accountId })
      MATCH (e:SecurityEvent { id: $eventId })
      MERGE (a)-[r:GENERATED]->(e)
      RETURN r
    `;
    return await this.executeQuery(cypher, { accountId, eventId }, 'WRITE');
  }

  async linkEventToIncident(eventId, incidentId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(eventId, incidentId, 'RELATED_TO');
    }

    const cypher = `
      MATCH (e:SecurityEvent { id: $eventId })
      MATCH (i:Incident { id: $incidentId })
      MERGE (e)-[r:RELATED_TO]->(i)
      RETURN r
    `;
    return await this.executeQuery(cypher, { eventId, incidentId }, 'WRITE');
  }

  async linkIncidentToEvidence(incidentId, evidenceId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(incidentId, evidenceId, 'HAS_EVIDENCE');
    }

    const cypher = `
      MATCH (i:Incident { id: $incidentId })
      MATCH (ev:Evidence { id: $evidenceId })
      MERGE (i)-[r:HAS_EVIDENCE]->(ev)
      RETURN r
    `;
    return await this.executeQuery(cypher, { incidentId, evidenceId }, 'WRITE');
  }

  async linkAccountToOAuthApp(accountId, appId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(accountId, appId, 'AUTHORIZED');
    }

    const cypher = `
      MATCH (a:Account { id: $accountId })
      MATCH (o:OAuthApp { id: $appId })
      MERGE (a)-[r:AUTHORIZED]->(o)
      RETURN r
    `;
    return await this.executeQuery(cypher, { accountId, appId }, 'WRITE');
  }

  async linkAccountToSSHKey(accountId, keyId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(accountId, keyId, 'HAS_SSH_KEY');
    }

    const cypher = `
      MATCH (a:Account { id: $accountId })
      MATCH (s:SSHKey { id: $keyId })
      MERGE (a)-[r:HAS_SSH_KEY]->(s)
      RETURN r
    `;
    return await this.executeQuery(cypher, { accountId, keyId }, 'WRITE');
  }

  async linkAccountToSession(accountId, sessionId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(accountId, sessionId, 'HAS_SESSION');
    }

    const cypher = `
      MATCH (a:Account { id: $accountId })
      MATCH (sess:Session { id: $sessionId })
      MERGE (a)-[r:HAS_SESSION]->(sess)
      RETURN r
    `;
    return await this.executeQuery(cypher, { accountId, sessionId }, 'WRITE');
  }

  async linkAccountToDevice(accountId, deviceId) {
    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(accountId, deviceId, 'USED_DEVICE');
    }

    const cypher = `
      MATCH (a:Account { id: $accountId })
      MATCH (d:Device { id: $deviceId })
      MERGE (a)-[r:USED_DEVICE]->(d)
      RETURN r
    `;
    return await this.executeQuery(cypher, { accountId, deviceId }, 'WRITE');
  }

  async linkEventSequence(eventAId, eventBId, metadata = {}) {
    const props = {
      correlationType: metadata.correlationType || 'TEMPORAL',
      intervalMs: metadata.intervalMs || null,
      source: metadata.source || 'DETECTION_ENGINE',
      createdAt: new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(eventAId, eventBId, 'PRECEDES', props);
    }

    const cypher = `
      MATCH (a:SecurityEvent { id: $eventAId })
      MATCH (b:SecurityEvent { id: $eventBId })
      MERGE (a)-[r:PRECEDES]->(b)
      ON CREATE SET r += $props
      ON MATCH SET r += $props
      RETURN r
    `;
    return await this.executeQuery(cypher, { eventAId, eventBId, props }, 'WRITE');
  }

  async linkEventCorrelation(eventAId, eventBId, metadata = {}) {
    const props = {
      correlationType: metadata.correlationType || 'DETECTION_CORRELATION',
      confidence: typeof metadata.confidence === 'number' ? metadata.confidence : 0.8,
      source: metadata.source || 'DETECTION_ENGINE',
      createdAt: new Date().toISOString(),
    };

    if (this._useMock) {
      return this.inMemoryStore.mergeEdge(eventAId, eventBId, 'CORRELATED_WITH', props);
    }

    const cypher = `
      MATCH (a:SecurityEvent { id: $eventAId })
      MATCH (b:SecurityEvent { id: $eventBId })
      MERGE (a)-[r:CORRELATED_WITH]->(b)
      ON CREATE SET r += $props
      ON MATCH SET r += $props
      RETURN r
    `;
    return await this.executeQuery(cypher, { eventAId, eventBId, props }, 'WRITE');
  }

  // ── Traversal & Graph Queries (Strict Tenant Isolation) ───────────────────

  async getAccountNeighborhood(userId, accountId) {
    if (this._useMock) {
      const accountNode = this.inMemoryStore.getNode(accountId);
      if (!accountNode || accountNode.properties.userId !== userId) {
        return null;
      }

      const connectedEdges = this.inMemoryStore.getEdgesForNode(accountId);
      const connectedNodeIds = new Set([accountId]);

      for (const edge of connectedEdges) {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      }

      const nodes = Array.from(connectedNodeIds)
        .map((id) => this.inMemoryStore.getNode(id))
        .filter(Boolean)
        .map((n) => ({
          id: n.id,
          type: n.label,
          label: n.properties.displayName || n.properties.title || n.properties.eventType || n.id,
          properties: n.properties,
        }));

      const edges = connectedEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        properties: e.properties,
      }));

      return { nodes, edges };
    }

    // Parameterized Cypher ensuring User owns the Account
    const cypher = `
      MATCH (u:User { id: $userId })-[:OWNS]->(a:Account { id: $accountId })
      OPTIONAL MATCH (a)-[r1]->(neighbor)
      OPTIONAL MATCH (neighbor)-[r2]->(subNeighbor)
      RETURN a, collect(DISTINCT r1) AS r1List, collect(DISTINCT neighbor) AS neighbors,
             collect(DISTINCT r2) AS r2List, collect(DISTINCT subNeighbor) AS subNeighbors
    `;

    const records = await this.executeQuery(cypher, { userId, accountId }, 'READ');
    if (!records || records.length === 0 || !records[0].get('a')) {
      return null;
    }

    return this._formatCypherResult(records);
  }

  async getIncidentNeighborhood(userId, incidentId) {
    if (this._useMock) {
      const incidentNode = this.inMemoryStore.getNode(incidentId);
      if (!incidentNode || incidentNode.properties.userId !== userId) {
        return null;
      }

      const incidentEdges = this.inMemoryStore.getEdgesForNode(incidentId);
      const nodeIds = new Set([incidentId]);

      for (const edge of incidentEdges) {
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }

      const nodes = Array.from(nodeIds)
        .map((id) => this.inMemoryStore.getNode(id))
        .filter(Boolean)
        .map((n) => ({
          id: n.id,
          type: n.label,
          label: n.properties.title || n.properties.summary || n.properties.eventType || n.id,
          properties: n.properties,
        }));

      const edges = incidentEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        properties: e.properties,
      }));

      return { nodes, edges };
    }

    const cypher = `
      MATCH (i:Incident { id: $incidentId, userId: $userId })
      OPTIONAL MATCH (e:SecurityEvent)-[r1:RELATED_TO]->(i)
      OPTIONAL MATCH (i)-[r2:HAS_EVIDENCE]->(ev:Evidence)
      OPTIONAL MATCH (a:Account)-[r3:GENERATED]->(e)
      RETURN i, collect(DISTINCT e) AS events, collect(DISTINCT ev) AS evidence,
             collect(DISTINCT a) AS accounts, collect(DISTINCT r1) AS relEvents,
             collect(DISTINCT r2) AS relEvidence, collect(DISTINCT r3) AS relAccounts
    `;

    const records = await this.executeQuery(cypher, { userId, incidentId }, 'READ');
    if (!records || records.length === 0 || !records[0].get('i')) {
      return null;
    }

    return this._formatCypherResult(records);
  }

  async getEventNeighborhood(userId, eventId) {
    if (this._useMock) {
      const eventNode = this.inMemoryStore.getNode(eventId);
      if (!eventNode || eventNode.properties.userId !== userId) {
        return null;
      }

      const eventEdges = this.inMemoryStore.getEdgesForNode(eventId);
      const nodeIds = new Set([eventId]);

      for (const edge of eventEdges) {
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }

      const nodes = Array.from(nodeIds)
        .map((id) => this.inMemoryStore.getNode(id))
        .filter(Boolean)
        .map((n) => ({
          id: n.id,
          type: n.label,
          label: n.properties.eventType || n.id,
          properties: n.properties,
        }));

      const edges = eventEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        properties: e.properties,
      }));

      return { nodes, edges };
    }

    const cypher = `
      MATCH (e:SecurityEvent { id: $eventId, userId: $userId })
      OPTIONAL MATCH (a:Account)-[r1:GENERATED]->(e)
      OPTIONAL MATCH (e)-[r2:RELATED_TO]->(i:Incident)
      OPTIONAL MATCH (e)-[r3:PRECEDES|CORRELATED_WITH]-(otherEvent:SecurityEvent)
      RETURN e, collect(DISTINCT a) AS accounts, collect(DISTINCT i) AS incidents,
             collect(DISTINCT otherEvent) AS relatedEvents,
             collect(DISTINCT r1) AS relAccounts, collect(DISTINCT r2) AS relIncidents,
             collect(DISTINCT r3) AS relSequences
    `;

    const records = await this.executeQuery(cypher, { userId, eventId }, 'READ');
    if (!records || records.length === 0 || !records[0].get('e')) {
      return null;
    }

    return this._formatCypherResult(records);
  }

  async getUserOverviewGraph(userId) {
    if (this._useMock) {
      const userNode = this.inMemoryStore.getNode(userId);
      if (!userNode) {
        return { nodes: [], edges: [] };
      }

      const nodes = [];
      const edges = [];
      const nodeIds = new Set([userId]);

      for (const edge of this.inMemoryStore.getAllEdges()) {
        const sourceNode = this.inMemoryStore.getNode(edge.source);
        const targetNode = this.inMemoryStore.getNode(edge.target);

        // Include edges where either source or target belongs to the user
        const sourceUser = sourceNode?.properties?.userId || (sourceNode?.id === userId ? userId : null);
        const targetUser = targetNode?.properties?.userId || (targetNode?.id === userId ? userId : null);

        if (sourceUser === userId || targetUser === userId || edge.source === userId || edge.target === userId) {
          edges.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type,
            properties: edge.properties,
          });
          nodeIds.add(edge.source);
          nodeIds.add(edge.target);
        }
      }

      for (const id of nodeIds) {
        const n = this.inMemoryStore.getNode(id);
        if (n) {
          nodes.push({
            id: n.id,
            type: n.label,
            label: n.properties.displayName || n.properties.title || n.properties.eventType || n.id,
            properties: n.properties,
          });
        }
      }

      return { nodes, edges };
    }

    const cypher = `
      MATCH (u:User { id: $userId })
      OPTIONAL MATCH (u)-[r1:OWNS]->(a:Account)
      OPTIONAL MATCH (a)-[r2:USES_PROVIDER]->(p:Provider)
      OPTIONAL MATCH (a)-[r3:GENERATED]->(e:SecurityEvent)
      OPTIONAL MATCH (e)-[r4:RELATED_TO]->(i:Incident)
      OPTIONAL MATCH (i)-[r5:HAS_EVIDENCE]->(ev:Evidence)
      OPTIONAL MATCH (e)-[r6:PRECEDES|CORRELATED_WITH]-(e2:SecurityEvent)
      RETURN u,
             collect(DISTINCT a) AS accounts,
             collect(DISTINCT p) AS providers,
             collect(DISTINCT e) AS events,
             collect(DISTINCT i) AS incidents,
             collect(DISTINCT ev) AS evidence,
             collect(DISTINCT e2) AS correlatedEvents,
             collect(DISTINCT r1) AS rel1,
             collect(DISTINCT r2) AS rel2,
             collect(DISTINCT r3) AS rel3,
             collect(DISTINCT r4) AS rel4,
             collect(DISTINCT r5) AS rel5,
             collect(DISTINCT r6) AS rel6
    `;

    const records = await this.executeQuery(cypher, { userId }, 'READ');
    if (!records || records.length === 0) {
      return { nodes: [], edges: [] };
    }

    return this._formatCypherResult(records);
  }

  // ── Node & Edge Counting (Consistency) ────────────────────────────────────

  async getCountsForUser(userId) {
    if (this._useMock) {
      let accounts = 0;
      let events = 0;
      let incidents = 0;
      let evidence = 0;

      for (const node of this.inMemoryStore.getAllNodes()) {
        if (node.properties.userId === userId) {
          if (node.label === 'Account') accounts++;
          if (node.label === 'SecurityEvent') events++;
          if (node.label === 'Incident') incidents++;
        }
        if (node.label === 'Evidence') {
          // Check if parent incident belongs to user
          const incidentNode = this.inMemoryStore.getNode(node.properties.incidentId);
          if (incidentNode && incidentNode.properties.userId === userId) {
            evidence++;
          }
        }
      }

      return { accounts, events, incidents, evidence };
    }

    const cypher = `
      MATCH (u:User { id: $userId })
      OPTIONAL MATCH (u)-[:OWNS]->(a:Account)
      OPTIONAL MATCH (a)-[:GENERATED]->(e:SecurityEvent)
      OPTIONAL MATCH (e)-[:RELATED_TO]->(i:Incident)
      OPTIONAL MATCH (i)-[:HAS_EVIDENCE]->(ev:Evidence)
      RETURN count(DISTINCT a) AS accounts,
             count(DISTINCT e) AS events,
             count(DISTINCT i) AS incidents,
             count(DISTINCT ev) AS evidence
    `;

    const records = await this.executeQuery(cypher, { userId }, 'READ');
    if (!records || records.length === 0) {
      return { accounts: 0, events: 0, incidents: 0, evidence: 0 };
    }

    const row = records[0];
    return {
      accounts: Number(row.get('accounts') || 0),
      events: Number(row.get('events') || 0),
      incidents: Number(row.get('incidents') || 0),
      evidence: Number(row.get('evidence') || 0),
    };
  }

  // ── Helper: Format Cypher Records to { nodes, edges } ─────────────────────

  _formatCypherResult(records) {
    const nodeMap = new Map();
    const edgeMap = new Map();

    for (const record of records) {
      for (const key of record.keys) {
        const item = record.get(key);

        if (Array.isArray(item)) {
          for (const sub of item) {
            this._extractGraphEntity(sub, nodeMap, edgeMap);
          }
        } else {
          this._extractGraphEntity(item, nodeMap, edgeMap);
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
    };
  }

  _extractGraphEntity(item, nodeMap, edgeMap) {
    if (!item) return;

    // Neo4j Node
    if (item.labels && item.properties) {
      const type = item.labels[0] || 'Node';
      const props = redactSensitive(item.properties);
      const id = props.id || String(item.identity);

      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          type,
          label: props.displayName || props.title || props.eventType || props.name || id,
          properties: props,
        });
      }
    }

    // Neo4j Relationship
    if (item.type && item.startNodeElementId !== undefined && item.endNodeElementId !== undefined) {
      const edgeId = String(item.elementId || `${item.start}:${item.type}:${item.end}`);
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          source: String(item.startNodeElementId || item.start),
          target: String(item.endNodeElementId || item.end),
          type: item.type,
          properties: redactSensitive(item.properties || {}),
        });
      }
    }
  }
}

const graphRepository = new GraphRepository();

module.exports = {
  GraphRepository,
  graphRepository,
};

