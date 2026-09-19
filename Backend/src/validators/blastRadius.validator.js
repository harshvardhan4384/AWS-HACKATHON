'use strict';

const { z } = require('zod');

/**
 * Validation schema for general blast radius calculation request.
 */
const calculateBlastRadiusSchema = z.object({
  sourceType: z.enum(['INCIDENT', 'ACCOUNT', 'SECURITY_EVENT'], {
    errorMap: () => ({
      message: "sourceType must be one of: 'INCIDENT', 'ACCOUNT', 'SECURITY_EVENT'",
    }),
  }),
  sourceId: z
    .string({ required_error: 'sourceId is required' })
    .trim()
    .min(1, 'sourceId cannot be empty'),
  options: z
    .object({
      maxDepth: z
        .coerce
        .number()
        .int('maxDepth must be an integer')
        .min(1, 'maxDepth must be at least 1')
        .max(10, 'maxDepth cannot exceed 10')
        .optional(),
      maxNodes: z
        .coerce
        .number()
        .int('maxNodes must be an integer')
        .min(1, 'maxNodes must be at least 1')
        .max(1000, 'maxNodes cannot exceed 1000')
        .optional(),
      maxPaths: z
        .coerce
        .number()
        .int('maxPaths must be an integer')
        .min(1, 'maxPaths must be at least 1')
        .max(500, 'maxPaths cannot exceed 500')
        .optional(),
      timeoutMs: z
        .coerce
        .number()
        .int('timeoutMs must be an integer')
        .min(500, 'timeoutMs must be at least 500ms')
        .max(60000, 'timeoutMs cannot exceed 60000ms')
        .optional(),
    })
    .optional()
    .default({}),
});

/**
 * Validation schema for route-specific blast radius requests (where sourceId is in req.params).
 */
const blastRadiusOptionsSchema = z.object({
  options: z
    .object({
      maxDepth: z
        .coerce
        .number()
        .int('maxDepth must be an integer')
        .min(1, 'maxDepth must be at least 1')
        .max(10, 'maxDepth cannot exceed 10')
        .optional(),
      maxNodes: z
        .coerce
        .number()
        .int('maxNodes must be an integer')
        .min(1, 'maxNodes must be at least 1')
        .max(1000, 'maxNodes cannot exceed 1000')
        .optional(),
      maxPaths: z
        .coerce
        .number()
        .int('maxPaths must be an integer')
        .min(1, 'maxPaths must be at least 1')
        .max(500, 'maxPaths cannot exceed 500')
        .optional(),
      timeoutMs: z
        .coerce
        .number()
        .int('timeoutMs must be an integer')
        .min(500, 'timeoutMs must be at least 500ms')
        .max(60000, 'timeoutMs cannot exceed 60000ms')
        .optional(),
    })
    .optional()
    .default({}),
});

module.exports = {
  calculateBlastRadiusSchema,
  blastRadiusOptionsSchema,
};

