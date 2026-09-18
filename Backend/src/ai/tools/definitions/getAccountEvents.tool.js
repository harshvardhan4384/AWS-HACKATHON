'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_account_events
 * Retrieves recent security events for a specific connected account.
 */
class GetAccountEventsTool extends BaseTool {
  constructor() {
    super({
      name: 'get_account_events',
      description: 'Retrieves recent security and activity events for a connected provider account, with optional eventType filtering.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
        eventType: z.string().optional().describe('Filter by canonical event type (e.g. LOGIN, TOKEN_CREATED)'),
        limit: z.coerce.number().int().min(1).max(50).default(20).describe('Maximum events to return (max 50)'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId, params = {} }) {
    const db = getDb();
    const limit = params.limit || 20;

    const whereClause = { connectedAccountId };
    if (params.eventType) {
      whereClause.eventType = params.eventType;
    }

    const events = await db.orm.public.SecurityEvent.where(whereClause)
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    return {
      connectedAccountId,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        provider: e.provider,
        severity: e.severity,
        status: e.status,
        sourceIp: e.sourceIp,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
        details: e.eventData?.details || null,
      })),
    };
  }
}

module.exports = GetAccountEventsTool;

