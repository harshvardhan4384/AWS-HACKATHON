'use strict';

const { z } = require('zod');
const BaseTool = require('../base.tool');
const connectedAccountRepository = require('../../../repositories/connectedAccount.repository');
const { PROVIDER_CAPABILITIES } = require('../../../providers/capabilityMatrix');

/**
 * Tool: get_recovery_methods
 * Inspects available recovery capabilities and remediation options for a connected account.
 *
 * READ-ONLY MANDATE:
 * Only discovers what recovery options are architecturally available for this provider.
 * Does NOT initiate or execute any recovery actions.
 */
class GetRecoveryMethodsTool extends BaseTool {
  constructor() {
    super({
      name: 'get_recovery_methods',
      description: 'Discovers available recovery methods and provider capabilities (token revocation, SSH key removal, session termination). Read-only capability discovery.',
      inputSchema: z.object({
        connectedAccountId: z.string().uuid().optional().describe('ID of connected account to query'),
      }),
      requiresConnectedAccount: true,
    });
  }

  async execute({ connectedAccountId }) {
    const account = await connectedAccountRepository.findById(connectedAccountId);
    if (!account) {
      throw new Error(`Connected account '${connectedAccountId}' not found`);
    }

    const providerKey = account.provider.toUpperCase();
    const capabilities = PROVIDER_CAPABILITIES[providerKey] || {};

    const availableRemediationOptions = [];

    if (capabilities.supportsTokenRevocation) {
      availableRemediationOptions.push({
        actionType: 'REVOKE_TOKEN',
        description: 'Revoke compromised OAuth or access tokens via provider API',
        requiresApproval: true,
      });
      availableRemediationOptions.push({
        actionType: 'REVOKE_OAUTH',
        description: 'Revoke third-party application OAuth authorization',
        requiresApproval: true,
      });
    }

    if (providerKey === 'GITHUB') {
      availableRemediationOptions.push({
        actionType: 'REMOVE_SSH_KEY',
        description: 'Remove newly created unauthorized SSH keys',
        requiresApproval: true,
      });
    }

    if (providerKey === 'GOOGLE' || providerKey === 'GITHUB') {
      availableRemediationOptions.push({
        actionType: 'TERMINATE_SESSION',
        description: 'Terminate active provider user sessions',
        requiresApproval: true,
      });
    }

    return {
      connectedAccountId,
      provider: account.provider,
      providerCapabilities: {
        supportsTokenRevocation: Boolean(capabilities.supportsTokenRevocation),
        supportsRefreshTokens: capabilities.supportsRefreshTokens || false,
      },
      availableRemediationOptions,
      notice: 'These remediation options are for investigation planning only. Execution requires downstream approval and policy verification.',
    };
  }
}

module.exports = GetRecoveryMethodsTool;

