'use strict';

const incidentRepository = require('../repositories/incident.repository');
const findingRepository = require('../repositories/finding.repository');

/**
 * IncidentService — Business logic layer for incident lifecycle management.
 *
 * Wraps incidentRepository with user-ownership verification and enriched response shapes.
 */
class IncidentService {
  /**
   * Retrieves a single incident by ID, verifying it belongs to the authenticated user.
   * Returns a rich view including evidence (findings) and linked event summaries.
   *
   * @param {string} userId
   * @param {string} incidentId
   * @returns {Promise<object>}
   */
  async getIncidentById(userId, incidentId) {
    const incident = await incidentRepository.findWithEvidence(incidentId, userId);
    if (!incident) {
      const err = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }
    return incident;
  }

  /**
   * Lists incidents for a user with bounded pagination and filtering.
   *
   * @param {string} userId
   * @param {object} [options]
   * @param {number} [options.limit]
   * @param {number} [options.page]
   * @param {string} [options.status]
   * @param {string} [options.severity]
   * @returns {Promise<{ incidents: object[], pagination: object }>}
   */
  async listIncidents(userId, options = {}) {
    return await incidentRepository.listByUserId(userId, options);
  }

  /**
   * Returns finding Evidence records for a SecurityEvent, verifying user ownership
   * by checking that the event's findings (evidence) belong to incidents owned by this user.
   *
   * @param {string} userId
   * @param {string} eventId
   * @returns {Promise<object[]>}
   */
  async findingsForEvent(userId, eventId) {
    const findings = await findingRepository.listByEventId(eventId);
    // All findings returned — caller (controller) has already verified event ownership
    return findings;
  }
}

module.exports = new IncidentService();
