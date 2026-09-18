'use strict';

const eventIngestionService = require('../services/eventIngestion.service');
const {
  ingestEventSchema,
  simulateAwsSchema,
  listEventsQuerySchema,
} = require('../validators/event.validator');

/**
 * Controller handling security event ingestion, simulation, and queries.
 */

/**
 * POST /api/events/ingest
 * Ingests and normalizes a raw security event from a provider.
 */
async function ingest(req, res, next) {
  try {
    const validated = ingestEventSchema.parse(req.body);

    const result = await eventIngestionService.ingestEvent({
      userId: req.user.id,
      provider: validated.provider,
      connectedAccountId: validated.connectedAccountId,
      rawEvent: validated.rawEvent,
    });

    const statusCode = result.status === 'DUPLICATE' ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/events/simulate-aws
 * Convenience endpoint for Hackathon demonstration that generates and ingests
 * a simulated AWS CloudTrail event.
 */
async function simulateAws(req, res, next) {
  try {
    const validated = simulateAwsSchema.parse(req.body);

    const result = await eventIngestionService.simulateAwsEvent({
      userId: req.user.id,
      connectedAccountId: validated.connectedAccountId,
      scenario: validated.scenario,
      options: validated.options,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events
 * Lists security events belonging to the authenticated user with filtering and bounded pagination.
 */
async function list(req, res, next) {
  try {
    const validated = listEventsQuerySchema.parse(req.query);

    const result = await eventIngestionService.listEvents(req.user.id, validated);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events/:id
 * Retrieves a single security event ensuring tenant isolation.
 */
async function getById(req, res, next) {
  try {
    const { id } = req.params;
    const event = await eventIngestionService.getEventById(req.user.id, id);

    res.json({
      success: true,
      data: { event },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ingest,
  simulateAws,
  list,
  getById,
};

