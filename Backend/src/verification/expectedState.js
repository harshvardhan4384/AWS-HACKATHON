'use strict';

const { CHECK_TYPES, EXPECTED_STATES } = require('./verificationTypes');

/**
 * Maps a recovery action type to its authoritative primary check type.
 */
const ACTION_TO_CHECK_TYPE = Object.freeze({
  REVOKE_OAUTH: CHECK_TYPES.OAUTH_APP_STATE,
  REVOKE_TOKEN: CHECK_TYPES.ACCESS_TOKEN_STATE,
  TERMINATE_SESSION: CHECK_TYPES.ACTIVE_SESSION_STATE,
  REMOVE_SSH_KEY: CHECK_TYPES.SSH_KEY_STATE,
  DISABLE_INTEGRATION: CHECK_TYPES.CONNECTED_ACCOUNT_STATE,
});

/**
 * Generates the authoritative post-recovery expected state deterministically.
 * Client-supplied values are strictly ignored.
 *
 * @param {object} action - RecoveryAction record
 * @returns {{ checkType: string, expectedState: string, targetId: string|null, targetType: string|null }}
 */
function generateExpectedState(action) {
  if (!action || !action.actionType) {
    throw new Error('Invalid recovery action: missing actionType');
  }

  const checkType = ACTION_TO_CHECK_TYPE[action.actionType];
  const expectedState = EXPECTED_STATES[action.actionType];

  if (!checkType || !expectedState) {
    const err = new Error(`Unsupported recovery action type for verification: ${action.actionType}`);
    err.code = 'UNSUPPORTED_VERIFICATION_ACTION';
    err.statusCode = 400;
    throw err;
  }

  // Extract target details from providerResult metadata if available
  let targetId = null;
  let targetType = null;
  if (action.providerResult) {
    try {
      const meta = typeof action.providerResult === 'string'
        ? JSON.parse(action.providerResult)
        : action.providerResult;
      targetId = meta.targetId || null;
      targetType = meta.targetType || null;
    } catch {
      // ignore parse failure
    }
  }

  return {
    checkType,
    expectedState,
    targetId: targetId || action.id,
    targetType: targetType || action.actionType,
  };
}

module.exports = {
  generateExpectedState,
  ACTION_TO_CHECK_TYPE,
};

