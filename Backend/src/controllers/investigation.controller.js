'use strict';

const { investigationService } = require('../services/investigation.service');

/**
 * Controller managing AI security investigations and AgentRuns.
 */

/**
 * POST /api/incidents/:id/investigate
 * Starts an AI investigation for a specific incident.
 */
async function investigate(req, res, next) {
  try {
    const userId = req.user.id;
    const incidentId = req.params.id;

    const agentRun = await investigationService.investigateIncident(userId, incidentId);

    return res.status(200).json({
      success: true,
      data: agentRun,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/incidents/:id/investigation
 * Retrieves the latest investigation and conclusions for an incident.
 */
async function getInvestigation(req, res, next) {
  try {
    const userId = req.user.id;
    const incidentId = req.params.id;

    const agentRun = await investigationService.getInvestigationByIncident(userId, incidentId);

    return res.status(200).json({
      success: true,
      data: agentRun,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/agent-runs/:id
 * Retrieves an AgentRun record by ID ensuring tenant isolation.
 */
async function getAgentRun(req, res, next) {
  try {
    const userId = req.user.id;
    const runId = req.params.id;

    const agentRun = await investigationService.getAgentRunById(userId, runId);

    return res.status(200).json({
      success: true,
      data: agentRun,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  investigate,
  getInvestigation,
  getAgentRun,
};

