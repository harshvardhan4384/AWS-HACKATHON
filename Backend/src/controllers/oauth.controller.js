'use strict';

const oauthService = require('../services/oauth.service');
const { providerRegistry } = require('../providers/provider.registry');

/**
 * GET /api/oauth/providers
 * Returns all supported providers and their configuration/readiness status.
 */
async function listProviders(req, res, next) {
  try {
    const registered = providerRegistry.list();
    const allProviders = oauthService.ALLOWED_PROVIDERS.map((name) => {
      const found = registered.find((p) => p.name === name);
      return {
        name,
        isConfigured: found ? found.isConfigured : false,
        supportsPkce: found ? found.supportsPkce : false,
      };
    });

    res.json({
      success: true,
      data: { providers: allProviders },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oauth/:provider/start
 * Generates OAuth state/PKCE challenge and returns the authorization URL.
 */
async function start(req, res, next) {
  try {
    const { provider } = req.params;
    const { redirectUri, scopes, redirect } = req.query;

    const result = await oauthService.startAuthorization({
      userId: req.user.id,
      providerName: provider,
      redirectUri: redirectUri || undefined,
      scopes: scopes ? scopes.split(' ') : undefined,
    });

    if (redirect === 'true') {
      return res.redirect(result.authorizationUrl);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oauth/:provider/callback
 * Handles OAuth callback from provider.
 */
async function callback(req, res, next) {
  try {
    const { provider } = req.params;
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      const auditLogRepository = require('../repositories/auditLog.repository');
      await auditLogRepository.create({
        userId: req.user.id,
        actorType: 'USER',
        actorId: req.user.id,
        actionType: 'OAUTH_CONNECTION_FAILED',
        targetType: 'provider',
        targetId: provider.toUpperCase(),
        result: 'FAILURE',
        metadata: {
          provider: provider.toUpperCase(),
          error: errorDescription || `OAuth provider returned error: ${error}`,
          code: error,
        },
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        error: {
          message: errorDescription || `OAuth provider returned error: ${error}`,
          code: error,
        },
      });
    }

    const connectedAccount = await oauthService.handleCallback({
      userId: req.user.id,
      providerName: provider,
      code,
      state,
    });

    res.json({
      success: true,
      data: { connectedAccount },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oauth/connected
 * Lists connected accounts for the authenticated user.
 */
async function listConnected(req, res, next) {
  try {
    const accounts = await oauthService.listConnectedAccounts(req.user.id);
    res.json({
      success: true,
      data: { accounts },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/oauth/connected/:id
 * Disconnects a provider account.
 */
async function disconnect(req, res, next) {
  try {
    const { id } = req.params;
    const result = await oauthService.disconnectAccount({
      userId: req.user.id,
      connectedAccountId: id,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProviders,
  start,
  callback,
  listConnected,
  disconnect,
};

