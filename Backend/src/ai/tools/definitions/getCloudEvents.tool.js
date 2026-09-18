'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_cloud_events
 * Retrieves cloud infrastructure activity (e.g. AWS CloudTrail console logins, IAM modifications).
 */
class GetCloudEventsTool extends BaseTool {
  constructor() {
    super({
      name: 'get_cloud_events',
      description: 'Retrieves cloud infrastructure activity events (AWS CloudTrail, IAM changes, console logins) for connected cloud accounts.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
        limit: z.coerce.number().int().min(1).max(50).default(20).describe('Maximum cloud events to retrieve'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId, params = {} }) {
    const db = getDb();
    const limit = params.limit || 20;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
      provider: 'AWS',
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    return {
      connectedAccountId,
      cloudEventCount: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        occurredAt: e.occurredAt,
        sourceIp: e.sourceIp,
        details: e.eventData?.details || null,
        isSimulated: Boolean(e.eventData?.isSimulated),
      })),
    };
  }
}

module.exports = GetCloudEventsTool;

