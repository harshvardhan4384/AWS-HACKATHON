# Re:COVER — Task 9: Detection Engine & Risk Engine Architecture

## 1. Overview & Architectural Pipeline

Re:COVER's Detection Engine and Risk Engine provide deterministic, explainable security analysis over normalized provider activity events (`SecurityEvent`).

The end-to-end detection pipeline operates deterministically without relying on probabilistic machine learning models, external IP reputation lookups, or non-deterministic large language models:

```
SecurityEvent (NORMALIZED)
      │
      ▼
DetectionService.detect(userId, eventId)
      │
      ├── 1. Verify user ownership & fetch event
      ├── 2. Idempotency guard (return cached if CORRELATED)
      ├── 3. Build bounded DetectionContext (queries indexed by account/user/time)
      ├── 4. Evaluate applicable DetectionRules from DetectionRuleRegistry
      │       ├── UNFAMILIAR_LOGIN
      │       ├── NEW_SSH_KEY
      │       ├── NEW_CREDENTIAL_CREATED
      │       ├── NEW_OAUTH_GRANT
      │       ├── SECURITY_SETTING_CHANGED
      │       ├── RAPID_CREDENTIAL_CREATION
      │       ├── POSSIBLE_ACCOUNT_TAKEOVER_CHAIN
      │       └── CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY
      ├── 5. Collect in-memory Finding objects
      ├── 6. Deduplicate findings via detection key (`${eventId}:${ruleId}`)
      ├── 7. RiskEngine: compute score (0–100), severity, and factors
      ├── 8. Determine Incident creation / update (score >= 20 OR severity >= MEDIUM)
      │       ├── If active incident exists for account → update severity + append summary
      │       └── Else → create new Incident (detectionSource: "RULE_MATCH")
      ├── 9. Persist findings as Evidence records linked to Incident and SecurityEvent
      ├── 10. Transition SecurityEvent.status → ANALYZED or CORRELATED
      └── 11. Structured Audit Logging throughout (DETECTION_STARTED, FINDING_CREATED,
               RISK_CALCULATED, INCIDENT_CREATED/UPDATED, DETECTION_COMPLETED)
```

---

## 2. Detection Rules Catalog

All detection rules inherit from `BaseDetectionRule` and evaluate bounded, structured context passed by `DetectionContextService`. Rules never inspect unstructured payloads or treat untrusted strings as execution instructions.

| Rule ID | Trigger Event | Condition / Correlation Pattern | Default Severity | Score Contrib. | Confidence |
|---|---|---|---|---|---|
| `UNFAMILIAR_LOGIN` | `LOGIN` | `sourceIp` not observed in user's login baseline for same account in last `DETECTION_UNFAMILIAR_LOGIN_LOOKBACK_DAYS` (default 30d). | `MEDIUM` (or `INFO` if 1st login) | +25 | 0.70 (0.30 if 1st login) |
| `NEW_SSH_KEY` | `SSH_KEY_CREATED` | Persistent SSH key added to provider account. | `HIGH` | +30 | 0.90 |
| `NEW_CREDENTIAL_CREATED` | `TOKEN_CREATED` | Personal access token / API key created. | `MEDIUM` | +30 | 0.90 |
| `NEW_OAUTH_GRANT` | `OAUTH_GRANTED` | Third-party application granted authorization. | `MEDIUM` | +20 | 0.80 |
| `SECURITY_SETTING_CHANGED` | `SECURITY_SETTING_CHANGED` | Account security configuration altered (e.g., 2FA disabled). | `HIGH` | +25 | 0.90 |
| `RAPID_CREDENTIAL_CREATION` | `TOKEN_CREATED` or `SSH_KEY_CREATED` | Credential creation occurs within `DETECTION_RAPID_CREDENTIAL_WINDOW_MINUTES` (default 10m) following a `LOGIN` on same account. | `HIGH` | +20 | 0.80 |
| `POSSIBLE_ACCOUNT_TAKEOVER_CHAIN` | `REPOSITORY_ACCESS` | Preceded by both `LOGIN` and (`TOKEN_CREATED` or `SSH_KEY_CREATED`) on same account within `DETECTION_TAKEOVER_WINDOW_MINUTES` (default 30m). | `CRITICAL` | +30 | 0.75 |
| `CROSS_ACCOUNT_SUSPICIOUS_ACTIVITY` | `LOGIN` or `SESSION_CREATED` | Same user has active logins across $\ge 2$ different connected provider accounts within `DETECTION_CROSS_ACCOUNT_WINDOW_MINUTES` (default 30m). | `HIGH` | +20 | 0.65 |

