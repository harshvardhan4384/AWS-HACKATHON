'use strict';

const { OAuth2Client } = require('google-auth-library');
const BaseOAuthProvider = require('./base.provider');

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const DEFAULT_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const VALID_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Google OAuth 2.0 & OpenID Connect provider adapter for Re:COVER.
 *
 * Implements Google's Web Server Application flow with:
 * - RFC 7636 PKCE (S256)
 * - Offline access (access_type=offline, prompt=consent)
 * - Cryptographic OpenID Connect ID token verification against Google JWKS
 * - Strict redirect URI pinning
 * - Token revocation
 */
class GoogleOAuthProvider extends BaseOAuthProvider {
  /**
   * @param {object} config
   * @param {string} [config.clientId] - Google Client ID
   * @param {string} [config.clientSecret] - Google Client Secret
   * @param {string} [config.redirectUri] - Authorized callback redirect URI
   */
  constructor(config = {}) {
    super('GOOGLE', config);
    this._client = null;
  }

  /**
   * Returns whether all required Google OAuth credentials are configured.
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
   * Google OAuth 2.0 supports PKCE S256.
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
   * Lazy-initializes the Google OAuth2Client.
   * @returns {OAuth2Client}
   */
  getClient() {
    if (!this.isConfigured()) {
      const err = new Error("Provider 'GOOGLE' is not configured or missing credentials");
      err.statusCode = 501;
      throw err;
    }
    if (!this._client) {
      this._client = new OAuth2Client({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        redirectUri: this.config.redirectUri,
      });
    }
    return this._client;
  }

  /**
   * Generates the Google OAuth 2.0 authorization URL.
   *
   * @param {object} params
   * @param {string} params.state - Cryptographically random state parameter
   * @param {string} [params.codeChallenge] - PKCE S256 code challenge
   * @param {string} [params.redirectUri] - Ignored; strictly uses configured redirectUri
   * @param {string[]} [params.scopes] - Scopes to request
   * @returns {string} Google authorization URL
   */
  getAuthorizationUrl({ state, codeChallenge, scopes }) {
    if (!this.isConfigured()) {
      const err = new Error("Provider 'GOOGLE' is not configured or not yet implemented");
      err.statusCode = 501;
      throw err;
    }

    const client = this.getClient();
    const effectiveScopes = scopes && scopes.length > 0 ? scopes : DEFAULT_SCOPES;

    const authUrlOptions = {
      access_type: 'offline', // Request refresh token for ongoing server-side monitoring
      prompt: 'consent', // Force consent screen to guarantee refresh token on reauth
      scope: effectiveScopes,
      state,
      redirect_uri: this.config.redirectUri,
    };

    if (codeChallenge) {
      authUrlOptions.code_challenge = codeChallenge;
      authUrlOptions.code_challenge_method = 'S256';
    }

    return client.generateAuthUrl(authUrlOptions);
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   *
   * @param {object} params
   * @param {string} params.code - Authorization code
   * @param {string} [params.codeVerifier] - PKCE code verifier
   * @returns {Promise<{
   *   accessToken: string,
   *   refreshToken?: string|null,
   *   idToken?: string|null,
   *   tokenExpiresAt?: Date|null,
   *   grantedScopes?: string|null,
   *   raw: object
   * }>}
   */
  async exchangeCodeForTokens({ code, codeVerifier }) {
    const client = this.getClient();

    const tokenOptions = {
      code,
      redirect_uri: this.config.redirectUri,
    };

    if (codeVerifier) {
      tokenOptions.codeVerifier = codeVerifier;
    }

    let tokenResponse;
    try {
      tokenResponse = await client.getToken(tokenOptions);
    } catch (err) {
      const exchangeErr = new Error(`Google token exchange failed: ${err.message}`);
      exchangeErr.statusCode = 400;
      exchangeErr.code = 'token_exchange_failure';
      throw exchangeErr;
    }

    const tokens = tokenResponse.tokens;
    if (!tokens || !tokens.access_token) {
      const err = new Error('Google token endpoint returned empty access token');
      err.statusCode = 502;
      err.code = 'token_exchange_failure';
      throw err;
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      idToken: tokens.id_token || null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      grantedScopes: tokens.scope || null,
      raw: tokens,
    };
  }

  /**
   * Validates a Google OpenID Connect ID token according to official Google OIDC requirements:
   * - Cryptographic signature verified against Google JWKS
   * - Issuer must be https://accounts.google.com or accounts.google.com
   * - Audience must equal this.config.clientId
   * - Token must not be expired
   *
   * @param {string} idToken
   * @returns {Promise<object>} Decoded and verified token payload
   */
  async verifyIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      const err = new Error('ID token is missing or empty');
      err.statusCode = 400;
      err.code = 'identity_validation_failure';
      throw err;
    }

