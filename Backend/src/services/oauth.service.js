'use strict';

const config = require('../config/env');
const pkceService = require('./pkce.service');
const tokenEncryptionService = require('./tokenEncryption.service');
const oauthStateRepository = require('../repositories/oauthState.repository');
const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const securityEventRepository = require('../repositories/securityEvent.repository');
const { providerRegistry } = require('../providers/provider.registry');
const { CAPABILITY_STATES, PROVIDER_CAPABILITIES } = require('../providers/capabilityMatrix');
const { accountSecurityMonitor } = require('./accountSecurityMonitor.service');

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

  // Trigger initial synchronization (initialSync: true ensures historical events populate store without noisy alerts)
  accountSecurityMonitor.syncAccount(userId, connectedAccount.id, { initialSync: true }).catch(() => {});

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
    const err = new Error('Connected account ID or provider is required');
    err.statusCode = 400;
    throw err;
  }

  // 1. Find account by primary key ID or by provider name for the current user
  let account = await connectedAccountRepository.findById(connectedAccountId);

  if (!account && typeof connectedAccountId === 'string') {
    const normalized = connectedAccountId.toUpperCase();
    if (ALLOWED_PROVIDERS.includes(normalized)) {
      const userAccounts = await connectedAccountRepository.findByUserAndProvider(userId, normalized);
      if (userAccounts && userAccounts.length > 0) {
        account = userAccounts[0];
      }
    }
  }

  if (!account) {
    const err = new Error('Connected account not found');
    err.statusCode = 404;
    throw err;
  }

  // 2. Strict tenant isolation: user can only disconnect their own connected accounts
  if (account.userId !== userId) {
    const err = new Error('You do not have permission to disconnect this account');
    err.statusCode = 403;
    throw err;
  }

  // 3. Attempt remote token revocation if provider adapter supports it
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

  // 4. Delete local connection from PostgreSQL
  await connectedAccountRepository.deleteById(account.id);

  // 5. Audit log: record disconnection without leaking any secrets
  await auditLogRepository.create({
    userId,
    actorType: 'USER',
    actorId: userId,
    actionType: 'OAUTH_ACCOUNT_DISCONNECTED',
    targetType: 'connected_account',
    targetId: account.id,
    result: 'SUCCESS',
    metadata: {
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      remoteRevocationResult,
    },
  }).catch(() => {});

  const providerTitle = account.provider.charAt(0) + account.provider.slice(1).toLowerCase();

  return {
    success: true,
    message: `${providerTitle} account disconnected successfully`,
    provider: account.provider,
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

/**
 * Retrieves the comprehensive, honest Account Security Overview for a connected provider account.
 * Adheres strictly to Zero Fabrication: missing or unsupported provider capabilities
 * are explicitly marked as NOT_SUPPORTED or NOT_AVAILABLE with descriptive notices.
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated user ID
 * @param {string} params.connectedAccountId - Primary key UUID or provider name (e.g. 'GOOGLE')
 * @param {boolean} [params.refresh=false] - Force live fetch from provider
 * @returns {Promise<object>} Structured Security Overview
 */
async function getAccountSecurityOverview({ userId, connectedAccountId, refresh = false }) {
  if (!connectedAccountId) {
    const err = new Error('Connected account ID or provider is required');
    err.statusCode = 400;
    throw err;
  }

  // 1. Resolve connected account
  let account = await connectedAccountRepository.findById(connectedAccountId);

  if (!account && typeof connectedAccountId === 'string') {
    const normalized = connectedAccountId.toUpperCase();
    if (ALLOWED_PROVIDERS.includes(normalized)) {
      const userAccounts = await connectedAccountRepository.findByUserAndProvider(userId, normalized);
      if (userAccounts && userAccounts.length > 0) {
        account = userAccounts[0];
      }
    }
  }

  if (!account) {
    const err = new Error('Connected account not found');
    err.statusCode = 404;
    throw err;
  }

  // 2. Strict tenant isolation: user can only view their own security overview
  if (account.userId !== userId) {
    const err = new Error('You do not have permission to access security overview for this account');
    err.statusCode = 403;
    throw err;
  }

  // 3. Safely decrypt access token in-memory only (NEVER expose in response or logs)
  let accessToken = null;
  if (account.accessTokenCiphertext) {
    try {
      accessToken = tokenEncryptionService.decrypt(account.accessTokenCiphertext);
    } catch {
      // Decryption failure handled gracefully downstream
    }
  }

  let fallbackEmail = null;
  if (account.providerDisplayName && account.providerDisplayName.includes('@')) {
    const match = account.providerDisplayName.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match) fallbackEmail = match[1];
  }

  // 4. Query provider adapter for live/honest security capabilities
  const provider = providerRegistry.get(account.provider);
  let providerOverview = null;

  if (provider && provider.isConfigured() && typeof provider.getSecurityOverview === 'function') {
    try {
      providerOverview = await provider.getSecurityOverview(
        accessToken,
        {
          providerAccountId: account.providerAccountId,
          displayName: account.providerDisplayName,
          email: fallbackEmail,
          grantedScopes: account.grantedScopes,
        },
        { fetchLive: Boolean(refresh) }
      );
    } catch (err) {
      providerOverview = {
        provider: account.provider,
        status: CAPABILITY_STATES.ERROR,
        error: err.message,
      };
    }
  }

  // 5. Query normalized Re:COVER security events associated with this connected account
  const eventsResult = await securityEventRepository.listByUserId(userId, {
    connectedAccountId: account.id,
    limit: 10,
  }).catch(() => ({ events: [], pagination: { total: 0 } }));

  // 6. Asynchronously update lastSyncAt timestamp
  const nowIso = new Date().toISOString();
  connectedAccountRepository.updateLastSyncAt(account.id, nowIso).catch(() => {});

  const staticCapabilities = PROVIDER_CAPABILITIES[account.provider]?.securityOverview || {};

  // 7. Assemble canonical normalized response with real provider data (Phase 10)
  const normalizedAccount = {
    id: account.id,
    userId: account.userId,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    providerUserId: providerOverview?.account?.providerUserId || account.providerAccountId,
    providerDisplayName: providerOverview?.account?.displayName || account.providerDisplayName,
    username: providerOverview?.account?.username || null,
    displayName: providerOverview?.account?.displayName || account.providerDisplayName,
    email: providerOverview?.account?.email || fallbackEmail || null,
    avatarUrl: providerOverview?.account?.avatarUrl || null,
    profileUrl: providerOverview?.account?.profileUrl || null,
    accountType: providerOverview?.account?.accountType || (account.provider === 'GOOGLE' ? 'Google Account' : 'GitHub Account'),
    plan: providerOverview?.account?.plan || null,
    bio: providerOverview?.account?.bio || null,
    company: providerOverview?.account?.company || null,
    location: providerOverview?.account?.location || null,
    publicRepos: providerOverview?.account?.publicRepos ?? null,
    status: account.status,
    grantedScopes: account.grantedScopes
      ? account.grantedScopes.split(/[\s,]+/).filter(Boolean)
      : [],
    tokenExpiresAt: account.tokenExpiresAt,
    hasRefreshToken: Boolean(account.refreshTokenCiphertext),
    createdAt: account.createdAt,
    lastSyncAt: nowIso,
  };

  const normalizedOauth = {
    status: account.status,
    scopes: account.grantedScopes
      ? account.grantedScopes.split(/[\s,]+/).filter(Boolean)
      : [],
    connectedAt: account.createdAt,
    updatedAt: account.updatedAt,
    tokenExpiresAt: account.tokenExpiresAt,
    tokenExpiresInSec: providerOverview?.oauth?.tokenExpiresInSec || null,
    hasRefreshToken: Boolean(account.refreshTokenCiphertext),
    tokenStatus: 'Stored securely',
    revocationSupported: Boolean(PROVIDER_CAPABILITIES[account.provider]?.supportsTokenRevocation),
    revocationEndpoint: providerOverview?.oauth?.revocationEndpoint || null,
  };

  const normalizedSync = providerOverview?.sync || {
    status: 'ACTIVE',
    lastSyncedAt: nowIso,
    message: null,
  };

  return {
    provider: account.provider,
    account: normalizedAccount,
    sshKeys: providerOverview?.sshKeys || [],
    activity: providerOverview?.activity || [],
    oauth: normalizedOauth,
    sync: normalizedSync,
    securityNotice: providerOverview?.securityNotice || null,
    securityOverview: {
      twoFactorAuth: providerOverview?.twoFactorAuth || staticCapabilities.twoFactorAuth || {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        detail: 'Two-factor authentication telemetry is not exposed for this account.',
      },
      loginHistory: providerOverview?.loginHistory || staticCapabilities.loginHistory || {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        lastLogin: null,
        recentLogins: [],
        detail: 'Login history is not supported by this provider via OAuth API.',
      },
      passwordSecurity: providerOverview?.passwordSecurity || {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        lastPasswordChange: null,
        detail: 'Last password change telemetry is not available through the current API integration.',
      },
      sessionsAndDevices: providerOverview?.sessionsAndDevices || staticCapabilities.sessionsAndDevices || {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        activeSessions: null,
        devices: [],
        detail: 'Active device and session inventory is not exposed via user OAuth API.',
      },
      credentialsAndKeys: providerOverview?.credentialsAndKeys || staticCapabilities.credentialsAndKeys || {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        sshKeys: providerOverview?.sshKeys || [],
        detail: 'SSH keys are not applicable to this provider.',
      },
      authorizedApps: providerOverview?.authorizedApps || staticCapabilities.authorizedApps || {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        apps: [],
        detail: 'Third-party OAuth application inventory is not available.',
      },
      tokenGovernance: providerOverview?.tokenGovernance || {
        status: CAPABILITY_STATES.AVAILABLE,
        revocationSupported: Boolean(PROVIDER_CAPABILITIES[account.provider]?.supportsTokenRevocation),
        refreshSupported: Boolean(account.refreshTokenCiphertext),
        grantedScopes: account.grantedScopes
          ? account.grantedScopes.split(/[\s,]+/).filter(Boolean)
          : [],
      },
      securitySettings: providerOverview?.securitySettings || {
        status: CAPABILITY_STATES.AVAILABLE,
      },
      securityEvents: {
        status: CAPABILITY_STATES.AVAILABLE,
        totalCount: eventsResult.pagination?.total || eventsResult.events.length,
        events: eventsResult.events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          occurredAt: e.occurredAt || e.createdAt,
          severity: e.severity,
          status: e.status,
          eventData: e.eventData,
        })),
      },
      capabilities: staticCapabilities,
      lastSynchronized: nowIso,
    },
  };
}

