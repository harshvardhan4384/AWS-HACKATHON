'use strict';

const { randomUUID } = require('crypto');
const incidentRepository = require('../repositories/incident.repository');
const agentRunRepository = require('../repositories/agentRun.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { investigationGraph } = require('../ai/graph/investigation.graph');
const BedrockModelProvider = require('../ai/providers/bedrock.provider');
const { initDefaultTools } = require('../ai/tools/initTools');
const config = require('../config/env');

// Ensure all 11 default tools are registered
initDefaultTools();

/**
 * InvestigationService — Coordinates AI investigations over security incidents.
 */
class InvestigationService {
  constructor(defaultProvider = null) {
    this._defaultProvider = defaultProvider;
  }

  setDefaultProvider(provider) {
    this._defaultProvider = provider;
  }

  /**
   * Returns the effective model provider (Bedrock or injected mock).
   *
   * @param {object} [customProvider]
   * @returns {BaseModelProvider}
   * @private
   */
  _getModelProvider(customProvider) {
    if (customProvider) return customProvider;
    if (this._defaultProvider) return this._defaultProvider;
    if (process.env.NODE_ENV === 'test' || process.env.AI_MOCK_BEDROCK === 'true') {
      const MockModelProvider = require('../ai/providers/mock.provider');
      return new MockModelProvider();
    }
    return new BedrockModelProvider();
  }

  /**
   * Starts an AI security investigation for a specific incident.
   *
   * @param {string} userId - Authenticated user ID
   * @param {string} incidentId - Target incident ID
   * @param {object} [options]
   * @param {BaseModelProvider} [options.modelProvider] - Optional override provider (e.g. for testing)
   * @param {string} [options.triggerSource='MANUAL']
   * @returns {Promise<object>} Completed AgentRun record with structured results
   */
  async investigateIncident(userId, incidentId, options = {}) {
    const correlationId = randomUUID();

    // 1. Verify Incident Ownership
    const incident = await incidentRepository.findByIdAndUserId(incidentId, userId);
    if (!incident) {
      const err = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    // 2. Concurrency Guard — Prevent duplicate concurrent investigations
    const activeRun = await agentRunRepository.findActiveByIncidentId(incidentId);
    if (activeRun) {
      const err = new Error(`An investigation is already in progress for incident '${incidentId}'`);
      err.statusCode = 409;
      err.activeAgentRunId = activeRun.id;
      throw err;
    }

    const modelProvider = this._getModelProvider(options.modelProvider);

    // 3. Create AgentRun Record (RUNNING)
    const agentRun = await agentRunRepository.create({
      userId,
      incidentId,
      agentType: 'INVESTIGATOR',
      status: 'RUNNING',
      triggerSource: options.triggerSource || 'MANUAL',
      modelId: modelProvider.modelId,
      modelProvider: modelProvider.providerName,
      correlationId,
      startedAt: new Date().toISOString(),
    });

    // 4. Audit: INVESTIGATION_STARTED
    await auditLogRepository.create({
      userId,
      actorType: 'AGENT',
      actorId: 'InvestigationService',
      actionType: 'INVESTIGATION_STARTED',
      targetType: 'Incident',
      targetId: incidentId,
      result: 'SUCCESS',
      correlationId,
      metadata: {
        agentRunId: agentRun.id,
        modelId: modelProvider.modelId,
      },
    });

    // 5. Execute LangGraph Investigation Workflow with Timeout
    let finalState;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const timeoutErr = new Error(`Investigation exceeded timeout of ${config.aiMaxInvestigationTimeMs}ms`);
          timeoutErr.code = 'INVESTIGATION_TIMEOUT';
          reject(timeoutErr);
        }, config.aiMaxInvestigationTimeMs);
      });

      const graphPromise = investigationGraph.invoke(
        {
          incidentId,
          userId,
          correlationId,
        },
        {
          configurable: {
            modelProvider,
          },
        }
      );

      finalState = await Promise.race([graphPromise, timeoutPromise]);
    } catch (execErr) {
      // 6. Handle Investigation Failure
      const isTimeout = execErr.code === 'INVESTIGATION_TIMEOUT';
      const failureStatus = 'FAILED';

      await agentRunRepository.updateStatus(agentRun.id, failureStatus, {
        completedAt: new Date().toISOString(),
        errorMessage: execErr.message,
      });

      await auditLogRepository.create({
        userId,
        actorType: 'AGENT',
        actorId: 'InvestigationService',
        actionType: isTimeout ? 'INVESTIGATION_TIMEOUT' : 'INVESTIGATION_FAILED',
        targetType: 'Incident',
        targetId: incidentId,
        result: 'FAILURE',
        correlationId,
        metadata: {
          agentRunId: agentRun.id,
          error: execErr.message,
        },
      });

      throw execErr;
    }

    // 7. Success: Update AgentRun Record
    const completedStatus = finalState.status === 'LIMIT_REACHED' ? 'COMPLETED' : 'COMPLETED';
    const updatedRun = await agentRunRepository.updateStatus(agentRun.id, completedStatus, {
      completedAt: new Date().toISOString(),
      resultSummary: finalState.resultSummary || {},
    });

    // 8. Audit: INVESTIGATION_COMPLETED
    await auditLogRepository.create({
      userId,
      actorType: 'AGENT',
      actorId: 'InvestigationService',
      actionType: 'INVESTIGATION_COMPLETED',
      targetType: 'Incident',
      targetId: incidentId,
      result: 'SUCCESS',
      correlationId,
      metadata: {
        agentRunId: agentRun.id,
        confidence: finalState.resultSummary?.confidence,
        factsCount: finalState.resultSummary?.observedFacts?.length || 0,
        recommendationsCount: finalState.resultSummary?.recommendations?.length || 0,
      },
    });

    return updatedRun;
  }

  /**
   * Retrieves the latest investigation for an incident.
   *
   * @param {string} userId
   * @param {string} incidentId
   * @returns {Promise<object>}
   */
  async getInvestigationByIncident(userId, incidentId) {
    const incident = await incidentRepository.findByIdAndUserId(incidentId, userId);
    if (!incident) {
      const err = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    const latestRun = await agentRunRepository.findLatestByIncidentId(incidentId, userId);
    if (!latestRun) {
      const err = new Error('No investigation has been conducted for this incident');
      err.statusCode = 404;
      throw err;
    }

    return latestRun;
  }

  /**
   * Retrieves an AgentRun by ID verifying ownership.
   *
   * @param {string} userId
   * @param {string} runId
   * @returns {Promise<object>}
   */
  async getAgentRunById(userId, runId) {
    const run = await agentRunRepository.findByIdAndUserId(runId, userId);
    if (!run) {
      const err = new Error('Agent run not found');
      err.statusCode = 404;
      throw err;
    }
    return run;
  }
}

const investigationService = new InvestigationService();

module.exports = { InvestigationService, investigationService };
