# Re:COVER User Authentication Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
**Goal:** Implement a production-grade, secure, server-side session authentication system for Re:COVER users supporting registration, login, session validation, logout, profile retrieval, and route protection.
**Architecture:** Layered Express architecture (Routes → Controllers → Services → Repositories → PostgreSQL/Prisma 8) with cryptographically secure hashed server-side sessions, HttpOnly cookies, Zod validation, and bcryptjs hashing.
**Tech Stack:** Node.js, Express, PostgreSQL, Prisma 8 RC, bcryptjs, cookie-parser, express-rate-limit, Zod.
---

## Key Architectural Decisions
1. **Password Hashing**: `bcryptjs` with cost factor 12 (OWASP compliant, zero native build dependencies on Node 26 Windows).
2. **Session Architecture**: Persistent, revocable server-side sessions stored in PostgreSQL. The database stores only the SHA-256 hash of the 256-bit crypto session token. The raw token is sent to the client via an `HttpOnly`, `SameSite=Lax`, `Secure` (in prod) cookie.
3. **Database Changes**:
   - `User` model: add `passwordHash String?` (nullable to support future WebAuthn/Passkey users without passwords) and `sessions Session[]`.
   - `Session` model: `id`, `userId`, `sessionTokenHash @unique`, `expiresAt`, `createdAt`, `lastUsedAt`, `ipAddress`, `userAgent`.
4. **CORS & Credentials**: `cors({ origin: config.clientUrl, credentials: true })`.
5. **Abuse Protection**: `express-rate-limit` for login/registration.

## Proposed Tasks
1. Install dependencies (`bcryptjs`, `cookie-parser`, `express-rate-limit`).
2. Update `src/prisma/contract.prisma` with `passwordHash` and `Session` model.
3. Emit contract (`npx prisma contract emit`), plan migration, and apply (`npx prisma db migrate`).
4. Update configuration (`src/config/env.js`, `.env.example`).
5. Implement Zod validators (`src/validators/auth.validator.js`).
6. Implement repositories (`src/repositories/user.repository.js`, `src/repositories/session.repository.js`).
7. Implement service (`src/services/auth.service.js`).
8. Implement middleware (`src/middleware/auth.middleware.js`, `src/middleware/rateLimiter.js`).
9. Implement controller (`src/controllers/auth.controller.js`) and routes (`src/routes/auth.routes.js`).
10. Wire routes and middleware in `src/app.js`.
11. Run comprehensive test suite verifying all 24 security and functional requirements.

