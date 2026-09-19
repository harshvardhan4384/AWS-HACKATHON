'use strict';

const { z } = require('zod');

/**
 * Schema for POST /api/approvals/:id/reject
 */
const rejectApprovalSchema = z.object({
  reason: z.string().max(500, 'Reason must not exceed 500 characters').optional(),
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
  rejectApprovalSchema,
  validate,
};