/**
 * Returns an aggregated overview across all connected accounts for the operator.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getAggregatedSecurityOverview(userId) {
  const accounts = await connectedAccountRepository.listByUserId(userId);
  const nowIso = new Date().toISOString();

  const accountSummaries = await Promise.all(
    accounts.map(async (acc) => {
      const staticCap = PROVIDER_CAPABILITIES[acc.provider]?.securityOverview || {};
      const eventsCount = await securityEventRepository
        .listByUserId(userId, { connectedAccountId: acc.id, limit: 1 })
        .then((res) => res.pagination.total)
        .catch(() => 0);

      return {
        id: acc.id,
        provider: acc.provider,
        providerAccountId: acc.providerAccountId,
        displayName: acc.providerDisplayName,
        status: acc.status,
        lastSyncAt: acc.lastSyncAt || acc.updatedAt,
        tokenExpiresAt: acc.tokenExpiresAt,
        hasRefreshToken: Boolean(acc.refreshTokenCiphertext),
        scopesCount: acc.grantedScopes ? acc.grantedScopes.split(/[\s,]+/).filter(Boolean).length : 0,
        securityEventsCount: eventsCount,
        twoFactorStatus: staticCap.twoFactorAuth?.status || CAPABILITY_STATES.NOT_AVAILABLE,
        revocationSupported: Boolean(PROVIDER_CAPABILITIES[acc.provider]?.supportsTokenRevocation),
      };
    })
  );

  return {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter((a) => a.status === 'ACTIVE').length,
    providersEnrolled: [...new Set(accounts.map((a) => a.provider))],
    lastSynchronized: nowIso,
    accounts: accountSummaries,
  };
}

/**
 * Manually triggers an incremental security synchronization for a connected account.
 *
 * @param {string} userId
 * @param {string} connectedAccountId
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function syncConnectedAccount(userId, connectedAccountId, options = {}) {
  return await accountSecurityMonitor.syncAccount(userId, connectedAccountId, options);
}

module.exports = {
  ALLOWED_PROVIDERS,
  resolveProvider,
  startAuthorization,
  handleCallback,
  disconnectAccount,
  listConnectedAccounts,
  getAccountSecurityOverview,
  getAggregatedSecurityOverview,
  syncConnectedAccount,
};
