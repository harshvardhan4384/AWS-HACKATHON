'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const { getDb } = require('../../../lib/db');

/**
 * Tool: get_security_settings
 * Inspects security configuration change history (e.g. 2FA disabled, password changes).
 */
class GetSecuritySettingsTool extends BaseTool {
  constructor() {
    super({
      name: 'get_security_settings',
      description: 'Retrieves security configuration alteration events (SECURITY_SETTING_CHANGED, ACCOUNT_SETTING_CHANGED).',
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

    const settingEvents = events.filter(
      (e) => e.eventType === 'SECURITY_SETTING_CHANGED' || e.eventType === 'ACCOUNT_SETTING_CHANGED'
    );

    return {
      connectedAccountId,
      settingChangeCount: settingEvents.length,
      changes: settingEvents.map((c) => ({
        id: c.id,
        eventType: c.eventType,
        severity: c.severity,
        occurredAt: c.occurredAt,
        sourceIp: c.sourceIp,
        details: c.eventData?.details || null,
      })),
    };
  }
}

module.exports = GetSecuritySettingsTool;

