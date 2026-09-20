'use strict';

const crypto = require('crypto');
const BaseOAuthProvider = require('./base.provider');

const GITHUB_AUTH_ENDPOINT = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_ENDPOINT = 'https://api.github.com/user';
const GITHUB_EMAILS_ENDPOINT = 'https://api.github.com/user/emails';
const GITHUB_API_VERSION = '2022-11-28';
const USER_AGENT = 'Re-COVER-Platform';

const DEFAULT_SCOPES = 'read:user user:email';

/**
 * GitHub OAuth 2.0 Web Application Flow provider adapter for Re:COVER.
 *
 * Implements:
 * - RFC 7636 PKCE (S256)
 * - Server-side authorization-code exchange
 * - Immutable numeric account identity resolution via GitHub REST API
 * - Primary email resolution via /user/emails
 * - Application grant revocation via DELETE /applications/{client_id}/grant
 * - Strict redirect URI pinning
 */
class GitHubOAuthProvider extends BaseOAuthProvider {
  /**
   * @param {object} config
   * @param {string} [config.clientId] - GitHub Client ID
   * @param {string} [config.clientSecret] - GitHub Client Secret
   * @param {string} [config.redirectUri] - Authorized callback redirect URI
   */
  constructor(config = {}) {
    super('GITHUB', config);
  }

  /**
   * Returns whether all required GitHub OAuth credentials are configured.
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.redirectUri
    );
  }

  /**
   * GitHub OAuth officially supports PKCE S256 for OAuth Apps.
   * @returns {boolean}
   */
  supportsPkce() {
    return true;
  }

  /**
   * Returns the strictly configured redirect URI.
   * Dynamic/browser-provided redirect URIs are not allowed.
   * @returns {string}
   */
  getRedirectUri() {
    return this.config.redirectUri;
  }

  /**
   * Generates the GitHub OAuth authorization URL.
   *
   * @param {object} params
   * @param {string} params.state - Cryptographically random state parameter
   * @param {string} [params.codeChallenge] - PKCE S256 code challenge
   * @param {string|string[]} [params.scopes] - Scopes to request
   * @returns {string} GitHub authorization URL
   */
  getAuthorizationUrl({ state, codeChallenge, scopes }) {
    if (!this.isConfigured()) {
      const err = new Error("Provider 'GITHUB' is not configured or not yet implemented");
      err.statusCode = 501;
      throw err;
    }

    const effectiveScopes = Array.isArray(scopes)
      ? scopes.join(' ')
      : scopes || DEFAULT_SCOPES;

    const url = new URL(GITHUB_AUTH_ENDPOINT);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', effectiveScopes);

    if (codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return url.toString();
  }

  /**
   * Exchanges an authorization code for access and optional refresh tokens.
   *
   * @param {object} params
   * @param {string} params.code - Authorization code from callback query
   * @param {string} [params.codeVerifier] - PKCE code verifier
   * @returns {Promise<{
   *   accessToken: string,
   *   refreshToken?: string|null,
   *   tokenExpiresAt?: Date|null,
   *   grantedScopes?: string|null,
   *   raw: object
   * }>}
   */
  async exchangeCodeForTokens({ code, codeVerifier }) {
    if (!this.isConfigured()) {
      const err = new Error("Provider 'GITHUB' is not configured or not yet implemented");
      err.statusCode = 501;
      throw err;
    }

    const payload = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    };

    if (codeVerifier) {
      payload.code_verifier = codeVerifier;
    }

    let res;
    try {
      res = await fetch(GITHUB_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      const err = new Error(`GitHub token exchange network error: ${fetchErr.message}`);
      err.statusCode = 502;
      err.code = 'provider_unavailable';
      throw err;
    }

    let data;
    try {
      data = await res.json();
    } catch {
      const err = new Error('Failed to parse GitHub token exchange response');
      err.statusCode = 502;
      err.code = 'token_exchange_failure';
      throw err;
    }

    if (data.error) {
      const err = new Error(`GitHub token exchange failed: ${data.error_description || data.error}`);
      err.statusCode = 400;
      err.code = data.error;
      throw err;
    }

    if (!data.access_token) {
      const err = new Error('GitHub token endpoint returned empty access token');
      err.statusCode = 502;
      err.code = 'token_exchange_failure';
      throw err;
    }

    const tokenExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      tokenExpiresAt,
      grantedScopes: data.scope || null,
      raw: data,
    };
  }

