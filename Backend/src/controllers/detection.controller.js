'use strict';

const { z } = require('zod');
const { detectionService } = require('../detection/detection.service');
const incidentService = require('../services/incident.service');
const eventIngestionService = require('../services/eventIngestion.service');
const findingRepository = require('../repositories/finding.repository');

// Validators
const listIncidentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  status: z
    .enum([
      'OPEN',
      'INVESTIGATING',
      'CONTAINMENT_REQUIRED',
      'RECOVERY_REQUIRED',
      'VERIFYING',
      'RESOLVED',
      'CLOSED',
    ])
    .optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
});

/**
 * POST /api/events/:id/analyze
 *
 * Runs the detection pipeline on a normalized SecurityEvent.
 * Event must belong to the authenticated user.
 */
async function analyze(req, res, next) {
  try {
    const userId = req.user.id;
    const eventId = req.params.id;

    const result = await detectionService.detect(userId, eventId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/events/:id/findings
 *
 * Returns Evidence (finding) records for a specific SecurityEvent.
 * Event must belong to the authenticated user.
 */
async function getFindings(req, res, next) {
  try {
    const userId = req.user.id;
    const eventId = req.params.id;

    // Verify event ownership
    const event = await eventIngestionService.getEventById(userId, eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: { message: 'Security event not found' },
      });
    }

    const findings = await findingRepository.listByEventId(eventId);

    return res.status(200).json({
      success: true,
      data: {
        eventId,
        findings,
        total: findings.length,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/incidents
 *
 * Lists incidents for the authenticated user with bounded pagination.
 * Supports: limit (max 100), page, status, severity filters.
 */
async function listIncidents(req, res, next) {
  try {
    const userId = req.user.id;
    const validated = listIncidentsQuerySchema.parse(req.query);
    const { incidents, pagination } = await incidentService.listIncidents(userId, validated);

    return res.status(200).json({
      success: true,
      data: { incidents, pagination },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/incidents/:id
 *
 * Returns a single incident with evidence (findings) and linked event summaries.
 * Incident must belong to the authenticated user.
 */
async function getIncidentById(req, res, next) {
  try {
    const userId = req.user.id;
    const incidentId = req.params.id;

    const incident = await incidentService.getIncidentById(userId, incidentId);

    return res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  analyze,
  getFindings,
  listIncidents,
  getIncidentById,
};
