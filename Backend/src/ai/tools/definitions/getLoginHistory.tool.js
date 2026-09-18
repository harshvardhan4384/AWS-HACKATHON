'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_login_history
 * Retrieves login history for a connected account to analyze IP familiarity and anomalies.
 */
class GetLoginHistoryTool extends BaseTool {
  constructor() {
    super({
      name: 'get_login_history',
      description: 'Retrieves login history (timestamps, source IPs, location metadata) for a connected account.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
        limit: z.coerce.number().int().min(1).max(50).default(20).describe('Maximum logins to retrieve (max 50)'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId, params = {} }) {
    const db = getDb();
    const limit = params.limit || 20;

    const logins = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
      eventType: 'LOGIN',
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    const distinctIps = new Set();
    const formattedLogins = logins.map((l) => {
      if (l.sourceIp) distinctIps.add(l.sourceIp);
      return {
        id: l.id,
        occurredAt: l.occurredAt,
        createdAt: l.createdAt,
        sourceIp: l.sourceIp,
        device: l.deviceMetadata,
        location: l.locationMetadata,
      };
    });

    return {
      connectedAccountId,
      totalLogins: logins.length,
      distinctIpCount: distinctIps.size,
      knownIps: Array.from(distinctIps),
      logins: formattedLogins,
    };
  }
}

module.exports = GetLoginHistoryTool;

