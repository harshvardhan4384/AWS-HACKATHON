#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/964f1b02caadd7954d02f029a806a5aea34be87723a67d02040d1ccda37d2eee/contract';
import endContract from '../../snapshots/964f1b02caadd7954d02f029a806a5aea34be87723a67d02040d1ccda37d2eee/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'agentRun',
        columns: [
          col('agentType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('completedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('correlationId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('modelId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('modelProvider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resultSummary', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('startedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('triggerSource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'agentRun_agentType_check_b5485c07',
            "\"agentType\" IN ('ORCHESTRATOR', 'PLANNER', 'INVESTIGATOR', 'VERIFIER')",
          ),
          checkExpression(
            'agentRun_status_check_4cbea06c',
            "\"status\" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'approval',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('decidedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('decisionMetadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('expiresAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recoveryActionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requestedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'approval_status_check_fcf6234d',
            "\"status\" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'auditLog',
        columns: [
          col('actionType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('actorType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('correlationId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('occurredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('result', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('targetId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('targetType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'auditLog_actorType_check_af47c96a',
            "\"actorType\" IN ('USER', 'SYSTEM', 'AGENT', 'PROVIDER')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'connectedAccount',
        columns: [
          col('accessTokenCiphertext', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('grantedScopes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastSyncAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerAccountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerDisplayName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('refreshTokenCiphertext', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'connectedAccount_provider_check_9bb84945',
            "\"provider\" IN ('GOOGLE', 'GITHUB', 'AWS')",
          ),
          checkExpression(
            'connectedAccount_status_check_0f2376c6',
            "\"status\" IN ('ACTIVE', 'INACTIVE', 'REVOKED', 'ERROR')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'evidence',
        columns: [
          col('confidence', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('eventId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('evidenceData', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('evidenceType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'evidence_source_check_a292e1e9',
            "\"source\" IN ('GOOGLE', 'GITHUB', 'AWS')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'incident',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('detectionSource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resolvedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('severity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('summary', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'incident_severity_check_10d91c56',
            "\"severity\" IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')",
          ),
          checkExpression(
            'incident_status_check_e5ef0348',
            "\"status\" IN ('OPEN', 'INVESTIGATING', 'CONTAINMENT_REQUIRED', 'RECOVERY_REQUIRED', 'VERIFYING', 'RESOLVED', 'CLOSED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'recoveryAction',
        columns: [
          col('actionType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('connectedAccountId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('executedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('proposedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('providerResult', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('riskLevel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PROPOSED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('verificationStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('verifiedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'recoveryAction_actionType_check_a6d3d2ee',
            "\"actionType\" IN ('REVOKE_OAUTH', 'REVOKE_TOKEN', 'REMOVE_SSH_KEY', 'TERMINATE_SESSION', 'DISABLE_INTEGRATION', 'ROTATE_CREDENTIAL', 'SECURITY_CONFIG')",
          ),
          checkExpression(
            'recoveryAction_riskLevel_check_485116de',
            "\"riskLevel\" IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')",
          ),
          checkExpression(
            'recoveryAction_status_check_396632df',
            "\"status\" IN ('PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'securityEvent',
        columns: [
          col('connectedAccountId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('deviceMetadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('eventData', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('eventType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('locationMetadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('occurredAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerEventId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('severity', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sourceIp', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('RAW'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'securityEvent_provider_check_9bb84945',
            "\"provider\" IN ('GOOGLE', 'GITHUB', 'AWS')",
          ),
          checkExpression(
            'securityEvent_severity_check_10d91c56',
            "\"severity\" IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')",
          ),
          checkExpression(
            'securityEvent_status_check_2e7f7fff',
            "\"status\" IN ('RAW', 'NORMALIZED', 'ANALYZED', 'CORRELATED', 'DISMISSED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('displayName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'user_status_check_0f2376c6',
            "\"status\" IN ('ACTIVE', 'INACTIVE', 'REVOKED', 'ERROR')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'connectedAccount',
        constraint: 'connectedAccount_userId_provider_providerAccountId_key',
        columns: ['userId', 'provider', 'providerAccountId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'securityEvent',
        constraint: 'securityEvent_connectedAccountId_providerEventId_key',
        columns: ['connectedAccountId', 'providerEventId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'agentRun',
        index: 'agentRun_agentType_idx_d542af70',
        columns: ['agentType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'agentRun',
        index: 'agentRun_correlationId_idx_d20f6416',
        columns: ['correlationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'agentRun',
        index: 'agentRun_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'agentRun',
        index: 'agentRun_incidentId_idx_20b6f3c9',
        columns: ['incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'agentRun',
        index: 'agentRun_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'agentRun',
        index: 'agentRun_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_incidentId_idx_20b6f3c9',
        columns: ['incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_recoveryActionId_idx_44a41b4e',
        columns: ['recoveryActionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_status_expiresAt_idx_c206f415',
        columns: ['status', 'expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_actionType_idx_591ddff2',
        columns: ['actionType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_actorType_idx_fc3b1214',
        columns: ['actorType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_correlationId_idx_d20f6416',
        columns: ['correlationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_incidentId_idx_20b6f3c9',
        columns: ['incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_occurredAt_idx_c6b89167',
        columns: ['occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_userId_occurredAt_idx_9003f3bb',
        columns: ['userId', 'occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'connectedAccount',
        index: 'connectedAccount_provider_idx_faf3af28',
        columns: ['provider'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'connectedAccount',
        index: 'connectedAccount_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'connectedAccount',
        index: 'connectedAccount_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'evidence',
        index: 'evidence_eventId_idx_6a266d47',
        columns: ['eventId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'evidence',
        index: 'evidence_evidenceType_idx_8769f28a',
        columns: ['evidenceType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'evidence',
        index: 'evidence_incidentId_idx_20b6f3c9',
        columns: ['incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_severity_idx_5b070f41',
        columns: ['severity'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_startedAt_idx_cac56236',
        columns: ['startedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_userId_status_idx_e4a128ba',
        columns: ['userId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryAction',
        index: 'recoveryAction_actionType_idx_591ddff2',
        columns: ['actionType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryAction',
        index: 'recoveryAction_connectedAccountId_idx_2443fc65',
        columns: ['connectedAccountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryAction',
        index: 'recoveryAction_incidentId_idx_20b6f3c9',
        columns: ['incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryAction',
        index: 'recoveryAction_riskLevel_idx_c37d366a',
        columns: ['riskLevel'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryAction',
        index: 'recoveryAction_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_connectedAccountId_idx_2443fc65',
        columns: ['connectedAccountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_eventType_idx_e4cf7742',
        columns: ['eventType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_incidentId_idx_20b6f3c9',
        columns: ['incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_occurredAt_idx_c6b89167',
        columns: ['occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_provider_idx_faf3af28',
        columns: ['provider'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_severity_idx_5b070f41',
        columns: ['severity'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'securityEvent',
        index: 'securityEvent_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'agentRun',
        foreignKey: {
          name: 'agentRun_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'agentRun',
        foreignKey: {
          name: 'agentRun_incidentId_fkey',
          columns: ['incidentId'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'approval',
        foreignKey: {
          name: 'approval_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'approval',
        foreignKey: {
          name: 'approval_incidentId_fkey',
          columns: ['incidentId'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'approval',
        foreignKey: {
          name: 'approval_recoveryActionId_fkey',
          columns: ['recoveryActionId'],
          references: { schema: 'public', table: 'recoveryAction', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auditLog',
        foreignKey: {
          name: 'auditLog_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auditLog',
        foreignKey: {
          name: 'auditLog_incidentId_fkey',
          columns: ['incidentId'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'connectedAccount',
        foreignKey: {
          name: 'connectedAccount_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'evidence',
        foreignKey: {
          name: 'evidence_incidentId_fkey',
          columns: ['incidentId'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'evidence',
        foreignKey: {
          name: 'evidence_eventId_fkey',
          columns: ['eventId'],
          references: { schema: 'public', table: 'securityEvent', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incident',
        foreignKey: {
          name: 'incident_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryAction',
        foreignKey: {
          name: 'recoveryAction_incidentId_fkey',
          columns: ['incidentId'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryAction',
        foreignKey: {
          name: 'recoveryAction_connectedAccountId_fkey',
          columns: ['connectedAccountId'],
          references: { schema: 'public', table: 'connectedAccount', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'securityEvent',
        foreignKey: {
          name: 'securityEvent_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'securityEvent',
        foreignKey: {
          name: 'securityEvent_connectedAccountId_fkey',
          columns: ['connectedAccountId'],
          references: { schema: 'public', table: 'connectedAccount', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'securityEvent',
        foreignKey: {
          name: 'securityEvent_incidentId_fkey',
          columns: ['incidentId'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
