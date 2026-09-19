'use strict';

/**
 * UserPolicyRepository — stores and manages user-level explicit automation preferences.
 *
 * FAIL-CLOSED DEFAULT:
 * Automation is strictly opt-in. A missing preference or null record always defaults to:
 * - automaticRecovery: false
 * - automaticMaliciousOAuthRevocation: false
 * - allowedAutomationTypes: []
 *
 * This repository manages preferences cleanly without requiring invasive database schema
 * migrations. In production, this can be backed by a preferences table or document store.
 */

const DEFAULT_USER_POLICY = Object.freeze({
  automaticRecovery: false,
  automaticMaliciousOAuthRevocation: false,
  allowedAutomationTypes: Object.freeze([]),
});

class UserPolicyRepository {
  constructor() {
    // Map<userId, policyObject>
    this._store = new Map();
  }

  /**
   * Retrieves user automation preferences.
   * Returns default fail-closed policy if user has never configured preferences.
   *
   * @param {string} userId
   * @returns {Promise<{ automaticRecovery: boolean, automaticMaliciousOAuthRevocation: boolean, allowedAutomationTypes: string[] }>}
   */
  async getUserPolicy(userId) {
    if (!userId) {
      return { ...DEFAULT_USER_POLICY, allowedAutomationTypes: [...DEFAULT_USER_POLICY.allowedAutomationTypes] };
    }

    const existing = this._store.get(userId);
    if (!existing) {
      return { ...DEFAULT_USER_POLICY, allowedAutomationTypes: [...DEFAULT_USER_POLICY.allowedAutomationTypes] };
    }

    return {
      automaticRecovery: Boolean(existing.automaticRecovery),
      automaticMaliciousOAuthRevocation: Boolean(existing.automaticMaliciousOAuthRevocation),
      allowedAutomationTypes: Array.isArray(existing.allowedAutomationTypes)
        ? [...existing.allowedAutomationTypes]
        : [],
    };
  }

  /**
   * Updates explicit automation preferences for a user.
   * Only allows updating recognized policy settings.
   *
   * @param {string} userId
   * @param {object} updates
   * @param {boolean} [updates.automaticRecovery]
   * @param {boolean} [updates.automaticMaliciousOAuthRevocation]
   * @param {string[]} [updates.allowedAutomationTypes]
   * @returns {Promise<object>} Updated policy
   */
  async updateUserPolicy(userId, updates = {}) {
    if (!userId) {
      throw new Error('userId is required to update policy preferences');
    }

    const current = await this.getUserPolicy(userId);
    const updated = {
      automaticRecovery:
        typeof updates.automaticRecovery === 'boolean'
          ? updates.automaticRecovery
          : current.automaticRecovery,
      automaticMaliciousOAuthRevocation:
        typeof updates.automaticMaliciousOAuthRevocation === 'boolean'
          ? updates.automaticMaliciousOAuthRevocation
          : current.automaticMaliciousOAuthRevocation,
      allowedAutomationTypes: Array.isArray(updates.allowedAutomationTypes)
        ? [...updates.allowedAutomationTypes]
        : current.allowedAutomationTypes,
      updatedAt: new Date().toISOString(),
    };

    this._store.set(userId, updated);
    return { ...updated };
  }

  /**
   * Resets policy for a specific user to default fail-closed state.
   *
   * @param {string} userId
   */
  async resetUserPolicy(userId) {
    if (userId) {
      this._store.delete(userId);
    }
  }

  /**
   * Resets all user policy preferences (for test cleanup).
   */
  async resetAll() {
    this._store.clear();
  }
}

const userPolicyRepository = new UserPolicyRepository();

module.exports = {
  UserPolicyRepository,
  userPolicyRepository,
  DEFAULT_USER_POLICY,
};

