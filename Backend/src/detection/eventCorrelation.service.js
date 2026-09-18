'use strict';

/**
 * Re:COVER Event Correlation Service
 *
 * Produces structured correlation metadata linking a primary SecurityEvent to
 * related SecurityEvents that share observable criteria.
 *
 * IMPORTANT DISTINCTION:
 * - Correlation identifies OBSERVABLE RELATIONSHIPS between events.
 * - Correlation does NOT make causal inferences (e.g. "attacker did X then Y").
 * - Causal interpretation is left to the human analyst or Task 10 AI Investigator.
 *
 * This service is called by DetectionService after rules have fired and identified
 * related event IDs. It enriches those relationships with structured metadata.
 */
class EventCorrelationService {
  /**
   * Produces correlation metadata for a primary event and its related events.
   *
   * @param {object} primaryEvent - The SecurityEvent being analyzed
   * @param {object[]} relatedEvents - Related SecurityEvent records
   * @param {object} [options]
   * @param {number} [options.windowMinutes] - Time window used for correlation
   * @returns {object} Correlation metadata object
   */
  correlate(primaryEvent, relatedEvents, options = {}) {
    if (!relatedEvents || relatedEvents.length === 0) {
      return {
        primaryEventId: primaryEvent.id,
        relatedEventIds: [],
        correlationCriteria: null,
        correlationNote: 'No related events identified for correlation.',
      };
    }

    const relatedEventIds = relatedEvents.map((e) => e.id);
    const allEvents = [primaryEvent, ...relatedEvents];

    // Compute observable shared criteria
    const sharedAccountIds = this._getSharedValues(allEvents, 'connectedAccountId');
    const sharedSourceIps = this._getSharedValues(allEvents, 'sourceIp');
    const sharedProviders = this._getSharedValues(allEvents, 'provider');

    // Compute time window
    const times = allEvents
      .map((e) => new Date(e.occurredAt || e.createdAt).getTime())
      .filter((t) => !isNaN(t));
    const timeWindowMinutes =
      times.length >= 2
        ? Math.round((Math.max(...times) - Math.min(...times)) / 60000)
        : null;

    // Build event type sequence (ordered by time)
    const sequencePattern = [...allEvents]
      .sort((a, b) => {
        const ta = new Date(a.occurredAt || a.createdAt).getTime();
        const tb = new Date(b.occurredAt || b.createdAt).getTime();
        return ta - tb;
      })
      .map((e) => e.eventType);

    return {
      primaryEventId: primaryEvent.id,
      relatedEventIds,
      correlationCriteria: {
        sameUser: true, // always true — cross-user correlation is not performed
        sharedConnectedAccountIds: Array.from(sharedAccountIds),
        sharedSourceIps: Array.from(sharedSourceIps).filter(Boolean),
        sharedProviders: Array.from(sharedProviders),
        timeWindowMinutes: options.windowMinutes || timeWindowMinutes,
        sequencePattern,
      },
      correlationNote:
        'Events share the same user account and overlapping time window. ' +
        'This is an observable relationship — NOT a causal inference.',
    };
  }

  /**
   * Returns a Set of non-null values for a given field across all events.
   *
   * @param {object[]} events
   * @param {string} field
   * @returns {Set<string>}
   */
  _getSharedValues(events, field) {
    const values = new Set();
    for (const e of events) {
      if (e[field]) values.add(e[field]);
    }
    return values;
  }
}

module.exports = new EventCorrelationService();
