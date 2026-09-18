'use strict';

const crypto = require('crypto');
const { EVENT_TYPES, DEFAULT_SEVERITY_BY_EVENT_TYPE } = require('../../utils/taxonomy');
const { redactSensitive } = require('../../utils/redaction');

/**
 * Base abstract class for provider event adapters in Re:COVER.
 */
class BaseEventAdapter {
  /**
   * @param {string} providerName - 'GOOGLE' | 'GITHUB' | 'AWS'
   */
  constructor(providerName) {
    if (new.target === BaseEventAdapter) {
      throw new TypeError('Cannot construct BaseEventAdapter directly; instantiate a subclass.');
    }
    this._provider = providerName;
  }

  /**
   * @returns {string} Provider identifier
   */
  get provider() {
    return this._provider;
  }

  /**
   * Validates raw payload structure.
   *
   * @param {any} rawPayload
   * @returns {{ valid: boolean, errors?: string[] }}
   */
  validate(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return { valid: false, errors: ['Payload must be a non-empty object'] };
    }
    return { valid: true };
  }

  /**
   * Derives or generates an idempotency providerEventId.
   * If the payload lacks a native unique identifier, a deterministic hash is generated
   * based on provider, canonical event type, occurrence timestamp, source IP, and payload contents.
   *
   * @param {object} rawPayload
   * @param {string} canonicalEventType
   * @param {string} occurredAt
   * @param {string|null} [sourceIp]
   * @param {string|null} [nativeId]
   * @returns {string}
   */
  deriveProviderEventId(rawPayload, canonicalEventType, occurredAt, sourceIp = null, nativeId = null) {
    if (nativeId && typeof nativeId === 'string' && nativeId.trim().length > 0) {
      return nativeId.trim();
    }

    // Compute deterministic fallback hash
    const input = `${this._provider}|${canonicalEventType}|${occurredAt}|${sourceIp || ''}|${JSON.stringify(rawPayload)}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
    return `det_${hash}`;
  }

  /**
   * Normalizes raw event payload to the canonical Re:COVER event schema.
   *
   * @param {object} rawPayload
   * @param {object} [context]
   * @returns {object} Canonical normalized event
   */
  normalize(rawPayload, context = {}) {
    throw new Error(`normalize() must be implemented by subclass ${this.constructor.name}`);
  }

  /**
   * Helper to format safe, untrusted eventData container.
   * Always scrubs credentials/tokens and marks payload as untrusted data.
   *
   * @param {string} providerEventType
   * @param {object} details
   * @param {boolean} [isSimulated=false]
   * @returns {object}
   */
  formatEventData(providerEventType, details, isSimulated = false) {
    const cleanDetails = redactSensitive(details || {});
    return {
      providerEventType: providerEventType || 'UNKNOWN',
      isUntrustedPayload: true,
      isSimulated: Boolean(isSimulated),
      payloadSchemaVersion: '1.0',
      details: cleanDetails,
    };
  }

  /**
   * Helper to resolve default severity for a canonical event type.
   *
   * @param {string} eventType
   * @param {string|null} [overrideSeverity]
   * @returns {string}
   */
  resolveSeverity(eventType, overrideSeverity = null) {
    if (overrideSeverity) return overrideSeverity;
    return DEFAULT_SEVERITY_BY_EVENT_TYPE[eventType] || 'INFO';
  }
}

module.exports = BaseEventAdapter;

