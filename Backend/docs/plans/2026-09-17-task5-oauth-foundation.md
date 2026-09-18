# Re:COVER OAuth Foundation & Provider Abstraction Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
**Goal:** Establish a secure, reusable, provider-agnostic OAuth 2.0 foundation with PKCE support, server-side state protection, AES-256-GCM token encryption, and a provider adapter architecture that future Google and GitHub integrations will plug into.
**Architecture:** Layered Express architecture (Routes → Controllers → Services → Repositories → PostgreSQL/Prisma 8) with provider adapter interface (`BaseOAuthProvider`), provider registry (`ProviderRegistry`), server-side `OAuthState` tracking, and AES-256-GCM token encryption.
**Tech Stack:** Node.js, Express, PostgreSQL, Prisma 8 RC, Node crypto (AES-256-GCM, SHA-256).
---

## Key Architecture Decisions
1. **No Real Google/GitHub Calls**: Provider adapters for real Google and GitHub will be created in Task 6 and Task 7. Unconfigured providers return a clean HTTP 501 (`"Provider is not configured or not yet implemented"`).
2. **Token Encryption**: AES-256-GCM authenticated encryption (`tokenEncryption.service.js`) with key from `OAUTH_TOKEN_ENCRYPTION_KEY`. Output format is `iv:authTag:ciphertext` in hex.
3. **Server-Side OAuth State (`OAuthState` model)**: Cryptographically random 256-bit token; database stores SHA-256 `stateHash`; tracks `userId`, `provider`, `codeVerifier`, `expiresAt`, `usedAt`.
4. **Session Boundary**: OAuth endpoints require an active Re:COVER session via `authenticate` middleware.

