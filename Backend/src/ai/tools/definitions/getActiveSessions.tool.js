'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_active_sessions
 * Inspects session creation and termination events for a connected account.
 */
class GetActiveSessionsTool extends BaseTool {
  constructor() {
    super({
      name: 'get_active_sessions',
      description: 'Retrieves recent session events (SESSION_CREATED, SESSION_TERMINATED) and active session indicators.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
        limit: z.coerce.number().int().min(1).max(30).default(10).describe('Maximum session events to retrieve'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId, params = {} }) {
    const db = getDb();
    const limit = params.limit || 10;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(100)
      .all();

    const sessionEvents = events.filter(
      (e) => e.eventType === 'SESSION_CREATED' || e.eventType === 'SESSION_TERMINATED' || e.eventType === 'LOGIN'
    ).slice(0, limit);

    return {
      connectedAccountId,
      sessionEventCount: sessionEvents.length,
      sessions: sessionEvents.map((s) => ({
        id: s.id,
        eventType: s.eventType,
        sourceIp: s.sourceIp,
        occurredAt: s.occurredAt,
        device: s.deviceMetadata,
      })),
    };
  }
}

module.exports = GetActiveSessionsTool;

