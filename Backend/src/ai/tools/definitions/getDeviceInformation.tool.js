'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_device_information
 * Retrieves observed device metadata, user-agents, and location data across recent events.
 */
class GetDeviceInformationTool extends BaseTool {
  constructor() {
    super({
      name: 'get_device_information',
      description: 'Retrieves device metadata, user agents, and location info observed in security events for a connected account.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
        limit: z.coerce.number().int().min(1).max(50).default(20).describe('Maximum event records to sample'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId, params = {} }) {
    const db = getDb();
    const limit = params.limit || 20;

    const events = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    const distinctDevices = [];
    const seenSignatures = new Set();

    for (const e of events) {
      if (e.deviceMetadata || e.sourceIp) {
        const sig = `${e.sourceIp || 'unknown'}-${JSON.stringify(e.deviceMetadata || {})}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          distinctDevices.push({
            eventId: e.id,
            eventType: e.eventType,
            sourceIp: e.sourceIp,
            device: e.deviceMetadata,
            location: e.locationMetadata,
            lastSeen: e.occurredAt || e.createdAt,
          });
        }
      }
    }

    return {
      connectedAccountId,
      distinctDeviceCount: distinctDevices.length,
      devices: distinctDevices,
    };
  }
}

module.exports = GetDeviceInformationTool;

