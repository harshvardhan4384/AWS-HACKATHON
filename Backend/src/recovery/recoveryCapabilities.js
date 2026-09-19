'use strict';

/**
 * Recovery Capability Matrix — Task 13
 *
 * Maps provider → action type → support status.
 * This is the ONLY file that determines which actions are allowed.
 *
 * EXPLICIT DENY LIST:
 * - Account deletion / permanent destruction
 * - Repository or data deletion
 * - Shell command execution
 * - eval / arbitrary code execution
 * - Arbitrary SQL or Cypher mutations
 *
 * The Action Executor enforces the allowlist: any action type NOT in
 * ALLOWED_ACTION_TYPES is rejected before execution reaches the adapter.
 */

/** The complete set of action types the executor will consider for execution. */
const ALLOWED_ACTION_TYPES = Object.freeze([
  'REVOKE_OAUTH',
  'REVOKE_TOKEN',
  'REMOVE_SSH_KEY',
  'TERMINATE_SESSION',
  'DISABLE_INTEGRATION',
]);

/** Action types that exist in the schema but are EXPLICITLY DENIED for execution. */
const DENIED_ACTION_TYPES = Object.freeze([
  'ROTATE_CREDENTIAL',  // Requires separate key-generation workflow — not automated
  'SECURITY_CONFIG',    // Arbitrary config change — too broad for deterministic execution
  // Destructive / irreversible — never automated
  'DELETE_ACCOUNT',
  'DELETE_REPOSITORY',
  'EXECUTE_SHELL',
  'EVAL',
]);

/**
 * Provider capability support status values.
 * @enum {string}
 */
const CAPABILITY_STATUS = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  UNSUPPORTED: 'UNSUPPORTED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Recovery capability matrix.
 * provider (lowercase) → action type → CAPABILITY_STATUS
 */
const CAPABILITY_MATRIX = Object.freeze({
  google: Object.freeze({
    REVOKE_OAUTH: CAPABILITY_STATUS.SUPPORTED,
    REVOKE_TOKEN: CAPABILITY_STATUS.SUPPORTED,
    REMOVE_SSH_KEY: CAPABILITY_STATUS.UNSUPPORTED,  // Not applicable to Google accounts
    TERMINATE_SESSION: CAPABILITY_STATUS.SUPPORTED,
    DISABLE_INTEGRATION: CAPABILITY_STATUS.SUPPORTED,
  }),
  github: Object.freeze({
    REVOKE_OAUTH: CAPABILITY_STATUS.SUPPORTED,
    REVOKE_TOKEN: CAPABILITY_STATUS.SUPPORTED,
    REMOVE_SSH_KEY: CAPABILITY_STATUS.SUPPORTED,
    TERMINATE_SESSION: CAPABILITY_STATUS.UNSUPPORTED,  // GitHub has no session concept
    DISABLE_INTEGRATION: CAPABILITY_STATUS.SUPPORTED,
  }),
  simulated: Object.freeze({
    REVOKE_OAUTH: CAPABILITY_STATUS.SUPPORTED,
    REVOKE_TOKEN: CAPABILITY_STATUS.SUPPORTED,
    REMOVE_SSH_KEY: CAPABILITY_STATUS.SUPPORTED,
    TERMINATE_SESSION: CAPABILITY_STATUS.SUPPORTED,
    DISABLE_INTEGRATION: CAPABILITY_STATUS.SUPPORTED,
  }),
});

/**
 * Checks if a given action type is in the explicit allowlist.
 *
 * @param {string} actionType
 * @returns {boolean}
 */
function isActionTypeAllowed(actionType) {
  return ALLOWED_ACTION_TYPES.includes(actionType);
}

/**
 * Gets the capability status for a specific provider and action type.
 *
 * @param {string} provider - Provider identifier (e.g. 'google', 'github')
 * @param {string} actionType - RecoveryActionType enum value
 * @returns {string} CAPABILITY_STATUS value
 */
function getCapability(provider, actionType) {
  const normalizedProvider = (provider || '').toLowerCase();
  const matrix = CAPABILITY_MATRIX[normalizedProvider];
  if (!matrix) return CAPABILITY_STATUS.UNKNOWN;
  return matrix[actionType] || CAPABILITY_STATUS.UNKNOWN;
}

/**
 * Returns all supported action types for a given provider.
 *
 * @param {string} provider
 * @returns {string[]}
 */
function getSupportedActions(provider) {
  const normalizedProvider = (provider || '').toLowerCase();
  const matrix = CAPABILITY_MATRIX[normalizedProvider];
  if (!matrix) return [];
  return Object.entries(matrix)
    .filter(([, status]) => status === CAPABILITY_STATUS.SUPPORTED)
    .map(([actionType]) => actionType);
}

module.exports = {
  ALLOWED_ACTION_TYPES,
  DENIED_ACTION_TYPES,
  CAPABILITY_STATUS,
  CAPABILITY_MATRIX,
  isActionTypeAllowed,
  getCapability,
  getSupportedActions,
};

