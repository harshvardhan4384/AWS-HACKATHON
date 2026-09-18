'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_ssh_keys
 * Inspects SSH key creation and removal activity for persistent access detection.
 */
class GetSshKeysTool extends BaseTool {
  constructor() {
    super({
      name: 'get_ssh_keys',
      description: 'Retrieves SSH key creation (SSH_KEY_CREATED) and removal (SSH_KEY_REMOVED) events for a connected account.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId }) {
    const db = getDb();

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(50)
      .all();

    const sshEvents = events.filter(
      (e) => e.eventType === 'SSH_KEY_CREATED' || e.eventType === 'SSH_KEY_REMOVED'
    );

    return {
      connectedAccountId,
      sshEventCount: sshEvents.length,
      keys: sshEvents.map((k) => ({
        id: k.id,
        eventType: k.eventType,
        occurredAt: k.occurredAt,
        sourceIp: k.sourceIp,
        details: k.eventData?.details || null,
      })),
    };
  }
}

module.exports = GetSshKeysTool;

