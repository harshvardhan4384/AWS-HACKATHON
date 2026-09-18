'use strict';

const config = require('../config/env');
const BaseOAuthProvider = require('./base.provider');
const GoogleOAuthProvider = require('./google.provider');
const GitHubOAuthProvider = require('./github.provider');

/**
 * Registry managing OAuth provider implementations.
 * Enables decoupling OAuth controller/service logic from concrete provider integrations.
 */
class ProviderRegistry {
  constructor() {
    /** @type {Map<string, BaseOAuthProvider>} */
    this.providers = new Map();
  }

  /**
   * Registers a provider instance.
   * @param {BaseOAuthProvider} provider
   */
  register(provider) {
    if (!(provider instanceof BaseOAuthProvider)) {
      throw new TypeError('Provider must be an instance of BaseOAuthProvider');
    }
    const key = provider.name.toUpperCase();
    this.providers.set(key, provider);
  }

  /**
   * Retrieves a registered provider by name.
   * @param {string} name
   * @returns {BaseOAuthProvider|null}
   */
  get(name) {
    if (!name || typeof name !== 'string') return null;
    return this.providers.get(name.toUpperCase()) || null;
  }

  /**
   * Checks if a provider is registered.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    if (!name || typeof name !== 'string') return false;
    return this.providers.has(name.toUpperCase());
  }

  /**
   * Unregisters a provider by name (useful for testing).
   * @param {string} name
   * @returns {boolean}
   */
  unregister(name) {
    if (!name || typeof name !== 'string') return false;
    return this.providers.delete(name.toUpperCase());
  }

  /**
   * Clears all registered providers (useful for test isolation).
   */
  clear() {
    this.providers.clear();
  }

  /**
   * Reinitializes default provider instances from configuration.
   */
  initDefaults() {
    const googleProvider = new GoogleOAuthProvider({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
    });
    this.register(googleProvider);

    const githubProvider = new GitHubOAuthProvider({
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      redirectUri: config.githubRedirectUri,
    });
    this.register(githubProvider);
  }

  /**
   * Lists all registered providers and their status.
   * @returns {Array<{ name: string, isConfigured: boolean, supportsPkce: boolean }>}
   */
  list() {
    const list = [];
    for (const [name, provider] of this.providers.entries()) {
      list.push({
        name,
        isConfigured: provider.isConfigured(),
        supportsPkce: provider.supportsPkce(),
      });
    }
    return list;
  }
}

// Global registry singleton
const registry = new ProviderRegistry();
registry.initDefaults();

module.exports = {
  ProviderRegistry,
  providerRegistry: registry,
};
