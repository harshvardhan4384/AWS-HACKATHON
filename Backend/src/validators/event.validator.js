'use strict';

const { z } = require('zod');
const { CANONICAL_PROVIDERS_LIST, CANONICAL_STATUSES_LIST, CANONICAL_SEVERITIES_LIST } = require('../utils/taxonomy');

/**
 * Validation schema for raw event ingestion.
 */
const ingestEventSchema = z.object({
  provider: z.enum(CANONICAL_PROVIDERS_LIST, {
    errorMap: () => ({ message: `Provider must be one of: ${CANONICAL_PROVIDERS_LIST.join(', ')}` }),
  }),
  connectedAccountId: z
    .string({ required_error: 'connectedAccountId is required' })
    .uuid('connectedAccountId must be a valid UUID'),
  rawEvent: z
    .record(z.any(), { required_error: 'rawEvent is required' })
    .refine((val) => val && typeof val === 'object' && Object.keys(val).length > 0, {
      message: 'rawEvent must be a non-empty object',
    }),
});

/**
 * Validation schema for AWS event simulation.
 */
const simulateAwsSchema = z.object({
  connectedAccountId: z
    .string({ required_error: 'connectedAccountId is required' })
    .uuid('connectedAccountId must be a valid UUID'),
  scenario: z
    .enum(
      ['CONSOLE_LOGIN', 'ACCESS_KEY_CREATED', 'ACCESS_KEY_REVOKED', 'SECURITY_SETTING_CHANGED', 'SESSION_CREATED'],
      {
        errorMap: () => ({
          message:
            'scenario must be one of: CONSOLE_LOGIN, ACCESS_KEY_CREATED, ACCESS_KEY_REVOKED, SECURITY_SETTING_CHANGED, SESSION_CREATED',
        }),
      }
    )
    .default('CONSOLE_LOGIN'),
  options: z.record(z.any()).optional().default({}),
});

/**
 * Validation schema for listing security events with filtering and bounded pagination.
 */
const listEventsQuerySchema = z.object({
  limit: z
    .coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  page: z
    .coerce
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  provider: z.enum(CANONICAL_PROVIDERS_LIST).optional(),
  eventType: z.string().trim().optional(),
  status: z.enum(CANONICAL_STATUSES_LIST).optional(),
  severity: z.enum(CANONICAL_SEVERITIES_LIST).optional(),
  connectedAccountId: z.string().uuid('connectedAccountId must be a valid UUID').optional(),
});

module.exports = {
  ingestEventSchema,
  simulateAwsSchema,
  listEventsQuerySchema,
};

