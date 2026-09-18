# Task 8 — Event Ingestion & Normalization Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a secure, provider-agnostic Event Ingestion & Normalization pipeline in Re:COVER that ingests, validates, normalizes, deduplicates, and persists security events from Google, GitHub, and Simulated AWS into the PostgreSQL `SecurityEvent` model.

**Architecture:** A layered architecture (Routes → Controllers → Services → Adapters → Repositories → Database). Centralized `EventIngestionService` uses provider-specific `EventProviderAdapter` instances (`GoogleEventAdapter`, `GitHubEventAdapter`, `AwsSimulatedEventAdapter`) to validate raw payloads, normalize them to a canonical schema (`LOGIN`, `TOKEN_REVOKED`, etc.), redact secrets, enforce ownership boundaries, and atomically deduplicate on `(connectedAccountId, providerEventId)`.

**Tech Stack:** Node.js, Express, PostgreSQL, Prisma 8 RC (`@prisma/orm-postgres`), Zod. (No schema changes required; Redis/BullMQ cleanly abstracted for Task 9).

---

## Canonical Event Taxonomy & Normalization Contract

### 1. Canonical Taxonomy
- `LOGIN`
- `LOGOUT`
- `SESSION_CREATED`
- `SESSION_TERMINATED`
- `OAUTH_GRANTED`
- `OAUTH_REVOKED`
- `TOKEN_CREATED`
- `TOKEN_REVOKED`
- `SECURITY_SETTING_CHANGED`
- `ACCOUNT_SETTING_CHANGED`
- `DEVICE_ADDED`
- `DEVICE_REMOVED`
- `SSH_KEY_CREATED`
- `SSH_KEY_REMOVED`
- `REPOSITORY_ACCESS`
- `UNKNOWN`

### 2. Canonical Normalization Contract
```json
{
  "provider": "GOOGLE | GITHUB | AWS",
  "eventType": "LOGIN",
  "providerEventId": "evt_123456",
  "occurredAt": "2026-09-18T12:00:00.000Z",
  "receivedAt": "2026-09-18T12:00:02.000Z",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
  "sourceIp": "192.0.2.1",
  "deviceMetadata": { "deviceType": "...", "os": "...", "browser": "..." },
  "locationMetadata": { "country": "...", "city": "..." },
  "eventData": {
    "providerEventType": "...",
    "isUntrustedPayload": true,
    "payloadSchemaVersion": "1.0",
    "details": { ... }
  }
}
```

---

## Proposed Tasks

### Task 1: Centralized Sensitive Data Redaction Utility
**Files:**
- Create: `Backend/src/utils/redaction.js`
- Modify: `Backend/src/repositories/auditLog.repository.js` (use centralized redaction)

1. Implement deep recursive sanitizer stripping all sensitive tokens, passwords, secrets, cookies, session IDs, authorization codes, and private keys.
2. Replace local audit log sanitizer with centralized utility.

### Task 2: Canonical Event Taxonomy & Zod Validators
**Files:**
- Create: `Backend/src/utils/taxonomy.js`
- Create: `Backend/src/validators/event.validator.js`

1. Define canonical taxonomy constants and mapping helpers.
2. Define Zod schemas for event ingestion payload, query filters, and pagination parameters (`limit <= 100`).

### Task 3: Provider Event Adapters
**Files:**
- Create: `Backend/src/adapters/events/base.eventAdapter.js`
- Create: `Backend/src/adapters/events/google.eventAdapter.js`
- Create: `Backend/src/adapters/events/github.eventAdapter.js`
- Create: `Backend/src/adapters/events/aws.eventAdapter.js`
- Create: `Backend/src/adapters/events/eventAdapter.registry.js`

