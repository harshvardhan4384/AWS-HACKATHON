'use strict';

const config = require('../config/env');
const pkceService = require('./pkce.service');
const tokenEncryptionService = require('./tokenEncryption.service');
const oauthStateRepository = require('../repositories/oauthState.repository');
const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { providerRegistry } = require('../providers/provider.registry');

const ALLOWED_PROVIDERS = ['GOOGLE', 'GITHUB', 'AWS'];

/**
 * Validates provider name and retrieves configured provider adapter.
 * Throws 400 for unknown provider names, 501 for unconfigured/unimplemented providers.
 *
 * @param {string} providerName
 * @returns {import('../providers/base.provider')}
 */
function resolveProvider(providerName) {
  if (!providerName || typeof providerName !== 'string') {
    const err = new Error('Provider parameter is required');
    err.statusCode = 400;
    throw err;
  }

  const normalized = providerName.toUpperCase();
  if (!ALLOWED_PROVIDERS.includes(normalized)) {
    const err = new Error(`Unsupported provider: '${providerName}'. Supported providers are: ${ALLOWED_PROVIDERS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const provider = providerRegistry.get(normalized);
  if (!provider || !provider.isConfigured()) {
    const err = new Error(`Provider '${normalized}' is not configured or not yet implemented`);
    err.statusCode = 501;
    throw err;
  }

  return provider;
}

/**
 * Initiates an OAuth 2.0 authorization flow for a Re:COVER user.
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated Re:COVER user ID
 * @param {string} params.providerName - 'GOOGLE' | 'GITHUB' | 'AWS'
 * @param {string} [params.redirectUri] - Optional override callback redirect URI (ignored for Google)
 * @param {string[]} [params.scopes] - Optional override scopes
 * @returns {Promise<{ authorizationUrl: string }>}
 */
async function startAuthorization({ userId, providerName, redirectUri, scopes }) {
  const provider = resolveProvider(providerName);
  const normalizedProvider = provider.name;

  // Use provider-pinned redirect URI if defined (e.g. Google), otherwise default server URL
  const effectiveRedirectUri =
    typeof provider.getRedirectUri === 'function' && provider.getRedirectUri()
      ? provider.getRedirectUri()
      : redirectUri || `${config.serverUrl}/api/oauth/${normalizedProvider.toLowerCase()}/callback`;

  // Generate cryptographically random state and its SHA-256 hash
  const rawState = pkceService.generateState();
  const stateHash = pkceService.hashState(rawState);

  // PKCE S256 if supported by provider
  let codeVerifier = null;
  let codeChallenge = null;
  if (provider.supportsPkce()) {
    codeVerifier = pkceService.generateCodeVerifier();
    codeChallenge = pkceService.generateCodeChallenge(codeVerifier);
  }

  const expiresAt = new Date(Date.now() + config.oauthStateTtlMinutes * 60 * 1000).toISOString();

  // Persist state in PostgreSQL
  await oauthStateRepository.create({
    userId,
    provider: normalizedProvider,
    stateHash,
    codeVerifier,
    expiresAt,
  });

  // Non-blocking cleanup of expired states
  oauthStateRepository.deleteExpired().catch(() => {});

  // Audit log: OAuth connection started
  await auditLogRepository.create({
    userId,
    actorType: 'USER',
    actorId: userId,
    actionType: 'OAUTH_CONNECTION_STARTED',
    targetType: 'provider',
    targetId: normalizedProvider,
    result: 'SUCCESS',
    metadata: {
      provider: normalizedProvider,
    },
  }).catch(() => {});

  // Build provider consent URL
  const authorizationUrl = await provider.getAuthorizationUrl({
    state: rawState,
    codeChallenge,
    redirectUri: effectiveRedirectUri,
    scopes,
  });

  return { authorizationUrl };
}

/**
 * Handles the OAuth 2.0 provider callback, verifies state and PKCE, exchanges code for tokens,
 * encrypts tokens with AES-256-GCM, prevents cross-user takeover, and upserts the connected account.
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated Re:COVER user ID
 * @param {string} params.providerName - 'GOOGLE' | 'GITHUB' | 'AWS'
 * @param {string} params.code - Authorization code from callback query
 * @param {string} params.state - Raw state string from callback query
 * @param {string} [params.redirectUri] - The same redirect URI used in startAuthorization
 * @returns {Promise<object>} Sanitized connected account representation
 */
async function handleCallback({ userId, providerName, code, state, redirectUri }) {
  const provider = resolveProvider(providerName);
  const normalizedProvider = provider.name;

  if (!code || typeof code !== 'string') {
    const err = new Error('Missing authorization code in callback query');
    err.statusCode = 400;
    err.code = 'missing_code';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }
  if (!state || typeof state !== 'string') {
    const err = new Error('Missing state parameter in callback query');
    err.statusCode = 400;
    err.code = 'missing_state';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  // Look up state by hash
  const stateHash = pkceService.hashState(state);
  const oauthState = await oauthStateRepository.findByStateHash(stateHash);

  if (!oauthState) {
    const err = new Error('Invalid or expired OAuth state');
    err.statusCode = 400;
    err.code = 'state_mismatch';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  if (oauthState.usedAt) {
    const err = new Error('OAuth state has already been used');
    err.statusCode = 400;
    err.code = 'state_replay';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  if (new Date(oauthState.expiresAt).getTime() < Date.now()) {
    const err = new Error('OAuth state has expired');
    err.statusCode = 400;
    err.code = 'state_expired';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  if (oauthState.userId !== userId) {
    const err = new Error('OAuth state does not belong to the current authenticated user');
    err.statusCode = 403;
    err.code = 'user_mismatch';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  if (oauthState.provider !== normalizedProvider) {
    const err = new Error('OAuth state provider mismatch');
    err.statusCode = 400;
    err.code = 'provider_mismatch';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  // Enforce single-use: mark as used immediately before token exchange
  await oauthStateRepository.markUsed(oauthState.id);

  const effectiveRedirectUri =
    typeof provider.getRedirectUri === 'function' && provider.getRedirectUri()
      ? provider.getRedirectUri()
      : redirectUri || `${config.serverUrl}/api/oauth/${normalizedProvider.toLowerCase()}/callback`;

  // Exchange authorization code for tokens
  let tokenResponse;
  try {
    tokenResponse = await provider.exchangeCodeForTokens({
      code,
      codeVerifier: oauthState.codeVerifier,
      redirectUri: effectiveRedirectUri,
    });
  } catch (err) {
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  // Fetch provider user identity (utilizing verified ID token where available)
  let profile;
  try {
    profile = await provider.getUserProfile(tokenResponse.accessToken, tokenResponse.idToken);
  } catch (err) {
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  if (!profile || !profile.providerAccountId) {
    const err = new Error('Failed to obtain provider account identifier');
    err.statusCode = 502;
    err.code = 'identity_validation_failure';
    await logCallbackFailure(userId, normalizedProvider, err);
    throw err;
  }

  const providerAccountId = String(profile.providerAccountId);

  // Security: Check for cross-user account takeover
  const existingOwner = await connectedAccountRepository.findByProviderAndAccountId(
    normalizedProvider,
    providerAccountId
  );

  if (existingOwner && existingOwner.userId !== userId) {
    const conflictErr = new Error('This Google account is already linked to another Re:COVER user.');
    conflictErr.statusCode = 409;
    conflictErr.code = 'duplicate_account';

    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: 'OAUTH_ACCOUNT_ALREADY_LINKED',
      targetType: 'connected_account',
      targetId: existingOwner.id,
      result: 'FAILURE',
      metadata: {
        provider: normalizedProvider,
        providerAccountId,
        message: 'Attempted to link a provider account already associated with another user',
      },
    }).catch(() => {});

    throw conflictErr;
  }

  // Encrypt tokens using AES-256-GCM — never store plaintext!
  const accessTokenCiphertext = tokenEncryptionService.encrypt(tokenResponse.accessToken);
  const refreshTokenCiphertext = tokenResponse.refreshToken
    ? tokenEncryptionService.encrypt(tokenResponse.refreshToken)
    : null;

  const tokenExpiresAt = tokenResponse.tokenExpiresAt
    ? new Date(tokenResponse.tokenExpiresAt).toISOString()
    : null;

  // Persist / update connected account (preserves existing refresh token if new one is omitted)
  const connectedAccount = await connectedAccountRepository.upsertConnectedAccount({
    userId,
    provider: normalizedProvider,
    providerAccountId,
    providerDisplayName: profile.displayName || profile.email || null,
    status: 'ACTIVE',
    grantedScopes: tokenResponse.grantedScopes || null,
    accessTokenCiphertext,
    refreshTokenCiphertext,
    tokenExpiresAt,
  });

  // Audit log: OAuth connection succeeded
  await auditLogRepository.create({
    userId,
    actorType: 'USER',
    actorId: userId,
    actionType: 'OAUTH_CONNECTION_SUCCEEDED',
    targetType: 'connected_account',
    targetId: connectedAccount.id,
    result: 'SUCCESS',
    metadata: {
      provider: normalizedProvider,
      providerAccountId,
      hasRefreshToken: Boolean(tokenResponse.refreshToken),
      grantedScopes: connectedAccount.grantedScopes,
    },
  }).catch(() => {});

  // Return strictly sanitized result (NEVER include ciphertexts or tokens)
  return {
    id: connectedAccount.id,
    provider: connectedAccount.provider,
    providerAccountId: connectedAccount.providerAccountId,
    providerDisplayName: connectedAccount.providerDisplayName,
    status: connectedAccount.status,
    grantedScopes: connectedAccount.grantedScopes,
    tokenExpiresAt: connectedAccount.tokenExpiresAt,
    createdAt: connectedAccount.createdAt,
    updatedAt: connectedAccount.updatedAt,
  };
}

/**
 * Helper to log OAuth callback failures to AuditLog without leaking secrets.
 */
async function logCallbackFailure(userId, providerName, err) {
  await auditLogRepository.create({
    userId,
    actorType: 'USER',
    actorId: userId,
    actionType: 'OAUTH_CONNECTION_FAILED',
    targetType: 'provider',
    targetId: providerName,
    result: 'FAILURE',
    metadata: {
      provider: providerName,
      error: err.message,
      code: err.code || 'oauth_failure',
    },
  }).catch(() => {});
}

/**
 * Disconnects a provider account, revoking remote tokens if supported, and deletes local record.
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated user ID
 * @param {string} params.connectedAccountId - ID of ConnectedAccount record
 * @returns {Promise<{ success: boolean, message: string, remoteRevocationResult: string }>}
 */
async function disconnectAccount({ userId, connectedAccountId }) {
  if (!connectedAccountId) {
    const err = new Error('Connected account ID is required');
    err.statusCode = 400;
    throw err;
  }

  const account = await connectedAccountRepository.findById(connectedAccountId);
  if (!account) {
    const err = new Error('Connected account not found');
    err.statusCode = 404;
    throw err;
  }

  if (account.userId !== userId) {
    const err = new Error('You do not have permission to disconnect this account');
    err.statusCode = 403;
    throw err;
  }

  // Attempt remote token revocation if provider is registered and configured
  let remoteRevocationResult = 'SKIPPED';
  const provider = providerRegistry.get(account.provider);
  if (provider && provider.isConfigured() && account.accessTokenCiphertext) {
    try {
      const accessToken = tokenEncryptionService.decrypt(account.accessTokenCiphertext);
      await provider.revokeToken(accessToken, 'access_token');
      remoteRevocationResult = 'SUCCESS';
    } catch {
      // Remote revocation failure does not block local disconnection
      remoteRevocationResult = 'FAILED';
    }
  }

  // Delete local connection
  await connectedAccountRepository.deleteById(connectedAccountId);

  // Audit log: Disconnect
  await auditLogRepository.create({
    userId,
    actorType: 'USER',
    actorId: userId,
    actionType: 'OAUTH_ACCOUNT_DISCONNECTED',
    targetType: 'connected_account',
    targetId: connectedAccountId,
    result: 'SUCCESS',
    metadata: {
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      remoteRevocationResult,
    },
  }).catch(() => {});

  return {
    success: true,
    message: `Connected account '${account.provider}' disconnected successfully`,
    remoteRevocationResult,
  };
}

/**
 * Lists all connected accounts for a user (safe fields only).
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
async function listConnectedAccounts(userId) {
  return await connectedAccountRepository.listByUserId(userId);
}

module.exports = {
  ALLOWED_PROVIDERS,
  resolveProvider,
  startAuthorization,
  handleCallback,
  disconnectAccount,
  listConnectedAccounts,
};
