'use strict';

const BaseEventAdapter = require('./base.eventAdapter');
const GoogleEventAdapter = require('./google.eventAdapter');
const GitHubEventAdapter = require('./github.eventAdapter');
const AwsEventAdapter = require('./aws.eventAdapter');

/**
 * Registry managing provider event adapters.
 * Decouples event ingestion pipeline from concrete provider parsing details.
 */
class EventAdapterRegistry {
  constructor() {
    /** @type {Map<string, BaseEventAdapter>} */
    this.adapters = new Map();
  }

  /**
   * Registers an event adapter.
   *
   * @param {BaseEventAdapter} adapter
   */
  register(adapter) {
    if (!(adapter instanceof BaseEventAdapter)) {
      throw new TypeError('Adapter must be an instance of BaseEventAdapter');
    }
    const key = adapter.provider.toUpperCase();
    this.adapters.set(key, adapter);
  }

  /**
   * Retrieves an adapter by provider name.
   *
   * @param {string} provider
   * @returns {BaseEventAdapter|null}
   */
  get(provider) {
    if (!provider || typeof provider !== 'string') return null;
    return this.adapters.get(provider.toUpperCase()) || null;
  }

  /**
   * Checks if an adapter is registered.
   *
   * @param {string} provider
   * @returns {boolean}
   */
  has(provider) {
    if (!provider || typeof provider !== 'string') return false;
    return this.adapters.has(provider.toUpperCase());
  }

  /**
   * Unregisters an adapter (useful in testing).
   *
   * @param {string} provider
   * @returns {boolean}
   */
  unregister(provider) {
    if (!provider || typeof provider !== 'string') return false;
    return this.adapters.delete(provider.toUpperCase());
  }

  /**
   * Initializes default provider event adapters.
   */
  initDefaults() {
    this.register(new GoogleEventAdapter());
    this.register(new GitHubEventAdapter());
    this.register(new AwsEventAdapter());
  }

  /**
   * Clears all adapters.
   */
  clear() {
    this.adapters.clear();
  }

  /**
   * Lists registered providers.
   *
   * @returns {string[]}
   */
  list() {
    return Array.from(this.adapters.keys());
  }
}

// Global registry singleton
const eventAdapterRegistry = new EventAdapterRegistry();
eventAdapterRegistry.initDefaults();

module.exports = {
  EventAdapterRegistry,
  eventAdapterRegistry,
};

