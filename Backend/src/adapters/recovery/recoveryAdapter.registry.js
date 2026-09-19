'use strict';

const { simulatedRecoveryAdapter } = require('./simulated.recoveryAdapter');

/**
 * RecoveryAdapterRegistry — maps provider names to recovery adapter instances.
 *
 * Returns 'simulated' adapter as the default for any unrecognized or unconfigured
 * provider during testing. In production, real provider adapters (google, github)
 * would be registered here.
 *
 * AUTHORIZATION BOUNDARY: This registry is only invoked by ActionExecutorService
 * AFTER authorization has been fully validated.
 */
class RecoveryAdapterRegistry {
  constructor() {
    this._adapters = new Map();

    // Register the simulated adapter (available in all environments)
    this.register('simulated', simulatedRecoveryAdapter);
  }

  /**
   * Registers a recovery adapter for a given provider.
   *
   * @param {string} provider - Provider name (lowercase)
   * @param {import('./base.recoveryAdapter').BaseRecoveryAdapter} adapter
   */
  register(provider, adapter) {
    this._adapters.set((provider || '').toLowerCase(), adapter);
  }

  /**
   * Returns the recovery adapter for the given provider.
   * Falls back to the simulated adapter if no real adapter is registered.
   *
   * @param {string} provider
   * @returns {import('./base.recoveryAdapter').BaseRecoveryAdapter}
   */
  get(provider) {
    const normalized = (provider || '').toLowerCase();
    return this._adapters.get(normalized) || this._adapters.get('simulated');
  }

  /**
   * Checks if a real (non-simulated) adapter is registered for a provider.
   *
   * @param {string} provider
   * @returns {boolean}
   */
  hasRealAdapter(provider) {
    const normalized = (provider || '').toLowerCase();
    return this._adapters.has(normalized) && normalized !== 'simulated';
  }
}

const recoveryAdapterRegistry = new RecoveryAdapterRegistry();

module.exports = { RecoveryAdapterRegistry, recoveryAdapterRegistry };

