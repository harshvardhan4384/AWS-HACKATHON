'use strict';

const { z } = require('zod');

/**
 * Schema for POST /api/incidents/:id/recovery-plan
 * Optional planning constraints.
 */
const createRecoveryPlanSchema = z.object({
  options: z
    .object({
      maxActions: z.number().int().min(1).max(20).optional(),
      maxDepth: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
});

/**
 * Schema for POST /api/recovery-actions/:id/execute
 *
 * Requires an explicit authorization context containing all fields needed
 * for the 6-step validation pipeline in ActionExecutorService.
 */
const executeActionSchema = z.object({
  authorization: z.object({
    authorizationId: z.string().min(1, 'authorizationId is required'),
    authorizedBy: z.string().min(1).optional(),
    authorizationType: z.string().optional(),
    authorizedAt: z.string().optional(),
    expiresAt: z.string().min(1, 'expiresAt is required'),
    incidentId: z.string().min(1, 'incidentId is required'),
    recoveryActionId: z.string().min(1, 'recoveryActionId is required'),
    actionHash: z.string().min(1, 'actionHash is required'),
    policyVersion: z.string().optional(),
  }),
});

/**
 * Validates a request body against a Zod schema.
 * Returns { data } on success or { error } on failure.
 *
 * @param {z.ZodSchema} schema
 * @param {object} body
 * @returns {{ data: object } | { error: string }}
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
  createRecoveryPlanSchema,
  executeActionSchema,
  validate,
};

