'use strict';

const { randomUUID } = require('crypto');
const securityEventRepository = require('../repositories/securityEvent.repository');
const findingRepository = require('../repositories/finding.repository');
const incidentRepository = require('../repositories/incident.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const detectionContextService = require('./detectionContext.service');
const eventCorrelationService = require('./eventCorrelation.service');
const riskEngine = require('./riskEngine');
const { detectionRuleRegistry } = require('./rules/detectionRule.registry');

/**
 * DetectionService — Main orchestrator of the Re:COVER Detection Pipeline.
 *
 * Pipeline (13 steps):
 *
 *  1.  Load and ownership-verify SecurityEvent
 *  2.  Idempotency guard (already fully analyzed)
 *  3.  Audit: DETECTION_STARTED
 *  4.  Build DetectionContext (bounded DB queries)
 *  5.  Get applicable detection rules
 *  6.  Evaluate each rule → collect in-memory findings
 *  7.  Idempotency check per finding (skip existing Evidence records)
 *  8.  Persist new findings as Evidence (associated with incident TBD)
 *  9.  Calculate risk: RiskEngine.calculate(allFindings)
 * 10.  Audit: RISK_CALCULATED
 * 11.  Determine incident action (threshold: riskScore >= 20 OR severity >= MEDIUM)
 * 12.  Create or update Incident; link SecurityEvent; re-attach Evidence to Incident
 * 13.  Transition SecurityEvent.status → ANALYZED (or CORRELATED if incidentId set)
 * 14.  Audit: DETECTION_COMPLETED
 *
 * SECURITY GUARANTEES:
 * - Rules never read eventData — structured fields only
 * - riskScore from eventData is IGNORED; only RiskEngine output is used
 * - No automatic recovery actions are triggered
 * - All operations are scoped to the authenticated userId
 */

// Minimum risk score (inclusive) to create an incident
const INCIDENT_RISK_THRESHOLD = 20;
// Finding severity levels that alone justify an incident
const INCIDENT_SEVERITY_THRESHOLD = ['MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Returns the highest severity from an array of findings.
 *
 * @param {object[]} findings
 * @returns {string}
 */
function highestFindingSeverity(findings) {
  const order = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let max = 'INFO';
  for (const f of findings) {
    if (order.indexOf(f.severity) > order.indexOf(max)) {
      max = f.severity;
    }
  }
  return max;
}

/**
 * Builds a deterministic incident title from an event and findings.
 *
 * @param {object} event
 * @param {object[]} findings
 * @returns {string}
 */
function buildIncidentTitle(event, findings) {
  const findingTypes = [...new Set(findings.map((f) => f.type))];
  const topFinding = findingTypes[0] || 'SUSPICIOUS_ACTIVITY';
  return `${topFinding.replace(/_/g, ' ')} — ${event.provider} account`;
}

/**
 * Builds a human-readable incident summary from findings.
 *
 * @param {object[]} findings
 * @param {object} riskResult
 * @returns {string}
 */
function buildIncidentSummary(findings, riskResult) {
  const parts = findings.map((f) => f.summary).filter(Boolean);
  return parts.join('. ') + ` Risk score: ${riskResult.riskScore}/100.`;
}

class DetectionService {
  /**
   * Runs the full detection pipeline for a single SecurityEvent.
   *
   * @param {string} userId - Authenticated user performing the analysis
   * @param {string} eventId - SecurityEvent ID to analyze
   * @returns {Promise<object>} Detection result
   */
  async detect(userId, eventId) {
    const correlationId = randomUUID();

    // -----------------------------------------------------------------------
    // STEP 1: Load event with ownership verification
    // -----------------------------------------------------------------------
    const event = await securityEventRepository.findById(eventId);
    if (!event || event.userId !== userId) {
      const err = new Error('Security event not found');
      err.statusCode = 404;
      throw err;
    }

    // -----------------------------------------------------------------------
    // STEP 2: Idempotency — if fully CORRELATED, return early (already done)
    // -----------------------------------------------------------------------
    if (event.status === 'CORRELATED') {
      const existingFindings = await findingRepository.listByEventId(eventId);
      const incidentId = event.incidentId || null;
      const riskResult = riskEngine.calculate(
        existingFindings.map((e) => ({
          type: e.evidenceType,
          confidence: e.confidence || 0,
          severity: e.evidenceData?.severity || 'INFO',
        }))
      );
      return {
        eventId,
        findingsCreated: 0,
        findingsDuplicated: existingFindings.length,
        findings: existingFindings,
        riskScore: riskResult.riskScore,
        severity: riskResult.severity,
        factors: riskResult.factors,
        explanation: riskResult.explanation,
        incidentId,
        incidentCreated: false,
        incidentUpdated: false,
        correlationId,
        note: 'Event already analyzed — returning cached result.',
      };
    }

    // -----------------------------------------------------------------------
    // STEP 3: Audit: DETECTION_STARTED
    // -----------------------------------------------------------------------
    await auditLogRepository.create({
      userId,
      actorType: 'SYSTEM',
      actorId: 'DetectionService',
      actionType: 'DETECTION_STARTED',
      targetType: 'SecurityEvent',
      targetId: eventId,
      result: 'SUCCESS',
      correlationId,
      metadata: {
        eventType: event.eventType,
        provider: event.provider,
        connectedAccountId: event.connectedAccountId,
      },
    });

    let detectionResult;
    try {
      detectionResult = await this._runPipeline(userId, event, correlationId);
    } catch (pipelineErr) {
      // STEP: Audit DETECTION_FAILED
      await auditLogRepository.create({
        userId,
        actorType: 'SYSTEM',
        actorId: 'DetectionService',
        actionType: 'DETECTION_FAILED',
        targetType: 'SecurityEvent',
        targetId: eventId,
        result: 'FAILURE',
        correlationId,
        metadata: { error: pipelineErr.message },
      });
      throw pipelineErr;
    }

    // -----------------------------------------------------------------------
    // STEP 14: Audit: DETECTION_COMPLETED
    // -----------------------------------------------------------------------
    await auditLogRepository.create({
      userId,
      actorType: 'SYSTEM',
      actorId: 'DetectionService',
      actionType: 'DETECTION_COMPLETED',
      targetType: 'SecurityEvent',
      targetId: eventId,
      result: 'SUCCESS',
      correlationId,
      metadata: {
        findingsCreated: detectionResult.findingsCreated,
        riskScore: detectionResult.riskScore,
        severity: detectionResult.severity,
        incidentId: detectionResult.incidentId,
        incidentCreated: detectionResult.incidentCreated,
        incidentUpdated: detectionResult.incidentUpdated,
      },
    });

    return { ...detectionResult, correlationId };
  }

  /**
   * Internal pipeline execution.
   * Separated so that failures are caught cleanly by detect() for audit logging.
   *
   * @private
   */
  async _runPipeline(userId, event, correlationId) {
    const eventId = event.id;

    // -----------------------------------------------------------------------
    // STEP 4: Build DetectionContext
    // -----------------------------------------------------------------------
    const context = await detectionContextService.buildContext(event);

    // -----------------------------------------------------------------------
    // STEP 5: Get applicable rules from registry
    // -----------------------------------------------------------------------
    const applicableRules = detectionRuleRegistry.getApplicableRules(event);

    // -----------------------------------------------------------------------
    // STEP 6: Evaluate each rule
    // -----------------------------------------------------------------------
    const newFindings = [];
    const duplicateFindings = [];
    const allFindings = [];

    for (const rule of applicableRules) {
      let finding;
      try {
        finding = await rule.evaluate(context);
      } catch (ruleErr) {
        // Individual rule failures don't abort the entire pipeline
        await auditLogRepository.create({
          userId,
          actorType: 'SYSTEM',
          actorId: 'DetectionService',
          actionType: 'DETECTION_RULE_ERROR',
          targetType: 'SecurityEvent',
          targetId: eventId,
          result: 'FAILURE',
          correlationId,
          metadata: { ruleId: rule.id, error: ruleErr.message },
        });
        continue;
      }

      if (!finding) continue;

      // -----------------------------------------------------------------------
      // STEP 7: Idempotency check per finding
      // -----------------------------------------------------------------------
      const existingEvidence = await findingRepository.findByDetectionKey(eventId, rule.id);
      if (existingEvidence) {
        duplicateFindings.push(finding);
        allFindings.push(finding);
        continue;
      }

      newFindings.push(finding);
      allFindings.push(finding);
    }

    // -----------------------------------------------------------------------
    // STEP 9: Calculate risk using RiskEngine (ALL findings, including duplicates)
    // -----------------------------------------------------------------------
    const riskResult = riskEngine.calculate(allFindings);

    // -----------------------------------------------------------------------
    // STEP 10: Audit: RISK_CALCULATED
    // -----------------------------------------------------------------------
    await auditLogRepository.create({
      userId,
      actorType: 'SYSTEM',
      actorId: 'DetectionService',
      actionType: 'RISK_CALCULATED',
      targetType: 'SecurityEvent',
      targetId: eventId,
      result: 'SUCCESS',
      correlationId,
      metadata: {
        riskScore: riskResult.riskScore,
        severity: riskResult.severity,
        findingCount: allFindings.length,
        factors: riskResult.factors,
      },
    });

    // -----------------------------------------------------------------------
    // STEP 11: Determine incident action
    // Threshold: riskScore >= 20 OR any finding severity >= MEDIUM
    // -----------------------------------------------------------------------
    const topFindingSeverity = highestFindingSeverity(allFindings);
    const shouldCreateOrUpdateIncident =
      allFindings.length > 0 &&
      (riskResult.riskScore >= INCIDENT_RISK_THRESHOLD ||
        INCIDENT_SEVERITY_THRESHOLD.includes(topFindingSeverity));

    let incidentId = null;
    let incidentCreated = false;
    let incidentUpdated = false;
    let targetIncident = null;

    if (shouldCreateOrUpdateIncident) {
      // -----------------------------------------------------------------------
      // STEP 12a: Incident deduplication — find existing active incident
      // -----------------------------------------------------------------------
      const existingIncident = event.connectedAccountId
        ? await incidentRepository.findActiveByUserAndAccount(userId, event.connectedAccountId)
        : null;

      if (existingIncident) {
        // Append to existing incident
        const summary = buildIncidentSummary(newFindings.length > 0 ? newFindings : allFindings, riskResult);
        targetIncident = await incidentRepository.updateSeverityAndSummary(
          existingIncident.id,
          riskResult.severity,
          summary
        );
        incidentId = existingIncident.id;
        incidentUpdated = true;

        await auditLogRepository.create({
          userId,
          actorType: 'SYSTEM',
          actorId: 'DetectionService',
          actionType: 'INCIDENT_UPDATED',
          targetType: 'Incident',
          targetId: incidentId,
          result: 'SUCCESS',
          correlationId,
          metadata: {
            riskScore: riskResult.riskScore,
            severity: riskResult.severity,
            eventId,
            newFindingsAdded: newFindings.length,
          },
        });
      } else {
        // Create new incident
        const title = buildIncidentTitle(event, allFindings);
        const summary = buildIncidentSummary(allFindings, riskResult);

        targetIncident = await incidentRepository.create({
          userId,
          title,
          summary,
          status: 'OPEN',
          severity: riskResult.severity,
          detectionSource: 'RULE_MATCH',
        });

        incidentId = targetIncident.id;
        incidentCreated = true;

        await auditLogRepository.create({
          userId,
          actorType: 'SYSTEM',
          actorId: 'DetectionService',
          actionType: 'INCIDENT_CREATED',
          targetType: 'Incident',
          targetId: incidentId,
          result: 'SUCCESS',
          correlationId,
          metadata: {
            riskScore: riskResult.riskScore,
            severity: riskResult.severity,
            eventId,
            findingCount: allFindings.length,
            title,
          },
        });
      }

      // Link the primary SecurityEvent to the incident
      await incidentRepository.linkEventToIncident(eventId, incidentId);
    }

    // -----------------------------------------------------------------------
    // STEP 8: Persist NEW findings as Evidence records
    // (Must happen after incidentId is known, so evidence references the incident)
    // -----------------------------------------------------------------------
    const persistedFindings = [];
    for (const finding of newFindings) {
      const riskContribution = riskEngine.SCORE_CONTRIBUTIONS[finding.type] || 0;

      const evidenceIncidentId = incidentId;
      if (!evidenceIncidentId) {
        // No incident created — still persist findings with a placeholder
        // but we can only store evidence if an incident exists per schema FK
        // Skip persistence if no incident — findings are returned but not stored
        persistedFindings.push({ finding, evidence: null, isDuplicate: false, skipped: true });
        continue;
      }

      const { evidence, isDuplicate } = await findingRepository.create({
        incidentId: evidenceIncidentId,
        eventId,
        finding,
        riskContribution,
        source: event.provider || null,
      });

      if (!isDuplicate) {
        await auditLogRepository.create({
          userId,
          actorType: 'SYSTEM',
          actorId: 'DetectionService',
          actionType: 'FINDING_CREATED',
          targetType: 'Evidence',
          targetId: evidence.id,
          result: 'SUCCESS',
          correlationId,
          metadata: {
            findingType: finding.type,
            severity: finding.severity,
            confidence: finding.confidence,
            riskContribution,
            eventId,
            incidentId: evidenceIncidentId,
          },
        });
      }

      persistedFindings.push({ finding, evidence, isDuplicate });
    }

    // Also persist duplicate findings' evidence for reference (if incidentId known and evidence not yet linked to THIS incident)
    // (Handled by the findByDetectionKey check in findingRepository.create)

    // -----------------------------------------------------------------------
    // STEP 13: Produce correlation metadata for related events
    // -----------------------------------------------------------------------
    const allRelatedEventIds = [
      ...new Set(allFindings.flatMap((f) => f.relatedEventIds || [])),
    ];

    // -----------------------------------------------------------------------
    // STEP 12b: Transition SecurityEvent status
    // -----------------------------------------------------------------------
    const newStatus = incidentId ? 'CORRELATED' : 'ANALYZED';
    await securityEventRepository.updateStatus(eventId, newStatus);

    return {
      eventId,
      findingsCreated: newFindings.length,
      findingsDuplicated: duplicateFindings.length,
      findings: allFindings,
      riskScore: riskResult.riskScore,
      severity: riskResult.severity,
      factors: riskResult.factors,
      explanation: riskResult.explanation,
      incidentId,
      incidentCreated,
      incidentUpdated,
      relatedEventIds: allRelatedEventIds,
    };
  }
}

// Export singleton
const detectionService = new DetectionService();

/**
 * Initializes the detection rule registry with all 8 default rules.
 * Must be called once at application startup, before processing any events.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
function initDefaultRules() {
  if (detectionRuleRegistry.size > 0) return; // Already initialized

  const UnfamiliarLoginRule = require('./rules/unfamiliarLogin.rule');
  const NewSshKeyRule = require('./rules/newSshKey.rule');
  const NewCredentialRule = require('./rules/newCredential.rule');
  const SuspiciousOauthGrantRule = require('./rules/suspiciousOauthGrant.rule');
  const SecuritySettingChangeRule = require('./rules/securitySettingChange.rule');
  const RapidCredentialCreationRule = require('./rules/rapidCredentialCreation.rule');
  const LoginCredentialAccessRule = require('./rules/loginCredentialAccess.rule');
  const CrossAccountSuspiciousRule = require('./rules/crossAccountSuspicious.rule');

  detectionRuleRegistry.register(new UnfamiliarLoginRule());
  detectionRuleRegistry.register(new NewSshKeyRule());
  detectionRuleRegistry.register(new NewCredentialRule());
  detectionRuleRegistry.register(new SuspiciousOauthGrantRule());
  detectionRuleRegistry.register(new SecuritySettingChangeRule());
  detectionRuleRegistry.register(new RapidCredentialCreationRule());
  detectionRuleRegistry.register(new LoginCredentialAccessRule());
  detectionRuleRegistry.register(new CrossAccountSuspiciousRule());
}

module.exports = { detectionService, initDefaultRules };
