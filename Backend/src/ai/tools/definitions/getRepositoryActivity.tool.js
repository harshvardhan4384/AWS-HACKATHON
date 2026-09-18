'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_repository_activity
 * Retrieves repository access, cloning, and interaction events for a connected account.
 */
class GetRepositoryActivityTool extends BaseTool {
  constructor() {
    super({
      name: 'get_repository_activity',
      description: 'Retrieves repository access and cloning activity (REPOSITORY_ACCESS) on a connected code hosting account.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
        limit: z.coerce.number().int().min(1).max(50).default(20).describe('Maximum activity records to retrieve'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId, params = {} }) {
    const db = getDb();
    const limit = params.limit || 20;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
      eventType: 'REPOSITORY_ACCESS',
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    return {
      connectedAccountId,
      repositoryEventCount: events.length,
      activity: events.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        sourceIp: e.sourceIp,
        details: e.eventData?.details || null,
      })),
    };
  }
}

module.exports = GetRepositoryActivityTool;

