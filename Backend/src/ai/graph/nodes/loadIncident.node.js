'use strict';

const incidentRepository = require('../../../repositories/incident.repository');

/**
 * Node: loadIncident
 * Loads the target Incident, verified findings (Evidence), and linked event context.
 */
async function loadIncidentNode(state) {
  const { incidentId, userId } = state;

  const incident = await incidentRepository.findWithEvidence(incidentId, userId);
  if (!incident) {
    throw new Error(`Incident '${incidentId}' not found or access denied for user '${userId}'`);
  }

  // Derive connectedAccountId from linked events if available
  let connectedAccountId = null;
  if (incident.linkedEvents && incident.linkedEvents.length > 0) {
    const firstEvent = incident.linkedEvents[0];
    connectedAccountId = firstEvent.connectedAccountId || null;
  }

  // Fallback: check evidence records for event references
  if (!connectedAccountId && incident.evidence && incident.evidence.length > 0) {
    for (const ev of incident.evidence) {
      if (ev.evidenceData?.connectedAccountId) {
        connectedAccountId = ev.evidenceData.connectedAccountId;
        break;
      }
    }
  }

  // Fallback 2: check user's connected accounts
  if (!connectedAccountId) {
    const connectedAccountRepository = require('../../../repositories/connectedAccount.repository');
    const userAccounts = await connectedAccountRepository.listByUserId(userId);
    if (userAccounts && userAccounts.length > 0) {
      connectedAccountId = userAccounts[0].id;
    }
  }

  return {
    incident,
    evidence: incident.evidence || [],
    connectedAccountId,
    stepsTaken: 1,
  };
}

module.exports = { loadIncidentNode };
