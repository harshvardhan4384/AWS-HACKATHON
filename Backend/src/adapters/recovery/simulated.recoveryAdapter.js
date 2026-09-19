'use strict';

const { BaseRecoveryAdapter } = require('./base.recoveryAdapter');

/**
 * SimulatedRecoveryAdapter — Stateful in-memory simulation of provider recovery operations.
 *
 * Used for testing and development. Maintains Maps of grant/token/session/SSH key state
 * so tests can verify state transitions without touching real provider APIs.
 *
 * All operations record a timestamp and return a structured result matching the
 * interface expected by ActionExecutorService.
 */
class SimulatedRecoveryAdapter extends BaseRecoveryAdapter {
  constructor() {
    super('simulated');

    // Simulated state maps: id → 'active' | 'revoked' | 'removed' | 'terminated' | 'disabled'
    this._oauthGrants = new Map();
    this._tokens = new Map();
    this._sessions = new Map();
    this._sshKeys = new Map();
    this._integrations = new Map();
  }

  /**
   * Resets all simulated state. Useful between test runs.
   */
  reset() {
    this._oauthGrants.clear();
    this._tokens.clear();
    this._sessions.clear();
    this._sshKeys.clear();
    this._integrations.clear();
  }

  /**
   * Pre-seeds a simulated OAuth grant as 'active'.
   * @param {string} grantId
   */
  seedOAuthGrant(grantId) {
    this._oauthGrants.set(grantId, 'active');
  }

  /**
   * Pre-seeds a simulated token as 'active'.
   * @param {string} tokenId
   */
  seedToken(tokenId) {
    this._tokens.set(tokenId, 'active');
  }

  /**
   * Pre-seeds a simulated session as 'active'.
   * @param {string} sessionId
   */
  seedSession(sessionId) {
    this._sessions.set(sessionId, 'active');
  }

  /**
   * Pre-seeds a simulated SSH key as 'active'.
   * @param {string} keyId
   */
  seedSSHKey(keyId) {
    this._sshKeys.set(keyId, 'active');
  }

  /**
   * Pre-seeds a simulated integration as 'active'.
   * @param {string} integrationId
   */
  seedIntegration(integrationId) {
    this._integrations.set(integrationId, 'active');
  }

  /**
   * Gets the current state of a simulated grant.
   * @param {string} grantId
   * @returns {string|undefined}
   */
  getGrantState(grantId) {
    return this._oauthGrants.get(grantId);
  }

  /**
   * Gets the current state of a simulated session.
   * @param {string} sessionId
   * @returns {string|undefined}
   */
  getSessionState(sessionId) {
    return this._sessions.get(sessionId);
  }

  async revokeOAuthApp({ connectedAccountId, targetId, metadata = {} }) {
    const currentState = this._oauthGrants.get(targetId);
    if (currentState === 'revoked') {
      return {
        success: true,
        revokedAt: new Date().toISOString(),
        alreadyRevoked: true,
        details: {
          provider: this.providerName,
          connectedAccountId,
          targetId,
          previousState: 'revoked',
          metadata,
        },
      };
    }

    this._oauthGrants.set(targetId, 'revoked');
    return {
      success: true,
      revokedAt: new Date().toISOString(),
      alreadyRevoked: false,
      details: {
        provider: this.providerName,
        connectedAccountId,
        targetId,
        previousState: currentState || 'unknown',
        metadata,
      },
    };
  }

  async revokeAccessToken({ connectedAccountId, targetId, metadata = {} }) {
    const currentState = this._tokens.get(targetId);
    if (currentState === 'revoked') {
      return {
        success: true,
        revokedAt: new Date().toISOString(),
        alreadyRevoked: true,
        details: {
          provider: this.providerName,
          connectedAccountId,
          targetId,
          previousState: 'revoked',
          metadata,
        },
      };
    }

    this._tokens.set(targetId, 'revoked');
    return {
      success: true,
      revokedAt: new Date().toISOString(),
      alreadyRevoked: false,
      details: {
        provider: this.providerName,
        connectedAccountId,
        targetId,
        previousState: currentState || 'unknown',
        metadata,
      },
    };
  }

  async terminateSession({ connectedAccountId, targetId, metadata = {} }) {
    const currentState = this._sessions.get(targetId);
    if (currentState === 'terminated') {
      return {
        success: true,
        terminatedAt: new Date().toISOString(),
        alreadyTerminated: true,
        details: {
          provider: this.providerName,
          connectedAccountId,
          targetId,
          previousState: 'terminated',
          metadata,
        },
      };
    }

    this._sessions.set(targetId, 'terminated');
    return {
      success: true,
      terminatedAt: new Date().toISOString(),
      alreadyTerminated: false,
      details: {
        provider: this.providerName,
        connectedAccountId,
        targetId,
        previousState: currentState || 'unknown',
        metadata,
      },
    };
  }