---

## 3. Risk Engine & Scoring Formula

The Risk Engine calculates a deterministic 0–100 integer score:

1. **Finding Deduplication**: If multiple findings share the same finding type (e.g., multiple rapid credential detections), only one contribution is added to prevent score inflation.
2. **Deterministic Additive Model**:
   $$\text{RawScore} = \sum_{f \in \text{UniqueFindings}} \text{Contribution}(f)$$
   $$\text{RiskScore} = \min(\text{RawScore}, 100)$$
3. **Severity Mapping**:
   - `0 – 19`: **`INFO`**
   - `20 – 39`: **`LOW`**
   - `40 – 59`: **`MEDIUM`**
   - `60 – 79`: **`HIGH`**
   - `80 – 100`: **`CRITICAL`**
4. **Confidence**:
   Confidence is an evidence confidence metric ($0.0 \dots 1.0$) reflecting the clarity and directness of the observed signal, **not** an attacker probability.

---

## 4. Findings vs. Evidence Model

To maintain schema simplicity and leverage PostgreSQL relational integrity without schema alterations:
- **Findings** are in-memory analytical representations produced by rule evaluations.
- **Evidence** records in PostgreSQL (`Evidence` table) represent persisted findings:
  - `evidenceType`: The finding type string (e.g., `UNFAMILIAR_LOGIN`, `NEW_SSH_KEY`).
  - `incidentId`: The associated Incident ID.
  - `eventId`: Foreign key referencing the triggering `SecurityEvent`.
  - `confidence`: The rule's evidence confidence rating ($0.0 \dots 1.0$).
  - `evidenceData`: Structured JSON storing `{ ruleId, findingType, severity, summary, riskContribution, detectionKey, relatedEventIds, findingMetadata }`.

---

## 5. Idempotency & Deduplication

- **Detection Key**: Each finding has a deterministic deduplication key:
  $$\text{detectionKey} = \text{eventId} : \text{ruleId}$$
- Before creating an `Evidence` record, `findingRepository.findByDetectionKey(eventId, ruleId)` checks if a finding for this event and rule has already been persisted.
- If re-evaluating an already analyzed event, `DetectionService` returns cached findings and does not create duplicate `Incident` or `Evidence` rows.
- **Incident Deduplication**:
  - `incidentRepository.findActiveByUserAndAccount(userId, connectedAccountId, windowMinutes)` queries open incidents within the takeover window.
  - If found, the incident's summary is appended to, and its severity is upgraded (via `maxSeverity()`), rather than generating duplicate incident records.

---

## 6. Security Guarantees & Boundaries

1. **Deterministic Rule Execution**: No stochastic models or LLMs are involved in deciding suspiciousness or computing scores.
2. **Prompt Injection Resistance**: Rules read structured attributes (`sourceIp`, `occurredAt`, `eventType`, `connectedAccountId`). Content placed inside `eventData` (such as strings attempting to prompt-inject instructions or spoof risk scores) is ignored by rule logic.
3. **No Automatic Recovery**: The Detection Engine only detects and classifies findings; remediation actions (`RecoveryAction`) are strictly decoupled and require downstream policy and authorization workflows.
4. **Tenant Isolation**: Every repository query and service call verifies `userId` ownership. Cross-user data access is rejected with HTTP 404/403.
5. **No Plaintext Secrets**: Sensitive credentials in audit metadata and event payloads are redacted before logging or persistence.

---

## 7. Configuration Reference

All thresholds are configurable via environment variables with production defaults:

| Variable | Default | Description |
|---|---|---|
| `DETECTION_UNFAMILIAR_LOGIN_LOOKBACK_DAYS` | `30` | Days of login history evaluated for baseline IPs |
| `DETECTION_RAPID_CREDENTIAL_WINDOW_MINUTES` | `10` | Maximum time between login and credential creation |
| `DETECTION_TAKEOVER_WINDOW_MINUTES` | `30` | Time window for three-stage takeover sequence |
| `DETECTION_CROSS_ACCOUNT_WINDOW_MINUTES` | `30` | Time window for multi-account concurrent logins |
| `RISK_SCORE_MAX` | `100` | Maximum risk score ceiling |