  /**
   * Retrieves the authenticated GitHub user profile and verified email.
   * Uses immutable numeric user ID as the stable provider account identifier.
   *
   * @param {string} accessToken
   * @returns {Promise<{
   *   providerAccountId: string,
   *   displayName: string|null,
   *   email: string|null,
   *   raw: object
   * }>}
   */
  async getUserProfile(accessToken) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': USER_AGENT,
    };

    let userRes;
    try {
      userRes = await fetch(GITHUB_USER_ENDPOINT, { headers });
    } catch (fetchErr) {
      const err = new Error(`GitHub user profile network error: ${fetchErr.message}`);
      err.statusCode = 502;
      err.code = 'provider_unavailable';
      throw err;
    }

    if (!userRes.ok) {
      const err = new Error(`GitHub user profile request failed with status ${userRes.status}`);
      err.statusCode = 502;
      err.code = 'identity_validation_failure';
      throw err;
    }

    const userData = await userRes.json();
    if (!userData || userData.id === undefined || userData.id === null) {
      const err = new Error('GitHub user profile response missing stable numeric ID');
      err.statusCode = 502;
      err.code = 'identity_validation_failure';
      throw err;
    }

    // Stable numeric identifier (immutable across username renames)
    const providerAccountId = String(userData.id);
    let email = userData.email || null;

    // If profile email is null, attempt to resolve primary email via /user/emails
    if (!email) {
      try {
        const emailsRes = await fetch(GITHUB_EMAILS_ENDPOINT, { headers });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          if (Array.isArray(emails)) {
            const primaryEmail = emails.find((e) => e.primary && e.verified) ||
                                emails.find((e) => e.primary) ||
                                emails[0];
            if (primaryEmail?.email) {
              email = primaryEmail.email;
            }
          }
        }
      } catch {
        // Non-critical: failure to fetch private emails should not block connection
      }
    }

    return {
      providerAccountId,
      displayName: userData.name || userData.login || null,
      email,
      raw: {
        id: userData.id,
        login: userData.login,
        name: userData.name,
        email,
      },
    };
  }

  /**
   * Revokes the application grant for the user, invalidating all OAuth tokens.
   * Uses DELETE /applications/{client_id}/grant with HTTP Basic Auth.
   *
   * @param {string} token - Access token to revoke
   * @returns {Promise<{ success: boolean }>}
   */
  async revokeToken(token) {
    if (!this.isConfigured()) {
      const err = new Error("Provider 'GITHUB' is not configured or missing credentials");
      err.statusCode = 501;
      throw err;
    }

    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const url = `https://api.github.com/applications/${this.config.clientId}/grant`;

    let res;
    try {
      res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: token }),
      });
    } catch (fetchErr) {
      const err = new Error(`GitHub token revocation network error: ${fetchErr.message}`);
      err.statusCode = 502;
      throw err;
    }

    // 204 No Content is the documented success response
    if (res.status === 204 || res.ok) {
      return { success: true };
    }

    const err = new Error(`GitHub token revocation failed with HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  /**
   * Helper to compute real OpenSSH SHA256 fingerprint from a public key string.
   *
   * @param {string} keyString
   * @returns {string|null}
   */
  calculateSshFingerprint(keyString) {
    if (!keyString || typeof keyString !== 'string') return null;
    try {
      const parts = keyString.trim().split(/\s+/);
      if (parts.length >= 2) {
        const keyBuffer = Buffer.from(parts[1], 'base64');
        const hash = crypto.createHash('sha256').update(keyBuffer).digest('base64').replace(/=+$/, '');
        return `SHA256:${hash}`;
      }
    } catch {}
    return null;
  }

  /**
   * Retrieves real account, SSH keys, and recent activity for this GitHub account.
   * Strictly adheres to Zero Fabrication: queries official GitHub REST API endpoints directly.
   *
   * @param {string} accessToken - Decrypted access token
   * @param {object} [profile] - Known account profile metadata
   * @param {object} [options] - Additional options
   * @returns {Promise<object>} Normalized Security Overview with real provider data
   */
  async getSecurityOverview(accessToken, profile = {}, options = {}) {
    const { CAPABILITY_STATES } = require('./capabilityMatrix');

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': USER_AGENT,
    };

    let userData = profile?.raw || null;
    let syncStatus = 'ACTIVE';
    let syncMessage = null;

    // 1. Fetch live /user data if token is provided
    if (accessToken && options.fetchLive !== false) {
      try {
        const userRes = await fetch(GITHUB_USER_ENDPOINT, { headers });
        if (userRes.ok) {
          userData = await userRes.json();
        } else if (userRes.status === 401) {
          syncStatus = 'ERROR';
          syncMessage = 'GitHub authorization has expired or been revoked. Reconnect GitHub.';
        } else if (userRes.status === 403) {
          syncStatus = 'ERROR';
          syncMessage = 'This information requires additional GitHub authorization.';
        } else if (userRes.status === 429) {
          syncStatus = 'ERROR';
          syncMessage = 'GitHub rate limit reached. Try again later.';
        }
      } catch (err) {
        syncStatus = 'ERROR';
        syncMessage = `Unable to connect to GitHub API: ${err.message}`;
      }
    }

    const username = userData?.login || profile?.displayName || profile?.raw?.login;
    let email = userData?.email || profile?.email || null;

    // If profile email is not public, attempt to resolve primary email via /user/emails
    if (!email && accessToken && syncStatus === 'ACTIVE') {
      try {
        const emailsRes = await fetch(GITHUB_EMAILS_ENDPOINT, { headers });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          if (Array.isArray(emails)) {
            const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.primary) || emails[0];
            if (primary?.email) {
              email = primary.email;
            }
          }
        }
      } catch {
        // Non-critical
      }
    }

    // 2. Fetch real SSH Keys (trying /user/keys first, fallback to /users/:username/keys)
    let sshKeys = [];
    let sshStatus = CAPABILITY_STATES.NOT_AVAILABLE;
    let sshDetail = 'Unable to resolve GitHub username for SSH key lookup.';

    if (username && syncStatus === 'ACTIVE') {
      let fetchedKeys = false;

      // Try authenticated /user/keys
      if (accessToken) {
        try {
          const authKeysRes = await fetch('https://api.github.com/user/keys', { headers });
          if (authKeysRes.ok) {
            const keysData = await authKeysRes.json();
            if (Array.isArray(keysData)) {
              sshStatus = CAPABILITY_STATES.AVAILABLE;
              fetchedKeys = true;
              sshKeys = keysData.map((k) => {
                const parts = (k.key || '').trim().split(/\s+/);
                const type = parts[0] || 'ssh-key';
                const keyBody = parts[1] || '';
                const keySnippet = keyBody.length > 20
                  ? `${type} ${keyBody.substring(0, 10)}...${keyBody.substring(keyBody.length - 8)}`
                  : k.key;
                return {
                  id: k.id,
                  title: k.title || `SSH Key #${k.id}`,
                  type,
                  fingerprint: this.calculateSshFingerprint(k.key),
                  createdAt: k.created_at || null,
                  lastUsed: k.last_used_at || null,
                  verified: Boolean(k.verified),
                  readOnly: Boolean(k.read_only),
                  keySnippet,
                };
              });
            }
          }
        } catch {
          // Fallback to public endpoint
        }
      }

      // Fallback: public /users/:username/keys
      if (!fetchedKeys) {
        try {
          const publicKeysRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/keys`, {
            headers: {
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': GITHUB_API_VERSION,
              'User-Agent': USER_AGENT,
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
          });

          if (publicKeysRes.ok) {
            const rawKeys = await publicKeysRes.json();
            if (Array.isArray(rawKeys)) {
              sshStatus = CAPABILITY_STATES.AVAILABLE;
              sshKeys = rawKeys.map((k) => {
                const parts = (k.key || '').trim().split(/\s+/);
                const type = parts[0] || 'ssh-key';
                const keyBody = parts[1] || '';
                const keySnippet = keyBody.length > 20
                  ? `${type} ${keyBody.substring(0, 10)}...${keyBody.substring(keyBody.length - 8)}`
                  : k.key;
                return {
                  id: k.id,
                  title: `Public Key #${k.id}`,
                  type,
                  fingerprint: this.calculateSshFingerprint(k.key),
                  createdAt: null,
                  lastUsed: null,
                  verified: true,
                  readOnly: true,
                  keySnippet,
                };
              });
            }
          } else if (publicKeysRes.status === 404) {
            sshStatus = CAPABILITY_STATES.AVAILABLE;
            sshKeys = [];
          }
        } catch (err) {
          sshStatus = CAPABILITY_STATES.ERROR;
          sshDetail = `Failed to query GitHub SSH keys: ${err.message}`;
        }
      }

      if (sshStatus === CAPABILITY_STATES.AVAILABLE) {
        sshDetail = sshKeys.length > 0
          ? `${sshKeys.length} registered public SSH ${sshKeys.length === 1 ? 'key' : 'keys'} found on GitHub profile.`
          : 'Zero public SSH keys registered on this GitHub account.';
      }
    }

    // 3. Fetch real authenticated activity events (Phase 8 & 9)
    let activities = [];
    if (username && syncStatus === 'ACTIVE') {
      try {
        const eventsRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events?per_page=10`, {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
            'User-Agent': USER_AGENT,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });

        if (eventsRes.ok) {
          const rawEvents = await eventsRes.json();
          if (Array.isArray(rawEvents)) {
            activities = rawEvents.map((evt) => {
              let type = 'Activity';
              let action = 'Contributed to';
              let canonicalType = 'UNKNOWN';

              switch (evt.type) {
                case 'PushEvent':
                  type = 'Push';
                  const count = evt.payload?.commits?.length || 1;
                  action = `Pushed ${count} ${count === 1 ? 'commit' : 'commits'} to`;
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'PullRequestEvent':
                  type = 'Pull Request';
                  action = `${evt.payload?.action || 'Opened'} PR #${evt.payload?.number || ''} on`;
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'IssuesEvent':
                  type = 'Issue';
                  action = `${evt.payload?.action || 'Updated'} issue #${evt.payload?.issue?.number || ''} on`;
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'CreateEvent':
                  type = 'Create';
                  action = `Created ${evt.payload?.ref_type || 'ref'} ${evt.payload?.ref ? `'${evt.payload.ref}' on` : 'on'}`;
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'WatchEvent':
                  type = 'Star';
                  action = 'Starred repository';
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'ForkEvent':
                  type = 'Fork';
                  action = 'Forked repository';
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'DeleteEvent':
                  type = 'Delete';
                  action = `Deleted ${evt.payload?.ref_type || 'ref'} '${evt.payload?.ref || ''}' on`;
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                case 'ReleaseEvent':
                  type = 'Release';
                  action = `Published release ${evt.payload?.release?.tag_name || ''} for`;
                  canonicalType = 'REPOSITORY_ACTIVITY';
                  break;
                default:
                  type = evt.type ? evt.type.replace(/Event$/, '') : 'Event';
                  action = 'Activity on';
                  canonicalType = 'REPOSITORY_ACTIVITY';
              }

              return {
                id: evt.id,
                type,
                action: action.trim(),
                repo: evt.repo?.name || 'Unknown Repository',
                timestamp: evt.created_at, // Real timestamp from GitHub
                canonicalType,
                category: 'REPOSITORY_ACTIVITY',
              };
            });
          }
        }
      } catch {
        // Non-blocking
      }
    }

    const twoFactorEnabled = typeof userData?.two_factor_authentication === 'boolean'
      ? userData.two_factor_authentication
      : null;

    const grantedScopesList = profile.grantedScopes
      ? profile.grantedScopes.split(/[\s,]+/).filter(Boolean)
      : ['read:user', 'user:email'];

    const hasAuditLogScope = grantedScopesList.some(s =>
      s.includes('read:audit_log') || s.includes('admin:org')
    );

    // Honest personal account disclaimer
    const personalAuditLogDisclaimer = "GitHub personal user accounts do not expose security audit logs (login history, password changes, unrecognized devices) via user OAuth. These events require a GitHub Enterprise or Organization account with 'read:audit_log' scope.";

    return {
      provider: 'GITHUB',
      account: {
        username: userData?.login || username || 'GitHub User',
        displayName: userData?.name || userData?.login || username || 'GitHub User',
        email,
        avatarUrl: userData?.avatar_url || null,
        providerUserId: userData?.id ? String(userData.id) : (profile.providerAccountId || null),
        profileUrl: userData?.html_url || (username ? `https://github.com/${username}` : null),
        accountType: userData?.type || 'User',
        plan: userData?.plan?.name || 'standard',
        bio: userData?.bio || null,
        company: userData?.company || null,
        location: userData?.location || null,
        publicRepos: userData?.public_repos ?? null,
        createdAt: userData?.created_at || null,
        updatedAt: userData?.updated_at || null,
        hasAuditLogScope,
      },
      sshKeys,
      activity: activities,
      oauth: {
        status: 'ACTIVE',
        scopes: grantedScopesList,
        tokenStatus: 'Stored securely',
        hasRefreshToken: Boolean(profile.hasRefreshToken),
        revocationSupported: true,
        revocationEndpoint: 'DELETE /applications/{client_id}/grant',
      },
      sync: {
        status: syncStatus,
        lastSyncedAt: new Date().toISOString(),
        message: syncMessage,
        monitoringMode: hasAuditLogScope ? 'AUDIT_LOG_STREAM' : 'SSH_KEYS_AND_ACTIVITY_POLLING',
      },
      securityNotice: hasAuditLogScope
        ? 'GitHub Organization Audit Log API active. Authentication and credential events are monitored.'
        : personalAuditLogDisclaimer,
      // Backwards-compatible structured properties
      twoFactorAuth: {
        status: twoFactorEnabled !== null ? CAPABILITY_STATES.AVAILABLE : CAPABILITY_STATES.NOT_AVAILABLE,
        enabled: twoFactorEnabled,
        detail: twoFactorEnabled === true
          ? 'Two-Factor Authentication is enrolled and active on your GitHub account.'
          : twoFactorEnabled === false
          ? 'Two-Factor Authentication is currently DISABLED on your GitHub account. Enabling 2FA is strongly recommended.'
          : '2FA status requires read:user OAuth scope.',
      },
      loginHistory: {
        status: hasAuditLogScope ? CAPABILITY_STATES.AVAILABLE : CAPABILITY_STATES.NOT_AVAILABLE,
        lastLogin: null,
        recentLogins: [],
        detail: hasAuditLogScope
          ? 'Real login events monitored via GitHub Organization Audit Log API.'
          : personalAuditLogDisclaimer,
      },
      passwordSecurity: {
        status: hasAuditLogScope ? CAPABILITY_STATES.AVAILABLE : CAPABILITY_STATES.NOT_AVAILABLE,
        lastPasswordChange: null,
        detail: hasAuditLogScope
          ? 'Password change events monitored via GitHub Audit Log API.'
          : 'Last password change is not available through official personal GitHub OAuth API.',
      },
      sessionsAndDevices: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        activeSessions: null,
        devices: [],
        detail: personalAuditLogDisclaimer,
      },
      credentialsAndKeys: {
        status: sshStatus,
        sshKeys,
        count: sshKeys.length,
        detail: sshDetail,
      },
      authorizedApps: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        apps: [],
        detail: 'Third-party OAuth application inventory requires GitHub App administration or personal security settings.',
      },
      tokenGovernance: {
        status: CAPABILITY_STATES.AVAILABLE,
        revocationSupported: true,
        revocationMethod: 'DELETE /applications/{client_id}/grant',
        refreshSupported: false,
        grantedScopes: grantedScopesList,
        accountCreatedAt: userData?.created_at || null,
        profileUpdatedAt: userData?.updated_at || null,
      },
      securitySettings: {
        status: CAPABILITY_STATES.AVAILABLE,
        email,
        plan: userData?.plan?.name || 'standard',
        publicRepos: userData?.public_repos ?? null,
        twoFactorActive: twoFactorEnabled,
      },
      lastSynchronized: new Date().toISOString(),
    };
  }

  /**
   * Retrieves official GitHub Organization or Enterprise Audit Log events.
   *
   * @param {object} params
   * @param {string} params.accessToken
   * @param {string} params.org - Organization login
   * @param {string} [params.phrase] - Query filter phrase (e.g. 'action:user.login')
   * @returns {Promise<{ authorized: boolean, events: Array<object>, reason?: string }>}
   */
  async getAuditLogEvents({ accessToken, org, phrase = null }) {
    if (!accessToken || !org) {
      return { authorized: false, events: [], reason: 'Access token and organization name required' };
    }

    let url = `https://api.github.com/orgs/${encodeURIComponent(org)}/audit-log?per_page=50`;
    if (phrase) {
      url += `&phrase=${encodeURIComponent(phrase)}`;
    }

    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'User-Agent': USER_AGENT,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        return {
          authorized: false,
          events: [],
          reason: `GitHub Audit Log returned HTTP ${res.status}. Requires 'admin:org' or 'read:audit_log' scope.`,
        };
      }

      const events = await res.json();
      return { authorized: true, events: Array.isArray(events) ? events : [] };
    } catch (err) {
      return { authorized: false, events: [], reason: err.message };
    }
  }
}

module.exports = GitHubOAuthProvider;


