'use strict';

const { toolRegistry } = require('./tool.registry');

const GetAccountEventsTool = require('./definitions/getAccountEvents.tool');
const GetLoginHistoryTool = require('./definitions/getLoginHistory.tool');
const GetActiveSessionsTool = require('./definitions/getActiveSessions.tool');
const GetOauthAppsTool = require('./definitions/getOauthApps.tool');
const GetSshKeysTool = require('./definitions/getSshKeys.tool');
const GetAccessTokensTool = require('./definitions/getAccessTokens.tool');
const GetRepositoryActivityTool = require('./definitions/getRepositoryActivity.tool');
const GetCloudEventsTool = require('./definitions/getCloudEvents.tool');
const GetDeviceInformationTool = require('./definitions/getDeviceInformation.tool');
const GetSecuritySettingsTool = require('./definitions/getSecuritySettings.tool');
const GetRecoveryMethodsTool = require('./definitions/getRecoveryMethods.tool');

/**
 * Registers all 11 default read-only security investigation tools.
 * Safe to call multiple times (idempotent check).
 */
function initDefaultTools() {
  if (toolRegistry.size > 0) return;

  toolRegistry.register(new GetAccountEventsTool());
  toolRegistry.register(new GetLoginHistoryTool());
  toolRegistry.register(new GetActiveSessionsTool());
  toolRegistry.register(new GetOauthAppsTool());
  toolRegistry.register(new GetSshKeysTool());
  toolRegistry.register(new GetAccessTokensTool());
  toolRegistry.register(new GetRepositoryActivityTool());
  toolRegistry.register(new GetCloudEventsTool());
  toolRegistry.register(new GetDeviceInformationTool());
  toolRegistry.register(new GetSecuritySettingsTool());
  toolRegistry.register(new GetRecoveryMethodsTool());
}

module.exports = { initDefaultTools };

