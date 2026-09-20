'use strict';

/**
 * Base abstract class for OAuth 2.0 / Provider integrations in Re:COVER.
 *
 * Specific providers (GoogleOAuthProvider, GitHubOAuthProvider, etc.) will extend
 * this class and implement the provider-specific endpoints and protocols.
 */
class BaseOAuthProvider {
  /**
   * @param {string} name - Provider identifier (e.g. 'GOOGLE', 'GITHUB', 'AWS')
   * @param {object} [config={}] - Provider configuration (client ID, client secret, scopes, etc.)
   */
  constructor(name, config = {}) {
    if (new.target === BaseOAuthProvider) {
      throw new TypeError('Cannot construct BaseOAuthProvider instances directly. Subclass it.');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name is required');
    }
    this.name = name.toUpperCase();
    this.config = config;
  }

  /**
   * Returns whether this provider has all required configuration (e.g. client ID, client secret).
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }

  /**
   * Returns whether this provider supports / requires PKCE (RFC 7636).
   * @returns {boolean}
   */
  supportsPkce() {
    return false;
  }

  /**
   * Builds the provider's authorization redirect URL.
   *
   * @param {object} params
   * @param {string} params.state - Cryptographically random state parameter
   * @param {string} [params.codeChallenge] - PKCE S256 code challenge (if supported)
   * @param {string} params.redirectUri - Callback redirect URI
   * @param {string[]} [params.scopes] - Optional override scopes
   * @returns {Promise<string>|string} Full authorization URL
   */
  getAuthorizationUrl(/* params */) {
    throw new Error(`Provider '${this.name}' does not implement getAuthorizationUrl()`);
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   *
   * @param {object} params
   * @param {string} params.code - Authorization code from provider callback
   * @param {string} [params.codeVerifier] - PKCE code verifier (if PKCE was used)
   * @param {string} params.redirectUri - The same redirect URI used in authorization request
   * @returns {Promise<{
   *   accessToken: string,
   *   refreshToken?: string|null,
   *   tokenExpiresAt?: Date|null,
   *   grantedScopes?: string|null,
   *   raw?: object
   * }>}
   */
  async exchangeCodeForTokens(/* params */) {
    throw new Error(`Provider '${this.name}' does not implement exchangeCodeForTokens()`);
  }

  /**
   * Fetches the user identity / account profile using the access token.
   *
   * @param {string} accessToken - Decrypted access token
   * @returns {Promise<{
   *   providerAccountId: string,
   *   displayName?: string|null,
   *   email?: string|null,
   *   raw?: object
   * }>}
   */
  async getUserProfile(/* accessToken */) {
    throw new Error(`Provider '${this.name}' does not implement getUserProfile()`);
  }

  /**
   * Revokes an access or refresh token with the provider.
   *
   * @param {string} token - Token to revoke
   * @param {string} [tokenTypeHint] - 'access_token' or 'refresh_token'
   * @returns {Promise<{ success: boolean, raw?: object }>}
   */
  async revokeToken(/* token, tokenTypeHint */) {
    throw new Error(`Provider '${this.name}' does not implement revokeToken()`);
  }

  /**
   * Refreshes an expired access token using a refresh token.
   *
   * @param {string} refreshToken - Decrypted refresh token
   * @returns {Promise<{
   *   accessToken: string,
   *   refreshToken?: string|null,
   *   tokenExpiresAt?: Date|null,
   *   raw?: object
   * }>}
   */
  async refreshAccessToken(/* refreshToken */) {
    throw new Error(`Provider '${this.name}' does not implement refreshAccessToken()`);
  }

  /**
   * Retrieves live or normalized security overview metrics for the provider account.
   * Providers should return honest capability statuses across:
   * AVAILABLE, NOT_SUPPORTED, NOT_AVAILABLE, ERROR, STALE.
   *
   * @param {string} accessToken - Decrypted access token
   * @param {object} [profile] - Known account profile metadata
   * @param {object} [options] - Additional query options
   * @returns {Promise<object>} Normalized security overview
   */
  async getSecurityOverview(/* accessToken, profile, options */) {
    throw new Error(`Provider '${this.name}' does not implement getSecurityOverview()`);
  }
}

module.exports = BaseOAuthProvider;

