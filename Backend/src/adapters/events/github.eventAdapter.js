'use strict';

const BaseEventAdapter = require('./base.eventAdapter');
const { EVENT_TYPES, PROVIDERS, normalizeEventType, getEventCategory } = require('../../utils/taxonomy');
const { redactSensitive } = require('../../utils/redaction');

/**
 * Event adapter for GitHub security and activity events.
 * Enforces strict separation between repository/activity events and authentication/security events.
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

    // 1. REPOSITORY ACTIVITY — Strictly separate from logins
    if (
      lower.includes('pushevent') ||
      lower.includes('pullrequestevent') ||
      lower.includes('issuesevent') ||
      lower.includes('watchevent') ||
      lower.includes('createevent') ||
      lower.includes('forkevent') ||
      lower.includes('deleteevent') ||
      lower.includes('releaseevent') ||
      lower.includes('star') ||
      lower.includes('push') ||
      lower.includes('pull_request')
    ) {
      return EVENT_TYPES.REPOSITORY_ACTIVITY;
    }

    // 2. UNRECOGNIZED / SUSPICIOUS LOGIN
    if (
      lower.includes('unrecognized_device') ||
      lower.includes('suspicious_login') ||
      lower.includes('user.sign_in_from_unrecognized_device') ||
      lower.includes('unrecognized_device_and_location')
    ) {
      return EVENT_TYPES.SUSPICIOUS_LOGIN;
    }

    // 3. NEW DEVICE
    if (lower.includes('new_device_used') || lower.includes('new_device')) {
      return EVENT_TYPES.DEVICE_ADDED;
    }

    // 4. AUTHENTICATION (Login / Logout)
    if (lower === 'user.login' || lower === 'login') {
      return EVENT_TYPES.LOGIN;
    }

    if (lower === 'user.logout' || lower === 'logout') {
      return EVENT_TYPES.LOGOUT;
    }

    // 5. CREDENTIALS: SSH KEYS
    if (
      lower.includes('public_key.create') ||
      lower.includes('public_key.add') ||
      lower.includes('ssh_key.create') ||
      lower.includes('ssh_key_create') ||
      lower.includes('public_key_create')
    ) {
      return EVENT_TYPES.SSH_KEY_CREATED;
    }

    if (
      lower.includes('public_key.delete') ||
      lower.includes('public_key.destroy') ||
      lower.includes('public_key.remove') ||
      lower.includes('ssh_key.delete') ||
      lower.includes('ssh_key.remove') ||
      lower.includes('public_key_destroy')
    ) {
      return EVENT_TYPES.SSH_KEY_REMOVED;
    }

    // 6. CREDENTIALS: TOKENS
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

    // 7. OAUTH APPLICATIONS
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

    // 8. SECURITY SETTINGS / PASSWORD / 2FA
    if (
      lower.includes('user.change_password') ||
      lower.includes('user.reset_password') ||
      lower.includes('user.forgot_password') ||
      lower.includes('change_password') ||
      lower.includes('reset_password') ||
      lower.includes('two_factor_authentication.disabled') ||
      lower.includes('two_factor_authentication.enabled') ||
      lower.includes('two_factor_authentication') ||
      lower.includes('2fa.disabled') ||
      lower.includes('2fa.enabled') ||
      lower.includes('security_setting')
    ) {
      return EVENT_TYPES.SECURITY_SETTING_CHANGED;
    }

    if (
      lower.includes('repo.access') ||
      lower.includes('repository.access') ||
      lower.includes('repo.download_zip')
    ) {
      return EVENT_TYPES.REPOSITORY_ACCESS;
    }

    if (lower.includes('account_setting')) {
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
    const category = getEventCategory(canonicalEventType);

    // Extract occurrence timestamp
    let occurredAt = null;
    const rawTime =
      rawPayload.created_at ||
      rawPayload.timestamp ||
      rawPayload.occurredAt ||
      rawPayload.time;

    if (rawTime) {
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

    // Extract actor
    const actor =
      rawPayload.actor?.login ||
      rawPayload.user?.login ||
      rawPayload.actor ||
      rawPayload.user ||
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
    } else if (rawPayload.user_agent || rawPayload.userAgent || rawPayload.device) {
      deviceMetadata = redactSensitive({
        userAgent: rawPayload.user_agent || rawPayload.userAgent || null,
        device: rawPayload.device || null,
        browser: rawPayload.browser || null,
        os: rawPayload.os || null,
      });
    }

    // Location metadata
    let locationMetadata = null;
    if (rawPayload.locationMetadata && typeof rawPayload.locationMetadata === 'object') {
      locationMetadata = redactSensitive(rawPayload.locationMetadata);
    } else if (rawPayload.actor_location || rawPayload.location || rawPayload.geo) {
      const loc = rawPayload.actor_location || rawPayload.location || rawPayload.geo;
      locationMetadata = typeof loc === 'object'
        ? redactSensitive(loc)
        : { rawLocation: String(loc) };
    }

    const severity = this.resolveSeverity(canonicalEventType, rawPayload.severity);

    // Clean details
    const rawDetails = rawPayload.details || rawPayload.data || rawPayload.payload || rawPayload;
    const eventData = {
      ...this.formatEventData(rawEventType || canonicalEventType, rawDetails, false),
      category,
      actor: typeof actor === 'string' ? actor : null,
      source: canonicalEventType === EVENT_TYPES.REPOSITORY_ACTIVITY ? 'GitHub Events API' : 'GitHub Security API',
    };

    return {
      provider: this._provider,
      eventType: canonicalEventType,
      category,
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
