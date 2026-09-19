'use strict';

const { blastRadiusRepository } = require('../repositories/blastRadius.repository');
const { graphSyncService } = require('./graphSync.service');
const incidentRepository = require('../repositories/incident.repository');
const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const securityEventRepository = require('../repositories/securityEvent.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { redactSensitive } = require('../utils/redaction');

/**
 * Base resource weights for deterministic blast radius scoring.
 * Reflects potential impact scope across identity boundaries and credentials.
 */
const RESOURCE_WEIGHTS = Object.freeze({
  Account: 20,
  OAuthApp: 15,
  SSHKey: 15,
  Session: 10,
  Device: 5,
  Incident: 15,
  SecurityEvent: 5,
  Evidence: 2,
  User: 10,
  Provider: 5,
});

class BlastRadiusService {
  /**
   * Calculates the deterministic blast radius for an authenticated user's entity.
   *
   * @param {object} params
   * @param {string} params.userId - Authenticated user ID
   * @param {'INCIDENT'|'ACCOUNT'|'SECURITY_EVENT'} params.sourceType
   * @param {string} params.sourceId
   * @param {object} [params.options]
   * @returns {Promise<object>} Structured blast radius analysis
   */
  async calculateBlastRadius({ userId, sourceType, sourceId, options = {} }) {
    const startTime = Date.now();
    const normalizedType = String(sourceType || '').toUpperCase();

    // 1. Audit start of calculation
    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'BLAST_RADIUS_STARTED',
      targetType: normalizedType,
      targetId: sourceId,
      result: 'SUCCESS',
      metadata: { options: redactSensitive(options) },
    });

    try {
      // 2. Validate authoritative PostgreSQL ownership
      const sourceEntity = await this._verifyPostgresOwnership(userId, normalizedType, sourceId);

      // 3. Execute graph traversal via BlastRadiusRepository
      let traversal = await blastRadiusRepository.traverseBlastRadius({
        userId,
        sourceType: normalizedType,
        sourceId,
        options,
      });

      // 4. Graph consistency & auto-sync reconciliation if missing in projection
      let consistencyStatus = 'CONSISTENT';
      let consistencyReason = null;
      const warnings = [];

      if (!traversal) {
        // Attempt on-demand sync from PostgreSQL projection
        try {
          await graphSyncService.syncUserGraph(userId);
          traversal = await blastRadiusRepository.traverseBlastRadius({
            userId,
            sourceType: normalizedType,
            sourceId,
            options,
          });
        } catch {
          // Sync attempt failed or offline
        }

        if (!traversal) {
          consistencyStatus = 'PARTIAL';
          consistencyReason = 'GRAPH_PROJECTION_INCOMPLETE';
          warnings.push('Graph projection for source entity is incomplete or pending synchronization');

          // Fallback minimal source-only representation
          traversal = {
            sourceNode: {
              id: sourceId,
              type: normalizedType === 'SECURITY_EVENT' ? 'SecurityEvent' : normalizedType === 'INCIDENT' ? 'Incident' : 'Account',
              label: sourceEntity.title || sourceEntity.providerDisplayName || sourceEntity.eventType || sourceId,
              properties: redactSensitive(sourceEntity),
            },
            nodes: [
              {
                id: sourceId,
                type: normalizedType === 'SECURITY_EVENT' ? 'SecurityEvent' : normalizedType === 'INCIDENT' ? 'Incident' : 'Account',
                label: sourceEntity.title || sourceEntity.providerDisplayName || sourceEntity.eventType || sourceId,
                distance: 0,
                impactType: 'SOURCE',
                properties: redactSensitive(sourceEntity),
              },
            ],
            relationships: [],
            paths: [],
            maxDepthReached: 0,
            truncated: false,
            truncationReason: null,
            pathsTruncated: false,
          };
        }
      }

      // 5. Categorize affected nodes (excluding source node)
      const directNodes = traversal.nodes.filter((n) => n.impactType === 'DIRECT');
      const indirectNodes = traversal.nodes.filter((n) => n.impactType === 'INDIRECT');
      const sourceNodes = traversal.nodes.filter((n) => n.impactType === 'SOURCE');

      const affectedResources = {
        accounts: [],
        sessions: [],
        oauthApps: [],
        sshKeys: [],
        devices: [],
        events: [],
        incidents: [],
        evidence: [],
      };

      for (const node of traversal.nodes) {
        if (node.impactType === 'SOURCE') continue;

        const nodeType = (node.type || '').toUpperCase();
        if (nodeType === 'ACCOUNT') affectedResources.accounts.push(node);
        else if (nodeType === 'SESSION') affectedResources.sessions.push(node);
        else if (nodeType === 'OAUTHAPP') affectedResources.oauthApps.push(node);
        else if (nodeType === 'SSHKEY') affectedResources.sshKeys.push(node);
        else if (nodeType === 'DEVICE') affectedResources.devices.push(node);
        else if (nodeType === 'SECURITYEVENT') affectedResources.events.push(node);
        else if (nodeType === 'INCIDENT') affectedResources.incidents.push(node);
        else if (nodeType === 'EVIDENCE') affectedResources.evidence.push(node);
      }

      // 6. Calculate deterministic blast radius score (DETERMINISTIC_GRAPH_METRICS_V1)
      const metrics = this._calculateDeterministicScore(traversal.nodes, affectedResources);

      const summary = {
        totalNodes: traversal.nodes.length,
        directNodes: directNodes.length,
        indirectNodes: indirectNodes.length,
        sourceNodes: sourceNodes.length,
        maxDepthReached: traversal.maxDepthReached,
        truncated: traversal.truncated,
        truncationReason: traversal.truncationReason,
        pathsTruncated: traversal.pathsTruncated,
      };

      // 7. Audit completion and truncation
      const durationMs = Date.now() - startTime;

      if (summary.truncated) {
        await auditLogRepository.create({
          userId,
          actorType: 'USER',
          actorId: userId,
          actionType: 'BLAST_RADIUS_TRUNCATED',
          targetType: normalizedType,
          targetId: sourceId,
          result: 'PARTIAL',
          metadata: {
            truncationReason: summary.truncationReason,
            totalNodes: summary.totalNodes,
            maxDepthReached: summary.maxDepthReached,
          },
        });
      }

      await auditLogRepository.create({
        userId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'BLAST_RADIUS_COMPLETED',
        targetType: normalizedType,
        targetId: sourceId,
        result: 'SUCCESS',
        metadata: {
          totalNodes: summary.totalNodes,
          directNodes: summary.directNodes,
          indirectNodes: summary.indirectNodes,
          blastRadiusScore: metrics.blastRadiusScore,
          truncated: summary.truncated,
          durationMs,
        },
      });

      return {
        source: {
          type: normalizedType,
          id: sourceId,
          label: traversal.sourceNode.type,
          name: traversal.sourceNode.label,
        },
        graphConsistency: {
          status: consistencyStatus,
          ...(consistencyReason ? { reason: consistencyReason } : {}),
        },
        summary,
        metrics,
        affectedResources,
        nodes: traversal.nodes,
        relationships: traversal.relationships,
        paths: traversal.paths,
        warnings,
      };
    } catch (err) {
      await auditLogRepository.create({
        userId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'BLAST_RADIUS_FAILED',
        targetType: normalizedType,
        targetId: sourceId,
        result: 'FAILURE',
        metadata: {
          error: err.message,
          code: err.code || 'BLAST_RADIUS_ERROR',
        },
      });
      throw err;
    }
  }

  /**
   * Validates ownership of the source entity against authoritative PostgreSQL.
   * Throws 404 for cross-tenant access or nonexistent entities.
   *
   * @private
   */
  async _verifyPostgresOwnership(userId, sourceType, sourceId) {
    if (sourceType === 'INCIDENT') {
      const incident = await incidentRepository.findById(sourceId);
      if (!incident || incident.userId !== userId) {
        const err = new Error('Incident not found');
        err.statusCode = 404;
        throw err;
      }
      return incident;
    }

    if (sourceType === 'ACCOUNT') {
      const account = await connectedAccountRepository.findById(sourceId);
      if (!account || account.userId !== userId) {
        const err = new Error('Connected account not found');
        err.statusCode = 404;
        throw err;
      }
      return account;
    }

    if (sourceType === 'SECURITY_EVENT') {
      const event = await securityEventRepository.findById(sourceId);
      if (!event || event.userId !== userId) {
        const err = new Error('Security event not found');
        err.statusCode = 404;
        throw err;
      }
      return event;
    }

    const invalidErr = new Error(`Unsupported source type: '${sourceType}'`);
    invalidErr.statusCode = 400;
    throw invalidErr;
  }

  /**
   * Deterministically calculates the blast radius score from graph metrics.
   * Formula:
   *   rawScore = sum(baseWeight * attenuation)
   *   where attenuation = 1.0 for direct nodes (distance 1), 1 / distance for indirect nodes (distance >= 2).
   * Result is bounded in [0, 100].
   *
   * @private
   */
  _calculateDeterministicScore(nodes, affectedResources) {
    let directPoints = 0;
    let indirectPoints = 0;

    for (const node of nodes) {
      if (node.impactType === 'SOURCE') continue;

      const baseWeight = RESOURCE_WEIGHTS[node.type] || 5;
      const distance = node.distance || 1;

      if (distance === 1) {
        directPoints += baseWeight;
      } else {
        indirectPoints += Math.round((baseWeight / distance) * 10) / 10;
      }
    }

    const rawTotal = directPoints + indirectPoints;
    const blastRadiusScore = Math.min(100, Math.round(rawTotal));

    return {
      blastRadiusScore,
      methodology: 'DETERMINISTIC_GRAPH_METRICS_V1',
      scoreBreakdown: {
        directPoints: Math.round(directPoints),
        indirectPoints: Math.round(indirectPoints),
        resourceCounts: {
          accounts: affectedResources.accounts.length,
          sessions: affectedResources.sessions.length,
          oauthApps: affectedResources.oauthApps.length,
          sshKeys: affectedResources.sshKeys.length,
          devices: affectedResources.devices.length,
          events: affectedResources.events.length,
          incidents: affectedResources.incidents.length,
          evidence: affectedResources.evidence.length,
        },
      },
    };
  }
}

const blastRadiusService = new BlastRadiusService();

module.exports = {
  BlastRadiusService,
  blastRadiusService,
  RESOURCE_WEIGHTS,
};

