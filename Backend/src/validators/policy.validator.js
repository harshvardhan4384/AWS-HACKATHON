'use strict';

const { z } = require('zod');

/**
 * Schema for PUT /api/policy/preferences
 */
const updatePolicyPreferencesSchema = z.object({
  automaticRecovery: z.boolean().optional(),
  automaticMaliciousOAuthRevocation: z.boolean().optional(),
  allowedAutomationTypes: z.array(z.string()).optional(),
});

/**
 * Schema for POST /api/recovery-actions/:id/policy-evaluate
 */
const evaluatePolicySchema = z.object({
  clientActionHash: z.string().optional(),
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
  updatePolicyPreferencesSchema,
  evaluatePolicySchema,
  validate,
};

