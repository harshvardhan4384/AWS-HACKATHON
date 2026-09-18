'use strict';

const BaseDetectionRule = require('./base.rule');

/**
 * Singleton registry for all Re:COVER deterministic detection rules.
 *
 * Rules are registered by ID. Duplicate registration is rejected.
 * Rules can be retrieved individually or evaluated in bulk against a SecurityEvent.
 */
class DetectionRuleRegistry {
  constructor() {
    /** @type {Map<string, BaseDetectionRule>} */
    this._rules = new Map();
  }

  /**
   * Registers a detection rule. Throws if a rule with the same ID is already registered.
   *
   * @param {BaseDetectionRule} rule
   * @throws {TypeError} if rule is not a BaseDetectionRule instance
   * @throws {Error} if a rule with the same id is already registered
   */
  register(rule) {
    if (!(rule instanceof BaseDetectionRule)) {
      throw new TypeError('Rule must be an instance of BaseDetectionRule');
    }
    if (this._rules.has(rule.id)) {
      throw new Error(`Detection rule '${rule.id}' is already registered. Use a unique rule ID.`);
    }
    this._rules.set(rule.id, rule);
  }

  /**
   * Retrieves a registered rule by ID.
   *
   * @param {string} ruleId
   * @returns {BaseDetectionRule|null}
   */
  get(ruleId) {
    return this._rules.get(ruleId) || null;
  }

  /**
   * Returns all currently enabled rules.
   *
   * @returns {BaseDetectionRule[]}
   */
  getEnabledRules() {
    return Array.from(this._rules.values()).filter((r) => r.enabled);
  }

  /**
   * Returns rules that are both enabled AND applicable to the given SecurityEvent.
   * Use this to determine which rules to evaluate for a specific event.
   *
   * @param {object} event - SecurityEvent record
   * @returns {BaseDetectionRule[]}
   */
  getApplicableRules(event) {
    return Array.from(this._rules.values()).filter((r) => r.appliesTo(event));
  }

  /**
   * Returns metadata for all registered rules (safe for API exposure).
   *
   * @returns {object[]}
   */
  listAll() {
    return Array.from(this._rules.values()).map((r) => r.toMetadata());
  }

  /**
   * Removes all registered rules. Intended for test isolation only.
   */
  clear() {
    this._rules.clear();
  }

  /**
   * Returns the count of registered rules.
   * @returns {number}
   */
  get size() {
    return this._rules.size;
  }
}

// Singleton instance — rules are registered at startup via initDefaultRules()
const detectionRuleRegistry = new DetectionRuleRegistry();

module.exports = { DetectionRuleRegistry, detectionRuleRegistry };
