'use strict';

const { blastRadiusService } = require('../services/blastRadius.service');
const {
  calculateBlastRadiusSchema,
  blastRadiusOptionsSchema,
} = require('../validators/blastRadius.validator');

/**
 * Parses options from either req.body or req.query for maximum HTTP client flexibility.
 */
function parseOptions(req) {
  const raw = {
    options: {
      ...(req.query || {}),
      ...(req.body?.options || {}),
    },
  };
  const parsed = blastRadiusOptionsSchema.parse(raw);
  return parsed.options;
}

/**
 * POST /api/blast-radius/calculate
 * General endpoint to calculate blast radius for any supported source entity.
 */
async function calculate(req, res, next) {
  try {
    const validated = calculateBlastRadiusSchema.parse(req.body);

    const result = await blastRadiusService.calculateBlastRadius({
      userId: req.user.id,
      sourceType: validated.sourceType,
      sourceId: validated.sourceId,
      options: validated.options,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST or GET /api/incidents/:id/blast-radius
 * POST or GET /api/blast-radius/incident/:id
 */
async function getIncidentBlastRadius(req, res, next) {
  try {
    const options = parseOptions(req);

    const result = await blastRadiusService.calculateBlastRadius({
      userId: req.user.id,
      sourceType: 'INCIDENT',
      sourceId: req.params.id,
      options,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST or GET /api/accounts/:id/blast-radius
 * POST or GET /api/blast-radius/account/:id
 */
async function getAccountBlastRadius(req, res, next) {
  try {
    const options = parseOptions(req);

    const result = await blastRadiusService.calculateBlastRadius({
      userId: req.user.id,
      sourceType: 'ACCOUNT',
      sourceId: req.params.id,
      options,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST or GET /api/events/:id/blast-radius
 * POST or GET /api/blast-radius/event/:id
 */
async function getEventBlastRadius(req, res, next) {
  try {
    const options = parseOptions(req);

    const result = await blastRadiusService.calculateBlastRadius({
      userId: req.user.id,
      sourceType: 'SECURITY_EVENT',
      sourceId: req.params.id,
      options,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  calculate,
  getIncidentBlastRadius,
  getAccountBlastRadius,
  getEventBlastRadius,
};

