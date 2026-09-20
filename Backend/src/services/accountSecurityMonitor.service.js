'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const securityEventRepository = require('../repositories/securityEvent.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const tokenEncryptionService = require('./tokenEncryption.service');
const eventIngestionService = require('./eventIngestion.service');
const { detectionService } = require('../detection/detection.service');
const { notificationService } = require('./notification.service');
const { providerRegistry } = require('../providers/provider.registry');

/**
 * AccountSecurityMonitorService — Orchestrates real-time account security monitoring,
 * incremental synchronization, deduplication, detection, and continuous background polling.
 */
class AccountSecurityMonitorService {
  constructor() {
    // In-memory sync cursors: Map<connectedAccountId, { lastSyncedAt, lastEventTimestamp, providerCursor, inFlight: boolean }>
    this._syncState = new Map();
    // In-memory known SSH keys per account: Map<connectedAccountId, Set<string>>
    this._knownSshKeyIds = new Map();
    // Registered webhook channels: Map<channelId, { connectedAccountId, userId, channelToken, createdAt }>
    this._webhookChannels = new Map();
    // Background polling timer
    this._pollingTimer = null;
    this._pollingIntervalMs = 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Performs an incremental security synchronization for a single connected account.
   *
   * @param {string} userId - Authenticated user ID
   * @param {string} connectedAccountId - ConnectedAccount primary key ID
   * @param {object} [options={}]
   * @param {boolean} [options.initialSync=false] - If true, populates historical timeline without triggering alerts
   * @param {boolean} [options.forceFullSync=false] - If true, ignores cursors
   * @returns {Promise<object>}
   */
  async syncAccount(userId, connectedAccountId, options = {}) {
    const initialSync = Boolean(options.initialSync);

    // 1. Ownership & state verification
    const account = await connectedAccountRepository.findById(connectedAccountId);
    if (!account || account.userId !== userId) {
      const err = new Error('Connected account not found or access denied');
      err.statusCode = 404;
      throw err;
    }

    if (account.status !== 'ACTIVE') {
      return {
        status: 'SKIPPED',
        reason: `Account status is ${account.status}`,
        connectedAccountId,
        provider: account.provider,
      };
    }

    // 2. Concurrency lock per account
    const state = this._getOrCreateSyncState(connectedAccountId);
    if (state.inFlight) {
      return {
        status: 'IN_FLIGHT',
        message: 'A synchronization run is already active for this account',
        connectedAccountId,
      };
    }
    state.inFlight = true;

    const syncStartedAt = new Date().toISOString();
    let eventsIngested = 0;
    let duplicatesSkipped = 0;
    let incidentsTriggered = 0;

    try {
      // 3. Decrypt token in-memory only
      let accessToken = null;
      if (account.accessTokenCiphertext) {
        try {
          accessToken = tokenEncryptionService.decrypt(account.accessTokenCiphertext);
        } catch {
          // Token decrypt error handled gracefully
        }
      }

      const provider = providerRegistry.get(account.provider);
      if (!provider || !provider.isConfigured()) {
        state.inFlight = false;
        return {
          status: 'UNCONFIGURED',
          provider: account.provider,
          connectedAccountId,
        };
      }

      // 4. Collect provider-specific real security & activity events
      const collectedEvents = await this._collectProviderEvents({
        account,
        provider,
        accessToken,
        cursor: options.forceFullSync ? null : state.providerCursor,
        startTime: options.forceFullSync ? null : state.lastEventTimestamp,
      });

      // 5. Ingest & Deduplicate each event
      for (const rawEvt of collectedEvents) {
        try {
          const { status, event } = await eventIngestionService.ingestEvent({
            userId,
            provider: account.provider,
            connectedAccountId,
            rawEvent: rawEvt,
          });

          if (status === 'DUPLICATE') {
            duplicatesSkipped++;
            continue;
          }

          eventsIngested++;

          // 6. Detection Engine Integration
          // If initialSync is true: populate store without firing noisy alerts.
          // If initialSync is false: run full detection pipeline -> RiskEngine -> Incidents -> WebSockets.
          if (!initialSync && event && event.id) {
            try {
              const detectionResult = await detectionService.detect(userId, event.id);
              if (detectionResult.incidentCreated || detectionResult.incidentUpdated) {
                incidentsTriggered++;
              }
            } catch (detErr) {
              console.warn(`[Monitor] Detection failed for event ${event.id}:`, detErr.message);
            }
          }
        } catch (ingestErr) {
          console.warn(`[Monitor] Ingestion rejected for event:`, ingestErr.message);
        }
      }

      // 7. Update cursor state and account lastSyncAt
      state.lastSyncedAt = syncStartedAt;
      if (collectedEvents.length > 0) {
        const latestTime = collectedEvents
          .map((e) => e.timestamp || e.created_at || e.time || e.occurredAt)
          .filter(Boolean)
          .sort()
          .pop();
        if (latestTime) {
          state.lastEventTimestamp = latestTime;
        }
      }

      await connectedAccountRepository.updateLastSyncAt(connectedAccountId, syncStartedAt).catch(() => {});

      // 8. Audit log synchronization execution
      await auditLogRepository.create({
        userId,
        actorType: 'SYSTEM',
        actorId: 'AccountSecurityMonitor',
        actionType: initialSync ? 'INITIAL_SECURITY_SYNC' : 'INCREMENTAL_SECURITY_SYNC',
        targetType: 'ConnectedAccount',
        targetId: connectedAccountId,
        result: 'SUCCESS',
        metadata: {
          provider: account.provider,
          initialSync,
          eventsIngested,
          duplicatesSkipped,
          incidentsTriggered,
        },
      }).catch(() => {});

      return {
        status: 'SUCCESS',
        connectedAccountId,
        provider: account.provider,
        initialSync,
        eventsIngested,
        duplicatesSkipped,
        incidentsTriggered,
        lastSyncedAt: syncStartedAt,
      };
    } finally {
      state.inFlight = false;
    }
  }

  /**
   * Provider-specific event collection handler.
   * Strictly avoids fabrication and uses official provider endpoints.
   *
   * @private
   */
  async _collectProviderEvents({ account, provider, accessToken, cursor, startTime }) {
    const rawEvents = [];
    if (!accessToken) return rawEvents;

    if (account.provider === 'GITHUB') {
      // 1. Fetch public SSH keys and detect new SSH key additions
      try {
        const overview = await provider.getSecurityOverview(accessToken, {
          providerAccountId: account.providerAccountId,
          displayName: account.providerDisplayName,
          grantedScopes: account.grantedScopes,
        }, { fetchLive: true });

        if (Array.isArray(overview.sshKeys) && overview.sshKeys.length > 0) {
          const knownSet = this._knownSshKeyIds.get(account.id) || new Set();

          for (const key of overview.sshKeys) {
            const keyKey = String(key.id);
            if (this._knownSshKeyIds.has(account.id) && !knownSet.has(keyKey)) {
              // Real NEW SSH Key discovered!
              rawEvents.push({
                action: 'public_key.create',
                eventType: 'SSH_KEY_CREATED',
                id: `gh_key_${key.id}`,
                created_at: key.createdAt || new Date().toISOString(),
                details: {
                  keyId: key.id,
                  title: key.title,
                  type: key.type,
                  fingerprint: key.fingerprint,
                  snippet: key.keySnippet || key.snippet,
                },
              });
            }
            knownSet.add(keyKey);
          }
          this._knownSshKeyIds.set(account.id, knownSet);
        }
      } catch {
        // Non-blocking
      }

      // 2. Fetch public repository events (classified strictly as REPOSITORY_ACTIVITY)
      try {
        const username = account.providerDisplayName || account.providerAccountId;
        const eventsRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events?per_page=10`, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Re-COVER-Platform',
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (eventsRes.ok) {
          const items = await eventsRes.json();
          if (Array.isArray(items)) {
            for (const item of items) {
              rawEvents.push({
                ...item,
                eventType: 'REPOSITORY_ACTIVITY',
              });
            }
          }
        }
      } catch {
        // Non-blocking
      }

      // 3. Organization Audit Log (if authorized with admin:org or read:audit_log)
      const scopes = account.grantedScopes || '';
      if (scopes.includes('read:audit_log') || scopes.includes('admin:org')) {
        try {
          const orgAudit = await provider.getAuditLogEvents({
            accessToken,
            org: account.providerAccountId,
          });
          if (orgAudit.authorized && Array.isArray(orgAudit.events)) {
            rawEvents.push(...orgAudit.events);
          }
        } catch {
          // Non-blocking
        }
      }
    } else if (account.provider === 'GOOGLE') {
      // Check if Workspace Admin Reports scope is authorized
      const scopes = account.grantedScopes || '';
      const hasReports = scopes.includes('admin.reports.audit.readonly') || scopes.includes('admin.reports');

      if (hasReports) {
        try {
          const loginReports = await provider.getWorkspaceReports({
            accessToken,
            userKey: 'all',
            applicationName: 'login',
            startTime,
          });
          if (loginReports.authorized && Array.isArray(loginReports.events)) {
            rawEvents.push(...loginReports.events);
          }

          const adminReports = await provider.getWorkspaceReports({
            accessToken,
            userKey: 'all',
            applicationName: 'admin',
            startTime,
          });
          if (adminReports.authorized && Array.isArray(adminReports.events)) {
            rawEvents.push(...adminReports.events);
          }
        } catch {
          // Non-blocking
        }
      }
    }

    return rawEvents;
  }

  /**
   * Handles Google Workspace push notification webhooks securely.
   *
   * @param {object} headers - Inbound HTTP headers
   * @param {any} body - Inbound HTTP body
   * @returns {Promise<{ success: boolean, message?: string }>}
   */
  async handleGoogleReportsWebhook(headers, body) {
    const channelId = headers['x-goog-channel-id'];
    const channelToken = headers['x-goog-channel-token'];
    const resourceState = headers['x-goog-resource-state'];

    if (!channelId) {
      const err = new Error('Missing X-Goog-Channel-ID header');
      err.statusCode = 400;
      throw err;
    }

    // Verify channel exists in registered channels
    const channel = this._webhookChannels.get(channelId);
    if (!channel || channel.channelToken !== channelToken) {
      const err = new Error('Invalid or unverified webhook channel token');
      err.statusCode = 401;
      throw err;
    }

    // Acknowledge channel sync probe
    if (resourceState === 'sync') {
      return { success: true, message: 'Channel sync acknowledged' };
    }

    // Trigger incremental sync for the associated account asynchronously
    this.syncAccount(channel.userId, channel.connectedAccountId, { initialSync: false }).catch((err) => {
      console.warn(`[Monitor] Webhook-triggered sync failed for account ${channel.connectedAccountId}:`, err.message);
    });

    return { success: true, message: 'Event queued for synchronization' };
  }

  /**
   * Registers a webhook channel for a Google Workspace account.
   */
  registerWebhookChannel({ channelId, channelToken, connectedAccountId, userId }) {
    this._webhookChannels.set(channelId, {
      channelId,
      channelToken,
      connectedAccountId,
      userId,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Starts periodic continuous monitoring across active connected accounts.
   */
  startMonitoring() {
    if (this._pollingTimer) return;

    this._pollingTimer = setInterval(async () => {
      try {
        const { getDb } = require('../lib/db');
        const db = getDb();
        const activeAccounts = await db.orm.public.ConnectedAccount.where({ status: 'ACTIVE' }).all();

        for (const acc of activeAccounts) {
          try {
            await this.syncAccount(acc.userId, acc.id, { initialSync: false });
          } catch (err) {
            console.warn(`[Monitor] Periodic sync failed for account ${acc.id}:`, err.message);
          }
        }
      } catch {
        // Safe catch-all
      }
    }, this._pollingIntervalMs);

    // Unref so timer does not prevent node process exit in test runners
    if (this._pollingTimer.unref) {
      this._pollingTimer.unref();
    }
  }

  /**
   * Stops periodic background monitoring.
   */
  stopMonitoring() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
  }

  /**
   * Resets in-memory tracking state (useful for test isolation).
   */
  clearState() {
    this._syncState.clear();
    this._knownSshKeyIds.clear();
    this._webhookChannels.clear();
    this.stopMonitoring();
  }

  /**
   * Retrieves or initializes the sync state container for an account.
   * @private
   */
  _getOrCreateSyncState(connectedAccountId) {
    if (!this._syncState.has(connectedAccountId)) {
      this._syncState.set(connectedAccountId, {
        lastSyncedAt: null,
        lastEventTimestamp: null,
        providerCursor: null,
        inFlight: false,
      });
    }
    return this._syncState.get(connectedAccountId);
  }
}

const accountSecurityMonitor = new AccountSecurityMonitorService();

module.exports = {
  AccountSecurityMonitorService,
  accountSecurityMonitor,
};

