'use strict';

const { graphService } = require('../services/graph.service');
const { graphSyncService } = require('../services/graphSync.service');

/**
 * Graph Controller — Exposes endpoints for Identity / Attack Graph visualization and sync.
 */

/**
 * GET /api/graph/overview
 * Returns the authenticated user's digital identity and security graph.
 */
async function getOverview(req, res, next) {
  try {
    const userId = req.user.id;
    const graph = await graphService.getOverviewGraph(userId);

    return res.status(200).json({
      success: true,
      data: graph,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/graph/account/:accountId
 * Returns the neighborhood graph for a connected account.
 */
async function getAccountNeighborhood(req, res, next) {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;

    const graph = await graphService.getAccountGraph(userId, accountId);

    return res.status(200).json({
      success: true,
      data: graph,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/graph/incident/:incidentId
 * Returns the incident graph including evidence and linked security events.
 */
async function getIncidentNeighborhood(req, res, next) {
  try {
    const userId = req.user.id;
    const { incidentId } = req.params;

    const graph = await graphService.getIncidentGraph(userId, incidentId);

    return res.status(200).json({
      success: true,
      data: graph,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/graph/event/:eventId
 * Returns the event graph with preceding/correlated attack sequence links.
 */
async function getEventNeighborhood(req, res, next) {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    const graph = await graphService.getEventGraph(userId, eventId);

    return res.status(200).json({
      success: true,
      data: graph,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/graph/sync
 * Triggers an explicit full synchronization of the user's graph projection.
 */
async function syncUserGraph(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await graphSyncService.syncFullUserGraph(userId);

    return res.status(200).json({
      success: result.success,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/graph/reconcile
 * Returns graph consistency status comparing PostgreSQL and Neo4j counts.
 */
async function reconcileGraph(req, res, next) {
  try {
    const userId = req.user.id;
    const report = await graphSyncService.reconcileUserGraph(userId);

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getOverview,
  getAccountNeighborhood,
  getIncidentNeighborhood,
  getEventNeighborhood,
  syncUserGraph,
  reconcileGraph,
};

