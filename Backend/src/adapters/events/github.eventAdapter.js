'use strict';

const BaseEventAdapter = require('./base.eventAdapter');
const { EVENT_TYPES, PROVIDERS, normalizeEventType } = require('../../utils/taxonomy');
const { redactSensitive } = require('../../utils/redaction');

/**
 * Event adapter for GitHub security and activity events.
 */
class GitHubEventAdapter extends BaseEventAdapter {
  constructor() {
    super(PROVIDERS.GITHUB);
  }

  /**
   * Maps GitHub-specific action / event names to canonical Re:COVER event types.
   *
   * @param {string} rawType
   * @returns {string} Canonical event type
   */
  mapEventType(rawType) {
    if (!rawType || typeof rawType !== 'string') return EVENT_TYPES.UNKNOWN;
    const lower = rawType.toLowerCase().trim();

    if (lower === 'user.login' || lower === 'login' || lower.includes('login')) {
      return EVENT_TYPES.LOGIN;
    }

    if (lower === 'user.logout' || lower === 'logout') {
      return EVENT_TYPES.LOGOUT;
    }

    if (
      lower.includes('public_key.create') ||
      lower.includes('public_key.add') ||
      lower.includes('ssh_key.create') ||
      lower.includes('ssh_key_create')
    ) {
      return EVENT_TYPES.SSH_KEY_CREATED;
    }

    if (
      lower.includes('public_key.delete') ||
      lower.includes('public_key.destroy') ||
      lower.includes('public_key.remove') ||
      lower.includes('ssh_key.delete') ||
      lower.includes('ssh_key.remove')
    ) {
      return EVENT_TYPES.SSH_KEY_REMOVED;
    }

    if (
      lower.includes('personal_access_token.create') ||
      lower.includes('token.create') ||
      lower === 'pat.create'
    ) {
      return EVENT_TYPES.TOKEN_CREATED;
    }

    if (
      lower.includes('personal_access_token.revoke') ||
      lower.includes('personal_access_token.destroy') ||
      lower.includes('token.revoke') ||
      lower.includes('token.delete') ||
      lower === 'pat.revoke'
    ) {
      return EVENT_TYPES.TOKEN_REVOKED;
    }

    if (
      lower.includes('oauth_access.create') ||
      lower.includes('oauth_authorization.create') ||
      lower.includes('oauth_app.create') ||
      lower.includes('oauth_grant')
    ) {
      return EVENT_TYPES.OAUTH_GRANTED;
    }

    if (
      lower.includes('oauth_access.revoke') ||
      lower.includes('oauth_access.destroy') ||
      lower.includes('oauth_authorization.destroy') ||
      lower.includes('oauth_revoke')
    ) {
      return EVENT_TYPES.OAUTH_REVOKED;
    }

    if (
      lower.includes('repo.access') ||
      lower.includes('repository.access') ||
      lower.includes('repo.download_zip')
    ) {
      return EVENT_TYPES.REPOSITORY_ACCESS;
    }

    if (
      lower.includes('two_factor_authentication.disabled') ||
      lower.includes('2fa.disabled') ||
      lower.includes('security_setting')
    ) {
      return EVENT_TYPES.SECURITY_SETTING_CHANGED;
    }

    if (
      lower.includes('two_factor_authentication.enabled') ||
      lower.includes('2fa.enabled') ||
      lower.includes('account_setting')
    ) {
      return EVENT_TYPES.ACCOUNT_SETTING_CHANGED;
    }

    return normalizeEventType(rawType);
  }

  /**
   * Normalizes a GitHub raw event into canonical schema.
   *
   * @param {object} rawPayload
   * @param {object} [context]
   * @returns {object} Canonical normalized event
   */
  normalize(rawPayload, context = {}) {
    const validation = this.validate(rawPayload);
    if (!validation.valid) {
      throw new Error(`Invalid GitHub event payload: ${validation.errors.join(', ')}`);
    }

    // Extract raw event type / action
    const rawEventType =
      rawPayload.action ||
      rawPayload.eventType ||
      rawPayload.eventName ||
      rawPayload.type ||
      rawPayload.event;

    const canonicalEventType = this.mapEventType(rawEventType);

    // Extract occurrence timestamp
    let occurredAt = null;
    const rawTime =
      rawPayload.created_at ||
      rawPayload.timestamp ||
      rawPayload.occurredAt ||
      rawPayload.time;

    if (rawTime) {
      // Could be unix epoch (ms or s) or ISO string
      if (typeof rawTime === 'number') {
        const ms = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
        occurredAt = new Date(ms).toISOString();
      } else {
        const parsed = new Date(rawTime);
        if (!isNaN(parsed.getTime())) {
          occurredAt = parsed.toISOString();
        }
      }
    }
    if (!occurredAt) {
      occurredAt = new Date().toISOString();
    }

    // Extract source IP
    const sourceIp =
      rawPayload.actor_ip ||
      rawPayload.sender_ip ||
      rawPayload.ipAddress ||
      rawPayload.sourceIp ||
      rawPayload.ip ||
      null;

    // Extract native provider event ID
    const nativeId =
      rawPayload._document_id ||
      rawPayload.id ||
      rawPayload.delivery_id ||
      rawPayload['x-github-delivery'] ||
      rawPayload.eventId;

    const providerEventId = this.deriveProviderEventId(
      rawPayload,
      canonicalEventType,
      occurredAt,
      sourceIp,
      typeof nativeId === 'string' || typeof nativeId === 'number' ? String(nativeId) : null
    );

    // Device metadata
    let deviceMetadata = null;
    if (rawPayload.deviceMetadata && typeof rawPayload.deviceMetadata === 'object') {
      deviceMetadata = redactSensitive(rawPayload.deviceMetadata);
    } else if (rawPayload.user_agent || rawPayload.userAgent) {
      deviceMetadata = redactSensitive({
        userAgent: rawPayload.user_agent || rawPayload.userAgent,
      });
    }

    // Location metadata
    let locationMetadata = null;
    if (rawPayload.locationMetadata && typeof rawPayload.locationMetadata === 'object') {
      locationMetadata = redactSensitive(rawPayload.locationMetadata);
    } else if (rawPayload.actor_location || rawPayload.location) {
      locationMetadata = redactSensitive(rawPayload.actor_location || rawPayload.location);
    }

    const severity = this.resolveSeverity(canonicalEventType, rawPayload.severity);

    // Clean details
    const rawDetails = rawPayload.details || rawPayload.data || rawPayload;
    const eventData = this.formatEventData(rawEventType || canonicalEventType, rawDetails, false);

    return {
      provider: this._provider,
      eventType: canonicalEventType,
      providerEventId,
      occurredAt,
      receivedAt: new Date().toISOString(),
      severity,
      sourceIp: sourceIp ? String(sourceIp) : null,
      deviceMetadata,
      locationMetadata,
      eventData,
    };
  }
}

module.exports = GitHubEventAdapter;

