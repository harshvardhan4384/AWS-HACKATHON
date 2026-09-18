'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');
const connectedAccountRepository = require('../../../repositories/connectedAccount.repository');

/**
 * Tool: get_oauth_apps
 * Inspects authorized OAuth applications and third-party grants for a connected account.
 */
class GetOauthAppsTool extends BaseTool {
  constructor() {
    super({
      name: 'get_oauth_apps',
      description: 'Retrieves OAuth application authorization events (OAUTH_GRANTED, OAUTH_REVOKED) and granted scopes.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId }) {
    const db = getDb();
    const account = await connectedAccountRepository.findById(connectedAccountId);

    const oauthEvents = await db.orm.public.SecurityEvent.where({
      connectedAccountId,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(50)
      .all();

    const grants = oauthEvents.filter(
      (e) => e.eventType === 'OAUTH_GRANTED' || e.eventType === 'OAUTH_REVOKED'
    );

    return {
      connectedAccountId,
      provider: account?.provider || 'UNKNOWN',
      grantedScopes: account?.grantedScopes || null,
      grantEventCount: grants.length,
      grants: grants.map((g) => ({
        id: g.id,
        eventType: g.eventType,
        occurredAt: g.occurredAt,
        details: g.eventData?.details || null,
      })),
    };
  }
}

module.exports = GetOauthAppsTool;

