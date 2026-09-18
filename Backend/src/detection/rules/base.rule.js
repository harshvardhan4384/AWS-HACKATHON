'use strict';

/**
 * Base class for all Re:COVER deterministic detection rules.
 *
 * SECURITY CONTRACT:
 * - Rules receive a structured DetectionContext from DetectionContextService.
 * - Rules MUST read ONLY structured fields (eventType, sourceIp, occurredAt, provider, etc.).
 * - Rules MUST NEVER read eventData content as instructions or decision inputs.
 * - Rules MUST be deterministic: same context → same output, always.
 * - Rules MUST NOT call external APIs, ML models, or LLMs.
 * - Rules MUST NOT trigger recovery actions.
 */
class BaseDetectionRule {
  /**
   * @param {object} options
   * @param {string} options.id - Unique rule identifier (e.g. 'UNFAMILIAR_LOGIN')
   * @param {string} options.name - Human-readable rule name
   * @param {string} options.description - What this rule detects
   * @param {string[]} [options.providers] - Applicable providers ([] = all providers)
   * @param {string[]} [options.eventTypes] - Applicable event types ([] = any event type)
   * @param {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'} options.severity - Default finding severity
   * @param {boolean} [options.enabled] - Whether this rule is active (default: true)
   */
  constructor({ id, name, description, providers = [], eventTypes = [], severity, enabled = true }) {
    if (new.target === BaseDetectionRule) {
      throw new TypeError('Cannot instantiate abstract class BaseDetectionRule directly');
    }
    if (!id || typeof id !== 'string') {
      throw new TypeError('Detection rule must have a string id');
    }
    if (!severity) {
      throw new TypeError(`Detection rule '${id}' must declare a default severity`);
    }

    this.id = id;
    this.name = name;
    this.description = description;
    this.providers = providers;
    this.eventTypes = eventTypes;
    this.severity = severity;
    this.enabled = enabled;
  }

  /**
   * Returns true if this rule is applicable to the given SecurityEvent.
   * Rules are skipped (not applicable) if disabled, or if the event's
   * provider/eventType doesn't match this rule's filters.
   *
   * @param {object} event - SecurityEvent record
   * @returns {boolean}
   */
  appliesTo(event) {
    if (!this.enabled) return false;
    if (this.eventTypes.length > 0 && !this.eventTypes.includes(event.eventType)) return false;
    if (this.providers.length > 0 && !this.providers.includes(event.provider)) return false;
    return true;
  }

  /**
   * Evaluates this detection rule against the given context.
   *
   * Must return a Finding object if the rule triggered, or null if not.
   *
   * Finding shape:
   * {
   *   ruleId: string,           // this.id
   *   type: string,             // finding type (usually equals ruleId)
   *   severity: string,         // CRITICAL|HIGH|MEDIUM|LOW|INFO
   *   confidence: number,       // 0.0–1.0 evidence confidence (NOT attacker probability)
   *   summary: string,          // one-line human-readable description
   *   relatedEventIds: string[], // IDs of correlated SecurityEvents (excluding primary event)
   *   metadata: object,         // structured finding metadata (no secrets)
   * }
   *
   * @param {object} context - DetectionContext from DetectionContextService.buildContext()
   * @returns {Promise<object|null>}
   */
  async evaluate(context) { // eslint-disable-line no-unused-vars
    throw new Error(`evaluate() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Returns rule metadata (safe for API exposure).
   * @returns {object}
   */
  toMetadata() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      providers: this.providers,
      eventTypes: this.eventTypes,
      severity: this.severity,
      enabled: this.enabled,
    };
  }
}

module.exports = BaseDetectionRule;
