'use strict';

const config = require('../config/env');
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
 * Handles OAuth callback from provider and redirects browser to Re:COVER frontend.
 */
async function callback(req, res, next) {
  const { provider } = req.params;
  const normalizedProvider = (provider || 'oauth').toLowerCase();
  const frontendBase = (config.frontendUrl || config.clientUrl || 'http://localhost:5173').replace(/\/+$/, '');
  const wantsJson = req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));

  try {
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

      let safeReason = 'connection_failed';
      if (error === 'access_denied') {
        safeReason = 'authorization_denied';
      } else {
        safeReason = `${normalizedProvider}_auth_failed`;
      }

      if (wantsJson) {
        return res.status(400).json({
          success: false,
          error: {
            message: errorDescription || `OAuth provider returned error: ${error}`,
            code: safeReason,
          },
        });
      }

      return res.redirect(`${frontendBase}/accounts?oauth=error&provider=${normalizedProvider}&reason=${safeReason}`);
    }

    const connectedAccount = await oauthService.handleCallback({
      userId: req.user.id,
      providerName: provider,
      code,
      state,
    });

    if (wantsJson) {
      return res.json({
        success: true,
        data: { connectedAccount },
      });
    }

    // Success: Redirect browser to frontend connected accounts page
    return res.redirect(`${frontendBase}/accounts?oauth=success&provider=${normalizedProvider}`);
  } catch (err) {
    // Map errors to safe, allowlisted reason codes — zero leakage of stack traces or internal paths
    let safeReason = 'connection_failed';
    if (err.statusCode === 409 || err.code === 'duplicate_account') {
      safeReason = 'account_already_linked';
    } else if (
      err.code === 'state_mismatch' ||
      err.code === 'state_expired' ||
      err.code === 'state_replay' ||
      err.code === 'user_mismatch' ||
      err.code === 'missing_state' ||
      err.code === 'missing_code'
    ) {
      safeReason = 'state_invalid';
    } else if (err.code === 'identity_validation_failure' || err.code === 'token_exchange_failure') {
      safeReason = 'provider_error';
    }

    if (wantsJson) {
      return next(err);
    }

    return res.redirect(`${frontendBase}/accounts?oauth=error&provider=${normalizedProvider}&reason=${safeReason}`);
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

/**
 * GET /api/oauth/connected/:id/security-overview
 * Returns normalized security overview for a specific connected account.
 */
async function getSecurityOverview(req, res, next) {
  try {
    const { id } = req.params;
    const { refresh } = req.query;
    const result = await oauthService.getAccountSecurityOverview({
      userId: req.user.id,
      connectedAccountId: id,
      refresh: refresh === 'true',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oauth/security-overview
 * Returns aggregated overview across all connected accounts.
 */
async function getAggregatedOverview(req, res, next) {
  try {
    const result = await oauthService.getAggregatedSecurityOverview(req.user.id);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/oauth/connected/:id/sync
 * Manually triggers incremental security synchronization.
 */
async function sync(req, res, next) {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    const result = await oauthService.syncConnectedAccount(req.user.id, id, { forceFullSync: force });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/oauth/webhooks/google-reports
 * Webhook receiver for Google Workspace Reports push notifications.
 */
async function googleReportsWebhook(req, res, next) {
  try {
    const { accountSecurityMonitor } = require('../services/accountSecurityMonitor.service');
    const result = await accountSecurityMonitor.handleGoogleReportsWebhook(req.headers, req.body);
    res.json({
      success: true,
      data: result,
    });
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
  getSecurityOverview,
  getAggregatedOverview,
  sync,
  googleReportsWebhook,
};


