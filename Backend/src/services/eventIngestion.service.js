'use strict';

const connectedAccountRepository = require('../repositories/connectedAccount.repository');
const securityEventRepository = require('../repositories/securityEvent.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { eventAdapterRegistry } = require('../adapters/events/eventAdapter.registry');
const { PROVIDERS } = require('../utils/taxonomy');

/**
 * Service orchestrating secure ingestion, normalization, and deduplication
 * of provider security and activity events.
 */
class EventIngestionService {
  /**
   * Ingests a raw provider event with strict ownership verification, provider matching,
   * canonical normalization, and atomic deduplication.
   *
   * @param {object} params
   * @param {string} params.userId - Authenticated user ID
   * @param {'GOOGLE'|'GITHUB'|'AWS'} params.provider - Provider name
   * @param {string} params.connectedAccountId - ConnectedAccount ID
   * @param {object} params.rawEvent - Raw event payload
   * @returns {Promise<{ status: 'INGESTED'|'DUPLICATE', event: object }>}
   */
  async ingestEvent({ userId, provider, connectedAccountId, rawEvent }) {
    // 1. Verify ConnectedAccount exists and belongs to the authenticated user
    const connectedAccount = await connectedAccountRepository.findById(connectedAccountId);

    if (!connectedAccount || connectedAccount.userId !== userId) {
      await auditLogRepository.create({
        userId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'EVENT_INGESTION_REJECTED',
        targetType: 'ConnectedAccount',
        targetId: connectedAccountId,
        result: 'FAILURE',
        metadata: {
          reason: 'Connected account not found or access denied',
          provider,
        },
      });

      const err = new Error('Connected account not found or access denied');
      err.statusCode = 403;
      throw err;
    }

    // 2. Enforce provider match between ConnectedAccount and payload
    if (connectedAccount.provider.toUpperCase() !== provider.toUpperCase()) {
      await auditLogRepository.create({
        userId,
        actorType: 'USER',
        actorId: userId,
        actionType: 'EVENT_INGESTION_REJECTED',
        targetType: 'ConnectedAccount',
        targetId: connectedAccountId,
        result: 'FAILURE',
        metadata: {
          reason: 'Provider mismatch',
          accountProvider: connectedAccount.provider,
          eventProvider: provider,
        },
      });

      const err = new Error(
        `Connected account provider '${connectedAccount.provider}' does not match event provider '${provider}'`
      );
      err.statusCode = 400;
      throw err;
    }

    // 3. Resolve provider adapter
    const adapter = eventAdapterRegistry.get(provider);
    if (!adapter) {
      const err = new Error(`Unsupported event provider: ${provider}`);
      err.statusCode = 400;
      throw err;
    }

    // 4. Validate raw payload
    const validation = adapter.validate(rawEvent);
    if (!validation.valid) {
      const err = new Error(`Invalid event payload: ${validation.errors.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    // 5. Canonical Normalization
    const normalized = adapter.normalize(rawEvent, { connectedAccount });

    // 6. Idempotent persistence
    const { event, isDuplicate } = await securityEventRepository.create({
      userId,
      connectedAccountId,
      provider: normalized.provider,
      eventType: normalized.eventType,
      providerEventId: normalized.providerEventId,
      occurredAt: normalized.occurredAt,
      severity: normalized.severity,
      status: 'NORMALIZED',
      eventData: normalized.eventData,
      sourceIp: normalized.sourceIp,
      deviceMetadata: normalized.deviceMetadata,
      locationMetadata: normalized.locationMetadata,
    });

    // 7. Structured Audit Logging
    await auditLogRepository.create({
      userId,
      actorType: 'PROVIDER',
      actorId: provider,
      actionType: isDuplicate ? 'EVENT_DUPLICATE' : 'EVENT_INGESTED',
      targetType: 'SecurityEvent',
      targetId: event.id,
      result: 'SUCCESS',
      metadata: {
        provider,
        eventType: event.eventType,
        providerEventId: event.providerEventId,
        severity: event.severity,
        isDuplicate,
      },
    });

    return {
      status: isDuplicate ? 'DUPLICATE' : 'INGESTED',
      event,
    };
  }

  /**
   * Simulates an AWS CloudTrail security event for testing and Hackathon demonstration.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.connectedAccountId
   * @param {string} [params.scenario='CONSOLE_LOGIN']
   * @param {object} [params.options={}]
   * @returns {Promise<{ status: 'INGESTED'|'DUPLICATE', event: object }>}
   */
  async simulateAwsEvent({ userId, connectedAccountId, scenario = 'CONSOLE_LOGIN', options = {} }) {
    const awsAdapter = eventAdapterRegistry.get(PROVIDERS.AWS);
    if (!awsAdapter) {
      const err = new Error('AWS adapter is not registered');
      err.statusCode = 500;
      throw err;
    }

    const rawEvent = awsAdapter.generateSimulatedPayload(scenario, options);

    return await this.ingestEvent({
      userId,
      provider: PROVIDERS.AWS,
      connectedAccountId,
      rawEvent,
    });
  }

  /**
   * Retrieves a single SecurityEvent ensuring strict tenant isolation.
   *
   * @param {string} userId
   * @param {string} eventId
   * @returns {Promise<object>}
   */
  async getEventById(userId, eventId) {
    const event = await securityEventRepository.findById(eventId);
    if (!event || event.userId !== userId) {
      const err = new Error('Security event not found');
      err.statusCode = 404;
      throw err;
    }
    return event;
  }

  /**
   * Lists security events for a user with bounded pagination and filtering.
   *
   * @param {string} userId
   * @param {object} queryOptions
   * @returns {Promise<{ events: Array<object>, pagination: object }>}
   */
  async listEvents(userId, queryOptions) {
    return await securityEventRepository.listByUserId(userId, queryOptions);
  }
}

module.exports = new EventIngestionService();

