# Google OAuth Provider Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the real Google OAuth 2.0 provider integration using the existing Task 5 OAuth foundation, enabling Re:COVER users to securely link their Google account with PKCE, OIDC identity verification, offline access, AES-256-GCM token encryption, and tamper-proof audit logging.

**Architecture:** A concrete `GoogleOAuthProvider` class extending `BaseOAuthProvider` will encapsulate Google-specific OAuth 2.0 and OpenID Connect logic using Google's official `google-auth-library` (or encapsulated REST/JWKS). The provider will register into the existing `ProviderRegistry`. The OAuth service and repositories will be hardened to enforce strict redirect URI pinning, cross-user account takeover protection, refresh token preservation on reauthorization, and structured secret-free audit logging into the `AuditLog` table.

**Tech Stack:** Node.js, Express, PostgreSQL, Prisma 8 RC (`@prisma/orm-postgres`), `google-auth-library`, Node.js built-in `crypto`.

---

## Official Google Documentation References

1. **Google OAuth 2.0 for Web Server Applications**:
   - Auth endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
   - Token endpoint: `https://oauth2.googleapis.com/token`
   - Revocation endpoint: `https://oauth2.googleapis.com/revoke`
   - Parameters: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`
   - Offline access: `access_type=offline` + `prompt=consent`
2. **Google OpenID Connect & Scopes**:
   - Initial identity scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile` (or aliases `email`, `profile`).
   - Discovery doc: `https://accounts.google.com/.well-known/openid-configuration`
   - JWKS endpoint: `https://www.googleapis.com/oauth2/v3/certs`
   - Valid issuers (`iss`): `https://accounts.google.com` or `accounts.google.com`
   - Audience (`aud`): Must strictly match `GOOGLE_CLIENT_ID`
   - Subject (`sub`): Permanent, immutable Google account identifier.

---

## Proposed Tasks

### Task 1: Environment & Google Cloud Configuration Documentation
**Files:**
- Create: `Backend/docs/google-oauth-setup.md`
- Modify: `Backend/src/config/env.js`
- Modify: `Backend/.env.example`

1. Add `googleClientId`, `googleClientSecret`, `googleRedirectUri` to `src/config/env.js`.
2. Add placeholders to `.env.example` (never commit real credentials).
3. Document Google Cloud Console setup, OAuth consent screen, and authorized redirect URI constraints in `docs/google-oauth-setup.md`.

### Task 2: AuditLog Repository
**Files:**
- Create: `Backend/src/repositories/auditLog.repository.js`

1. Implement `createAuditLog({ userId, actorType, actorId, actionType, targetType, targetId, result, metadata })`.
2. Ensure metadata sanitization stripping any access/refresh tokens, codes, or keys before persistence.

### Task 3: Hardened Repository Methods for ConnectedAccount
**Files:**
- Modify: `Backend/src/repositories/connectedAccount.repository.js`

1. Implement `findByProviderAndAccountId(provider, providerAccountId)` to detect cross-user links.
2. Update `upsertConnectedAccount` to preserve `existing.refreshTokenCiphertext` if the re-authorization does not supply a new refresh token.

### Task 4: GoogleOAuthProvider Implementation
**Files:**
- Modify: `Backend/package.json` (install `google-auth-library`)
- Create: `Backend/src/providers/google.provider.js`
- Modify: `Backend/src/providers/provider.registry.js`

1. Install `google-auth-library` as the official Google-maintained client for ID token verification.
2. Implement `GoogleOAuthProvider` extending `BaseOAuthProvider`:
   - `isConfigured()`: checks presence of client ID, client secret, redirect URI.
   - `supportsPkce()`: returns `true`.
   - `getAuthorizationUrl()`: builds consent URL with `access_type=offline`, `prompt=consent`, `code_challenge_method=S256`.
   - `exchangeCodeForTokens()`: exchanges authorization code with `code_verifier`.
   - `getUserProfile()` / `verifyIdToken()`: verifies signature against Google JWKS, checks `iss`, `aud`, `exp`, and extracts stable `sub`, `email`, and `name`.
   - `revokeToken()`: calls Google revocation endpoint.
3. Automatically register `GoogleOAuthProvider` into `providerRegistry`.

### Task 5: OAuth Service & Controller Hardening
**Files:**
- Modify: `Backend/src/services/oauth.service.js`
- Modify: `Backend/src/controllers/oauth.controller.js`

1. Enforce configured redirect URI for Google (ignoring untrusted browser redirect query parameters).
2. Check `findByProviderAndAccountId` before upsert: if account already belongs to a different Re:COVER user, reject with 409 Conflict.
3. Hook audit logging:
   - `OAUTH_CONNECTION_STARTED`
   - `OAUTH_CONNECTION_SUCCEEDED`
   - `OAUTH_CONNECTION_FAILED`
   - `OAUTH_ACCOUNT_ALREADY_LINKED`
   - `OAUTH_ACCOUNT_DISCONNECTED` (recording `remoteRevocationResult`)
4. Handle provider revocation failure gracefully during disconnect (distinguish local disconnect from remote revocation).

### Task 6: Comprehensive Automated Test Suite
**Files:**
- Create: `Backend/test-google-oauth.js`

1. Verify 36 test cases outlined in specification:
   - Health check intact.
   - Authentication gating.
   - Missing configuration returns 501.
   - Configured Google provider builds correct authorization URL with PKCE, offline access, prompt=consent, minimal scopes.
   - Zero secrets in auth URL.
   - State validation (mismatch, expired, replayed, provider mismatch).
   - Code exchange server-side.
   - ID token validation (valid, wrong issuer, wrong audience, expired, tampered).
   - AES-256-GCM encryption of tokens in DB.
   - Zero tokens in API response and zero tokens logged.
   - Same-user reconnection and refresh token preservation.
   - Cross-user account takeover rejection (409 Conflict).
   - Disconnect with remote revocation handling.
   - AuditLog records created without secrets.
   - Existing user authentication intact.
   - Frontend and skills untouched.

### Task 7: Review, Documentation & Verification
**Files:**
- Modify: `walkthrough.md`
- Remove: `Backend/test-google-oauth.js` after tests pass.
- Status report on real Google E2E (ready for real credentials when supplied).

