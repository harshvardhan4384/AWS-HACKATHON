'use strict';

const BaseEventAdapter = require('./base.eventAdapter');
const { EVENT_TYPES, PROVIDERS, normalizeEventType, getEventCategory } = require('../../utils/taxonomy');
const { redactSensitive } = require('../../utils/redaction');

/**
 * Event adapter for Google security and activity events (Consumer and Workspace Reports API).
 */
class GoogleEventAdapter extends BaseEventAdapter {
  constructor() {
    super(PROVIDERS.GOOGLE);
  }

  /**
   * Maps Google-specific event names to canonical Re:COVER event types.
   *
   * @param {string} rawType
   * @returns {string} Canonical event type
   */
  mapEventType(rawType) {
    if (!rawType || typeof rawType !== 'string') return EVENT_TYPES.UNKNOWN;
    const lower = rawType.toLowerCase().trim();

    // Suspicious / failed login events first
    if (
      lower.includes('suspicious_login') ||
      lower.includes('login_failure') ||
      lower.includes('gov_attack_warning') ||
      lower.includes('suspicious_program_activity') ||
      lower.includes('unrecognized_device')
    ) {
      return EVENT_TYPES.SUSPICIOUS_LOGIN;
    }

    if (
      lower.includes('login_success') ||
      lower.includes('login_challenge') ||
      lower.includes('login_verification') ||
      lower === 'login' ||
      lower === 'saml_login'
    ) {
      return EVENT_TYPES.LOGIN;
    }

    if (lower === 'logout' || lower.includes('logout')) {
      return EVENT_TYPES.LOGOUT;
    }

    if (lower.includes('token_revoc') || lower.includes('token_revoke') || lower === 'revoke_token') {
      return EVENT_TYPES.TOKEN_REVOKED;
    }

    if (lower.includes('token_created') || lower.includes('token_create')) {
      return EVENT_TYPES.TOKEN_CREATED;
    }

    if (lower.includes('oauth_grant') || lower.includes('authorize_app') || lower.includes('install_app') || lower === 'authorize') {
      return EVENT_TYPES.OAUTH_GRANTED;
    }

    if (lower.includes('oauth_revoke') || lower.includes('revoke_access') || lower.includes('uninstall_app') || lower === 'revoke') {
      return EVENT_TYPES.OAUTH_REVOKED;
    }

    if (
      lower.includes('password_change') ||
      lower.includes('password_reset') ||
      lower.includes('change_password') ||
      lower.includes('reset_password') ||
      lower.includes('2step_verification') ||
      lower.includes('2sv') ||
      lower.includes('2fa') ||
      lower.includes('recovery_phone') ||
      lower.includes('recovery_email') ||
      lower.includes('security_setting')
    ) {
      return EVENT_TYPES.SECURITY_SETTING_CHANGED;
    }

    if (lower.includes('device_register') || lower.includes('device_added') || lower.includes('device_enrolled') || lower.includes('new_device')) {
      return EVENT_TYPES.DEVICE_ADDED;
    }

    if (lower.includes('device_removed') || lower.includes('device_wiped') || lower.includes('device_wipe')) {
      return EVENT_TYPES.DEVICE_REMOVED;
    }

    if (lower.includes('account_setting')) {
      return EVENT_TYPES.ACCOUNT_SETTING_CHANGED;
    }

    return normalizeEventType(rawType);
  }

  /**
   * Normalizes a Google raw event into canonical schema.
   *
   * @param {object} rawPayload
   * @param {object} [context]
   * @returns {object} Canonical normalized event
   */
  normalize(rawPayload, context = {}) {
    const validation = this.validate(rawPayload);
    if (!validation.valid) {
      throw new Error(`Invalid Google event payload: ${validation.errors.join(', ')}`);
    }

    // Extract provider event type from various Google structures
    let rawEventType =
      rawPayload.eventType ||
      rawPayload.eventName ||
      rawPayload.event_type ||
      rawPayload.type;

    // Handle Google Workspace Reports API structure
    if (!rawEventType && Array.isArray(rawPayload.events) && rawPayload.events.length > 0) {
      rawEventType = rawPayload.events[0].name || rawPayload.events[0].type;
    }

    const canonicalEventType = this.mapEventType(rawEventType);
    const category = getEventCategory(canonicalEventType);

    // Extract timestamp
    let occurredAt = null;
    const rawTime =
      rawPayload.timestamp ||
      rawPayload.occurredAt ||
      rawPayload.time ||
      rawPayload.id?.time;

    if (rawTime) {
      const parsed = new Date(rawTime);
      if (!isNaN(parsed.getTime())) {
        occurredAt = parsed.toISOString();
      }
    }
    if (!occurredAt) {
      occurredAt = new Date().toISOString();
    }

    // Extract source IP
    const sourceIp =
      rawPayload.ipAddress ||
      rawPayload.sourceIp ||
      rawPayload.ip_address ||
      rawPayload.actor?.ipAddress ||
      null;

    // Extract actor
    const actor =
      rawPayload.actor?.email ||
      rawPayload.actor?.profileId ||
      rawPayload.actor ||
      null;

    // Extract native provider event ID
    const nativeId =
      rawPayload.eventId ||
      rawPayload.event_id ||
      rawPayload.id?.uniqueQualifier ||
      (typeof rawPayload.id === 'string' ? rawPayload.id : null);

    const providerEventId = this.deriveProviderEventId(
      rawPayload,
      canonicalEventType,
      occurredAt,
      sourceIp,
      nativeId
    );

    // Device metadata
    let deviceMetadata = null;
    if (rawPayload.deviceMetadata && typeof rawPayload.deviceMetadata === 'object') {
      deviceMetadata = redactSensitive(rawPayload.deviceMetadata);
    } else if (rawPayload.userAgent || rawPayload.device) {
      deviceMetadata = redactSensitive({
        userAgent: rawPayload.userAgent || null,
        device: rawPayload.device || null,
      });
    }

    // Location metadata
    let locationMetadata = null;
    if (rawPayload.locationMetadata && typeof rawPayload.locationMetadata === 'object') {
      locationMetadata = redactSensitive(rawPayload.locationMetadata);
    } else if (rawPayload.location || rawPayload.geo) {
      const loc = rawPayload.location || rawPayload.geo;
      locationMetadata = typeof loc === 'object'
        ? redactSensitive(loc)
        : { rawLocation: String(loc) };
    }

    const severity = this.resolveSeverity(canonicalEventType, rawPayload.severity);

    // Clean details
    const rawDetails = rawPayload.details || rawPayload.events?.[0]?.parameters || rawPayload;
    const eventData = {
      ...this.formatEventData(rawEventType || canonicalEventType, rawDetails, false),
      category,
      actor: typeof actor === 'string' ? actor : null,
      source: 'Google Workspace Reports API',
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

module.exports = GoogleEventAdapter;
