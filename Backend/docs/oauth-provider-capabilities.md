# OAuth Provider Capability Matrix & Architecture

This document summarizes the OAuth 2.0 / identity provider capabilities across platforms targeted by Re:COVER.

---

## 1. Provider Comparison Matrix

| Feature / Capability | Google | GitHub | AWS |
| :--- | :--- | :--- | :--- |
| **Protocol** | OAuth 2.0 + OIDC | OAuth 2.0 (Web Application Flow) | IAM / STS AssumeRole / SigV4 |
| **PKCE Support (RFC 7636)** | Yes (`S256`) | Yes (`S256`) | N/A |
| **Refresh Tokens** | Yes (`access_type=offline`) | Conditional (expiring tokens opt-in) | Temporary credentials (15m–12h) |
| **Token Revocation API** | Yes (`/revoke` endpoint) | Yes (`/applications/{client_id}/grant`) | IAM Policy / STS Revocation |
| **Authorization Endpoint** | `https://accounts.google.com/o/oauth2/v2/auth` | `https://github.com/login/oauth/authorize` | N/A (Console or AssumeRole) |
| **Token Endpoint** | `https://oauth2.googleapis.com/token` | `https://github.com/login/oauth/access_token` | `https://sts.amazonaws.com` |
| **User Info Endpoint** | `https://openidconnect.googleapis.com/v1/userinfo` | `https://api.github.com/user` & `/user/emails` | `sts:GetCallerIdentity` |
| **OAuth Implementation** | **Implemented (Task 6)** | **Implemented (Task 7)** | IAM Role Simulation |
| **Event Ingestion & Normalization** | **Implemented (Task 8 Foundation)** | **Implemented (Task 8 Foundation)** | **Implemented (Task 8 Simulated)** |

---

## 2. Re:COVER Provider Abstraction Design

### `BaseOAuthProvider`
An abstract base class located at `src/providers/base.provider.js`. It specifies the lifecycle contract:
- `isConfigured()`: boolean check on required env vars (client ID/secret).
- `supportsPkce()`: boolean indicator for PKCE S256 code challenge generation.
- `getAuthorizationUrl({ state, codeChallenge, redirectUri, scopes })`: constructs the consent URL.
- `exchangeCodeForTokens({ code, codeVerifier, redirectUri })`: completes code exchange.
- `getUserProfile(accessToken)`: returns identity details (`providerAccountId`, `displayName`, `email`).
- `revokeToken(token)`: revokes credentials on provider side during disconnect or recovery action.
- `refreshAccessToken(refreshToken)`: refreshes tokens when expired.

### `ProviderRegistry`
A registry located at `src/providers/provider.registry.js` that maps uppercase provider names (`GOOGLE`, `GITHUB`) to concrete provider instances.
- When an OAuth request arrives for a provider not registered or not configured, a standard safe error is returned:
  ```json
  {
    "error": "Not Implemented",
    "message": "Provider 'GOOGLE' is not configured or not yet implemented"
  }
  ```

---

## 3. Security Requirements

1. **State Parameter**: Server-generated, cryptographically random, hashed before storage in `oAuthState` table.
2. **PKCE Verification**: Mandatory where supported (Google, GitHub). Code verifier held exclusively on the server in `oAuthState.codeVerifier`.
3. **Token Encryption**: All OAuth `accessToken` and `refreshToken` values are encrypted using AES-256-GCM before persisting in `connectedAccount`. Plaintext tokens are NEVER stored, logged, or returned in API responses.
4. **Stable External Identifiers**: `providerAccountId` must strictly use immutable provider identifiers (Google `sub`, GitHub numeric `id`). Never use mutable usernames or emails.
5. **Takeover Protection**: Cross-user provider linking is rejected with HTTP 409 Conflict.
