'use strict';

const { z } = require('zod');
const { NOTIFICATION_TYPES, NOTIFICATION_SEVERITIES } = require('../notifications/notificationTypes');

/**
 * UUID parameter validation schema.
 */
const uuidParamSchema = z.string().uuid({ message: 'Must be a valid UUID' });

/**
 * Query schema for GET /api/notifications
 */
const listNotificationsSchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  unreadOnly: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((v) => v === 'true'),
  ]).optional(),
  severity: z.nativeEnum(NOTIFICATION_SEVERITIES).optional(),
  type: z.nativeEnum(NOTIFICATION_TYPES).optional(),
  incidentId: z.string().uuid().optional(),
});

/**
 * Helper to validate data against a Zod schema.
 *
 * @param {z.ZodSchema} schema
 * @param {object} data
 * @returns {{ data?: object, error?: string }}
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const messages = issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { error: messages };
  }
  return { data: result.data };
}

module.exports = {
  uuidParamSchema,
  listNotificationsSchema,
  validate,
};

