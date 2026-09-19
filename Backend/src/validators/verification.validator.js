'use strict';

const { z } = require('zod');

/**
 * UUID parameter schema.
 */
const uuidParamSchema = z.string().uuid({ message: 'Must be a valid UUID' });

/**
 * Schema for POST /api/recovery-actions/:id/verify
 * Note: client CANNOT override expected state.
 */
const verifyActionSchema = z.object({
  correlationId: z.string().uuid().optional(),
});

/**
 * Schema for POST /api/incidents/:id/verify
 */
const verifyIncidentSchema = z.object({
  correlationId: z.string().uuid().optional(),
});

/**
 * Helper to validate a payload against a Zod schema.
 *
 * @param {z.ZodSchema} schema
 * @param {object} body
 * @returns {{ data?: object, error?: string }}
 */
function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const messages = issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { error: messages };
  }
  return { data: result.data };
}

module.exports = {
  uuidParamSchema,
  verifyActionSchema,
  verifyIncidentSchema,
  validate,
};

