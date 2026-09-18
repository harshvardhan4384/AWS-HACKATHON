# GitHub OAuth Provider Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the real GitHub OAuth 2.0 provider integration using the existing Task 5 OAuth foundation and provider abstraction, allowing Re:COVER users to connect their GitHub accounts securely with PKCE, server-side code exchange, AES-256-GCM token encryption, cross-user account takeover protection, and audit logging.

**Architecture:** A concrete `GitHubOAuthProvider` extending `BaseOAuthProvider` will implement GitHub's Web Application Flow using standard Node.js `fetch` (zero additional dependencies). It will be registered into `ProviderRegistry` alongside `GoogleOAuthProvider`. Identity resolution uses the official GitHub REST API (`/user` and `/user/emails`) extracting the stable numeric user ID as `providerAccountId`. Disconnection will invoke GitHub's application grant deletion endpoint (`DELETE /applications/{client_id}/grant`).

**Tech Stack:** Node.js (native fetch), Express, PostgreSQL, Prisma 8 RC (`@prisma/orm-postgres`), AES-256-GCM crypto.

---

## Official GitHub Documentation References

1. **GitHub OAuth Authorizing Apps (Web Application Flow)**:
   - Authorization URL: `https://github.com/login/oauth/authorize`
   - Token URL: `https://github.com/login/oauth/access_token`
   - Parameters: `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`
   - PKCE: Officially supported with `S256`.
2. **GitHub OAuth Scopes**:
   - Initial identity scopes: `read:user user:email`
   - Actual granted scopes returned in `scope` parameter / `X-OAuth-Scopes` response header.
3. **GitHub User & Email Endpoints**:
   - `GET https://api.github.com/user`
   - `GET https://api.github.com/user/emails`
   - Headers: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: Re-COVER-Platform`
   - Stable identity: Numeric user `id` (e.g. `583231`) as `providerAccountId`.
4. **GitHub Grant Revocation**:
   - `DELETE https://api.github.com/applications/{client_id}/grant` with HTTP Basic Auth (`client_id:client_secret`) and body `{ "access_token": token }`.

---

## Proposed Tasks

### Task 1: Environment & Setup Documentation
**Files:**
- Create: `Backend/docs/github-oauth-setup.md`
- Modify: `Backend/src/config/env.js`
- Modify: `Backend/.env.example`

1. Add `githubClientId`, `githubClientSecret`, and `githubRedirectUri` to `src/config/env.js`.
2. Add placeholders to `.env.example`.
3. Document GitHub OAuth App creation and callback setup in `docs/github-oauth-setup.md`.

### Task 2: GitHubOAuthProvider Implementation
**Files:**
- Create: `Backend/src/providers/github.provider.js`
- Modify: `Backend/src/providers/provider.registry.js`
- Modify: `Backend/src/providers/capabilityMatrix.js`
- Modify: `Backend/docs/oauth-provider-capabilities.md`

1. Implement `GitHubOAuthProvider` extending `BaseOAuthProvider`:
   - `isConfigured()`: Validates `clientId`, `clientSecret`, `redirectUri`.
   - `supportsPkce()`: Returns `true` (S256).
   - `getRedirectUri()`: Returns configured `githubRedirectUri`.
   - `getAuthorizationUrl()`: Constructs authorization URL with minimal identity scopes (`read:user user:email`), state, and PKCE challenge.
   - `exchangeCodeForTokens()`: POST to `https://github.com/login/oauth/access_token` with `Accept: application/json`, handling optional refresh tokens.
   - `getUserProfile()`: Queries `https://api.github.com/user` and fallback `https://api.github.com/user/emails` for verified email, using numeric `id` as `providerAccountId`.
   - `revokeToken()`: Calls `DELETE https://api.github.com/applications/{client_id}/grant` with Basic Auth.
2. Register `GitHubOAuthProvider` in `ProviderRegistry.initDefaults()`.
3. Update capability matrix documentation.

### Task 3: Comprehensive Automated Test Suite
**Files:**
- Create: `Backend/test-github-oauth.js`

1. Verify all 38 test assertions required by specification:
   - Health check endpoints intact.
   - Authentication gating on `/api/oauth/github/*`.
   - Unconfigured GitHub returns safe 501.
   - Configured GitHub provider generates correct authorization URL with `https://github.com/login/oauth/authorize`.
   - Redirect URI pinning (cannot override via query param).
   - No secrets in authorization URL.
   - State parameter verification (mismatch, expired, replay, user mismatch, provider mismatch).
   - Missing authorization code rejected.
   - GitHub access denial query (`error=access_denied`) handled safely.
   - Server-side code exchange with code_verifier.
   - Authenticated GitHub user API called with token.
   - Stable numeric ID becomes `providerAccountId`.
   - Actual granted scopes persisted.
   - AES-256-GCM token encryption for access and refresh tokens.
   - Zero tokens exposed in API response or logs.
   - Same-user reconnection updates tokens and preserves existing refresh tokens.
   - Cross-user account takeover rejected with 409 Conflict.
   - Disconnect removes `ConnectedAccount` and invokes remote revocation.
   - `AuditLog` captures lifecycle events without secrets.
   - Existing Google OAuth and user authentication tests remain passing (zero regressions).
   - Frontend and skills untouched.

### Task 4: Cleanup & Reporting
**Files:**
- Remove: `Backend/test-github-oauth.js`
- Update: `walkthrough.md`
- Provide structured final report and STOP.

