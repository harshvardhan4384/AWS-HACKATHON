'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_access_tokens
 * Inspects API token and personal access token creation/revocation events.
 *
 * CRITICAL SECURITY INVARIANT:
 * Never returns plaintext tokens, secrets, or ciphertexts. Returns metadata only.
 */
class GetAccessTokensTool extends BaseTool {
  constructor() {
    super({
      name: 'get_access_tokens',
      description: 'Retrieves API token and personal access token creation (TOKEN_CREATED) and revocation (TOKEN_REVOKED) metadata. No secrets are ever exposed.',
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

    const tokenEvents = events.filter(
      (e) => e.eventType === 'TOKEN_CREATED' || e.eventType === 'TOKEN_REVOKED'
    );

    return {
      connectedAccountId,
      tokenEventCount: tokenEvents.length,
      tokens: tokenEvents.map((t) => ({
        id: t.id,
        eventType: t.eventType,
        occurredAt: t.occurredAt,
        sourceIp: t.sourceIp,
        metadata: t.eventData?.details || null,
      })),
    };
  }
}

module.exports = GetAccessTokensTool;

