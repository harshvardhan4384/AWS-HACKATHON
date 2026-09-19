'use strict';

/**
 * BaseRecoveryAdapter — Abstract base class for all recovery provider adapters.
 *
 * Recovery adapters are SEPARATE from OAuth provider adapters (BaseOAuthProvider).
 * They implement deterministic recovery operations against provider APIs.
 *
 * AUTHORIZATION BOUNDARY: Adapters MUST NOT be called directly by controllers or
 * services without first passing through the ActionExecutorService authorization
 * validation pipeline.
 *
 * All subclasses must implement every abstract method listed below.
 * Calling an abstract method on the base class throws NotImplementedError.
 */
class BaseRecoveryAdapter {
  /**
   * @param {string} providerName - e.g. 'google', 'github', 'simulated'
   */
  constructor(providerName) {
    if (new.target === BaseRecoveryAdapter) {
      throw new Error('BaseRecoveryAdapter is abstract and cannot be instantiated directly');
    }
    this.providerName = providerName;
  }

  /**
   * Revokes an OAuth application authorization from the provider.
   *
   * @param {object} params
   * @param {string} params.connectedAccountId - ID of the connected account
   * @param {string} params.targetId - OAuth app ID / grant ID to revoke
   * @param {object} [params.metadata] - Additional provider-specific metadata
   * @returns {Promise<{ success: boolean, revokedAt: string, details: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async revokeOAuthApp(params) {
    throw new Error(`${this.constructor.name} must implement revokeOAuthApp()`);
  }

  /**
   * Revokes a specific access token or refresh token.
   *
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @param {string} params.targetId - Token identifier to revoke
   * @param {object} [params.metadata]
   * @returns {Promise<{ success: boolean, revokedAt: string, details: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async revokeAccessToken(params) {
    throw new Error(`${this.constructor.name} must implement revokeAccessToken()`);
  }

  /**
   * Terminates an active provider session.
   *
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @param {string} params.targetId - Session ID to terminate
   * @param {object} [params.metadata]
   * @returns {Promise<{ success: boolean, terminatedAt: string, details: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async terminateSession(params) {
    throw new Error(`${this.constructor.name} must implement terminateSession()`);
  }

  /**
   * Removes an SSH key from the provider account.
   *
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @param {string} params.targetId - SSH key ID / fingerprint to remove
   * @param {object} [params.metadata]
   * @returns {Promise<{ success: boolean, removedAt: string, details: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async removeSSHKey(params) {
    throw new Error(`${this.constructor.name} must implement removeSSHKey()`);
  }

  /**
   * Disables a connected account integration (not deleting — disabling access).
   * This is a soft-disable: the account record is marked inactive; no destructive deletion.
   *
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @param {string} params.targetId - Integration or app ID to disable
   * @param {object} [params.metadata]
   * @returns {Promise<{ success: boolean, disabledAt: string, details: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async disableConnectedAccount(params) {
    throw new Error(`${this.constructor.name} must implement disableConnectedAccount()`);
  }

  // ===========================================================================
  // State Inspection Methods (Task 15 — Verification)
  // Subclasses should implement where supported by provider capabilities.
  // ===========================================================================

  /**
   * Retrieves OAuth apps / authorizations for the connected account.
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @returns {Promise<Array<{ id: string, name?: string, status: string, grantedAt?: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getOAuthApps(params) {
    throw new Error(`${this.constructor.name} does not support getOAuthApps()`);
  }

  /**
   * Retrieves active provider sessions.
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @returns {Promise<Array<{ id: string, status: string, ipAddress?: string, lastActiveAt?: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getActiveSessions(params) {
    throw new Error(`${this.constructor.name} does not support getActiveSessions()`);
  }

  /**
   * Retrieves registered SSH keys.
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @returns {Promise<Array<{ id: string, title?: string, fingerprint?: string, status: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getSSHKeys(params) {
    throw new Error(`${this.constructor.name} does not support getSSHKeys()`);
  }

  /**
   * Retrieves registered API/access tokens.
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @returns {Promise<Array<{ id: string, status: string, createdAt?: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getTokens(params) {
    throw new Error(`${this.constructor.name} does not support getTokens()`);
  }

  /**
   * Retrieves integration status for a specific target.
   * @param {object} params
   * @param {string} params.connectedAccountId
   * @param {string} params.targetId
   * @returns {Promise<{ id: string, status: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async getIntegrationState(params) {
    throw new Error(`${this.constructor.name} does not support getIntegrationState()`);
  }
}

module.exports = { BaseRecoveryAdapter };