  async removeSSHKey({ connectedAccountId, targetId, metadata = {} }) {
    const currentState = this._sshKeys.get(targetId);
    if (currentState === 'removed') {
      return {
        success: true,
        removedAt: new Date().toISOString(),
        alreadyRemoved: true,
        details: {
          provider: this.providerName,
          connectedAccountId,
          targetId,
          previousState: 'removed',
          metadata,
        },
      };
    }

    this._sshKeys.set(targetId, 'removed');
    return {
      success: true,
      removedAt: new Date().toISOString(),
      alreadyRemoved: false,
      details: {
        provider: this.providerName,
        connectedAccountId,
        targetId,
        previousState: currentState || 'unknown',
        metadata,
      },
    };
  }

  async disableConnectedAccount({ connectedAccountId, targetId, metadata = {} }) {
    const currentState = this._integrations.get(targetId);
    if (currentState === 'disabled') {
      return {
        success: true,
        disabledAt: new Date().toISOString(),
        alreadyDisabled: true,
        details: {
          provider: this.providerName,
          connectedAccountId,
          targetId,
          previousState: 'disabled',
          metadata,
        },
      };
    }

    this._integrations.set(targetId, 'disabled');
    return {
      success: true,
      disabledAt: new Date().toISOString(),
      alreadyDisabled: false,
      details: {
        provider: this.providerName,
        connectedAccountId,
        targetId,
        previousState: currentState || 'unknown',
        metadata,
      },
    };
  }

  // ===========================================================================
  // State Inspection Methods (Task 15 — Verification)
  // ===========================================================================

  /**
   * Retrieves simulated OAuth apps.
   * @param {object} [params]
   * @returns {Promise<Array<{ id: string, status: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getOAuthApps(params = {}) {
    if (this._simulatedErrors && this._simulatedErrors.get('getOAuthApps')) {
      throw new Error(this._simulatedErrors.get('getOAuthApps'));
    }
    const apps = [];
    for (const [id, status] of this._oauthGrants.entries()) {
      apps.push({ id, status });
    }
    return apps;
  }

  /**
   * Retrieves active simulated sessions.
   * @param {object} [params]
   * @returns {Promise<Array<{ id: string, status: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getActiveSessions(params = {}) {
    if (this._simulatedErrors && this._simulatedErrors.get('getActiveSessions')) {
      throw new Error(this._simulatedErrors.get('getActiveSessions'));
    }
    const sessions = [];
    for (const [id, status] of this._sessions.entries()) {
      sessions.push({ id, status });
    }
    return sessions;
  }

  /**
   * Retrieves simulated SSH keys.
   * @param {object} [params]
   * @returns {Promise<Array<{ id: string, status: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getSSHKeys(params = {}) {
    if (this._simulatedErrors && this._simulatedErrors.get('getSSHKeys')) {
      throw new Error(this._simulatedErrors.get('getSSHKeys'));
    }
    const keys = [];
    for (const [id, status] of this._sshKeys.entries()) {
      keys.push({ id, status });
    }
    return keys;
  }

  /**
   * Retrieves simulated tokens.
   * @param {object} [params]
   * @returns {Promise<Array<{ id: string, status: string }>>}
   */
  // eslint-disable-next-line no-unused-vars
  async getTokens(params = {}) {
    if (this._simulatedErrors && this._simulatedErrors.get('getTokens')) {
      throw new Error(this._simulatedErrors.get('getTokens'));
    }
    const tokens = [];
    for (const [id, status] of this._tokens.entries()) {
      tokens.push({ id, status });
    }
    return tokens;
  }

  /**
   * Retrieves simulated integration state.
   * @param {object} params
   * @param {string} params.targetId
   * @returns {Promise<{ id: string, status: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async getIntegrationState(params = {}) {
    if (this._simulatedErrors && this._simulatedErrors.get('getIntegrationState')) {
      throw new Error(this._simulatedErrors.get('getIntegrationState'));
    }
    const targetId = params.targetId;
    const status = this._integrations.get(targetId) || 'unknown';
    return { id: targetId, status };
  }

  /**
   * Injects an error into a specific inspect method for outage/timeout testing.
   * @param {string} methodName
   * @param {string|null} errorMessage
   */
  simulateError(methodName, errorMessage) {
    if (!this._simulatedErrors) this._simulatedErrors = new Map();
    if (errorMessage) {
      this._simulatedErrors.set(methodName, errorMessage);
    } else {
      this._simulatedErrors.delete(methodName);
    }
  }

  /**
   * Resets error simulations.
   */
  clearSimulatedErrors() {
    if (this._simulatedErrors) this._simulatedErrors.clear();
  }
}

// Singleton instance for use in tests and services
const simulatedRecoveryAdapter = new SimulatedRecoveryAdapter();

module.exports = { SimulatedRecoveryAdapter, simulatedRecoveryAdapter };