1. `BaseEventAdapter`: defines `validate(rawEvent)`, `normalize(rawEvent)`, `deriveProviderEventId(rawEvent)`.
2. `GoogleEventAdapter`: normalizes Google security and activity fixtures (login, oauth grant/revoke, password change, device added).
3. `GitHubEventAdapter`: normalizes GitHub authentication, SSH key, and token events.
4. `AwsSimulatedEventAdapter`: simulates AWS GuardDuty/CloudTrail events (`AWS_CONSOLE_LOGIN`, `AWS_ACCESS_KEY_CREATED`, `AWS_ACCESS_KEY_REVOKED`, `AWS_SECURITY_SETTING_CHANGED`, `AWS_SESSION_CREATED`) clearly tagged with `isSimulated: true`.
5. `EventAdapterRegistry`: manages event adapters by provider name (`GOOGLE`, `GITHUB`, `AWS`).

### Task 4: SecurityEvent Repository
**Files:**
- Create: `Backend/src/repositories/securityEvent.repository.js`

1. `create(data)`: handles atomic insert and catches unique constraint violations (`connectedAccountId` + `providerEventId`) for idempotent deduplication.
2. `findByAccountAndProviderEventId(connectedAccountId, providerEventId)`: checks existing events.
3. `findById(id)`: retrieves event by ID.
4. `listByUserId(userId, options)`: supports bounded pagination (`limit`, `page`/`skip`), provider filtering, eventType filtering, status filtering, and chronological sorting.

### Task 5: Event Ingestion & Processing Services
**Files:**
- Create: `Backend/src/services/eventIngestion.service.js`
- Create: `Backend/src/services/eventProcessing.service.js`

1. `EventIngestionService`:
   - Validates ownership between `userId` and `ConnectedAccount`.
   - Rejects provider mismatches (e.g. GitHub event for Google account).
   - Derives deterministic ID for events without a native provider ID.
   - Redacts sensitive payload fields.
   - Persists event with status `NORMALIZED`.
   - Deduplicates cleanly without crashing.
   - Logs structured `AuditLog` records (`EVENT_INGESTED`, `EVENT_DUPLICATE`, `EVENT_REJECTED`).
2. `EventProcessingService`:
   - Prepares service boundary for Task 9 (processes normalized events, transitions status).

### Task 6: Event Controller, Routes & App Wiring
**Files:**
- Create: `Backend/src/controllers/event.controller.js`
- Create: `Backend/src/routes/event.routes.js`
- Modify: `Backend/src/app.js`

1. Endpoints:
   - `POST /api/events/ingest`: ingests a raw provider event.
   - `POST /api/events/simulate-aws`: convenience simulation endpoint for AWS hackathon demo.
   - `GET /api/events`: lists events with pagination and filters for the authenticated user.
   - `GET /api/events/:id`: retrieves a single event with user isolation.
2. All endpoints gated behind `authenticate` middleware.
3. Mount in `src/app.js` at `/api/events`.

### Task 7: Capability Matrix Documentation Update
**Files:**
- Modify: `Backend/src/providers/capabilityMatrix.js`
- Modify: `Backend/docs/oauth-provider-capabilities.md`

1. Mark Event Ingestion as `FOUNDATION` for Google and GitHub, and `SIMULATED` for AWS.

### Task 8: Comprehensive Automated & Adversarial Tests
**Files:**
- Create: `Backend/test-event-ingestion.js`

1. Verify 40+ required assertions:
   - Health checks intact.
   - Authentication gating (401).
   - User ownership enforcement and cross-user rejection (User A cannot ingest for User B's account).
   - Provider mismatch rejection (GitHub event for Google account).
   - Valid Google, GitHub, and Simulated AWS event normalization.
   - Idempotency & deduplication on single-arrival and concurrent race conditions.
   - Sensitive field redaction (access tokens, refresh tokens, passwords, private keys stripped).
   - Prompt injection resilience (malicious prompt strings remain untrusted data).
   - Bounded pagination and filters (provider, eventType, status).
   - AuditLog verification with zero secrets.
   - Regression tests: Task 4 auth, Task 6 Google OAuth, Task 7 GitHub OAuth.
   - Frontend and root `.agents/skills` untouched.

### Task 9: Cleanup & Final Reporting
**Files:**
- Remove `Backend/test-event-ingestion.js`.
- Update `walkthrough.md`.
- Provide structured final report and STOP.