    const client = this.getClient();

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: this.config.clientId,
      });
    } catch (err) {
      const verifyErr = new Error(`Google ID token validation failed: ${err.message}`);
      verifyErr.statusCode = 400;
      verifyErr.code = 'identity_validation_failure';
      throw verifyErr;
    }

    const payload = ticket.getPayload();
    if (!payload) {
      const err = new Error('Google ID token contains empty payload');
      err.statusCode = 400;
      err.code = 'identity_validation_failure';
      throw err;
    }

    // Explicit issuer verification
    if (!VALID_ISSUERS.includes(payload.iss)) {
      const err = new Error(`Invalid ID token issuer: expected one of ${VALID_ISSUERS.join(', ')}, got '${payload.iss}'`);
      err.statusCode = 400;
      err.code = 'identity_validation_failure';
      throw err;
    }

    // Explicit audience verification
    if (payload.aud !== this.config.clientId) {
      const err = new Error(`Invalid ID token audience: expected '${this.config.clientId}', got '${payload.aud}'`);
      err.statusCode = 400;
      err.code = 'identity_validation_failure';
      throw err;
    }

    // Explicit expiration verification
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      const err = new Error('Google ID token is expired');
      err.statusCode = 400;
      err.code = 'identity_validation_failure';
      throw err;
    }

    if (!payload.sub) {
      const err = new Error('Google ID token is missing permanent subject identifier (sub)');
      err.statusCode = 400;
      err.code = 'identity_validation_failure';
      throw err;
    }

    return payload;
  }

  /**
   * Obtains the Google account identity.
   * Prefers verified OpenID Connect ID token claims, falling back to userinfo endpoint if needed.
   *
   * @param {string} accessToken
   * @param {string} [idToken]
   * @returns {Promise<{
   *   providerAccountId: string,
   *   displayName: string|null,
   *   email: string|null,
   *   raw: object
   * }>}
   */
  async getUserProfile(accessToken, idToken = null) {
    if (idToken) {
      const idPayload = await this.verifyIdToken(idToken);
      return {
        providerAccountId: String(idPayload.sub),
        displayName: idPayload.name || idPayload.email || null,
        email: idPayload.email || null,
        raw: {
          sub: idPayload.sub,
          email: idPayload.email,
          name: idPayload.name,
          picture: idPayload.picture,
          email_verified: idPayload.email_verified,
        },
      };
    }

    // Fallback: Query official OIDC userinfo endpoint with Bearer access token
    const client = this.getClient();
    let res;
    try {
      res = await client.request({
        url: GOOGLE_USERINFO_ENDPOINT,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      const profileErr = new Error(`Failed to fetch Google user profile: ${err.message}`);
      profileErr.statusCode = 502;
      profileErr.code = 'identity_validation_failure';
      throw profileErr;
    }

    const data = res.data;
    if (!data || !data.sub) {
      const err = new Error('Google userinfo response did not contain stable subject identifier');
      err.statusCode = 502;
      err.code = 'identity_validation_failure';
      throw err;
    }

    return {
      providerAccountId: String(data.sub),
      displayName: data.name || data.email || null,
      email: data.email || null,
      raw: data,
    };
  }

  /**
   * Revokes an OAuth token (access or refresh) with Google's revocation endpoint.
   *
   * @param {string} token - Token to revoke
   * @returns {Promise<{ success: boolean, raw?: object }>}
   */
  async revokeToken(token) {
    const client = this.getClient();
    try {
      const result = await client.revokeToken(token);
      return { success: true, raw: result.data };
    } catch (err) {
      const revokeErr = new Error(`Google token revocation failed: ${err.message}`);
      revokeErr.statusCode = err.response?.status || 500;
      throw revokeErr;
    }
  }
}

module.exports = GoogleOAuthProvider;

