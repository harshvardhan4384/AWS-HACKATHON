'use strict';

const { detectionService } = require('../detection/detection.service');

/**
 * Service managing event processing lifecycle and status transitions.
 * Serves as the clean architecture boundary separating Event Ingestion (Task 8)
 * from the Risk Engine & AI Detection pipeline (Task 9).
 */
class EventProcessingService {
  /**
   * Processes a normalized security event by triggering the Task 9 Detection & Risk Engine pipeline.
   *
   * @param {string} userId
   * @param {string} eventId
   * @returns {Promise<object>} Detection result
   */
  async processNormalizedEvent(userId, eventId) {
    return await detectionService.detect(userId, eventId);
  }
}

module.exports = new EventProcessingService();
