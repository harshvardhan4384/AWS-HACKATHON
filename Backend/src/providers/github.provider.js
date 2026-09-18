'use strict';

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
}

module.exports = GitHubOAuthProvider;

