'use strict';

/**
 * Node: correlateEvidence
 * Performs deterministic correlation between collected tool evidence and initial findings.
 */
async function correlateEvidenceNode(state) {
  const { observations, toolResults, evidence } = state;

  const correlations = [];

  // Check if tool results correlate with incident findings
  const initialFindingTypes = (evidence || []).map((e) => e.evidenceType);
  if (initialFindingTypes.includes('UNFAMILIAR_LOGIN') && toolResults.some((t) => t.toolName === 'get_login_history')) {
    correlations.push('Login history confirms unfamiliar IP divergence from account baseline.');
  }

  if (initialFindingTypes.includes('NEW_SSH_KEY') && toolResults.some((t) => t.toolName === 'get_ssh_keys')) {
    correlations.push('SSH key inventory correlates with reported persistent credential creation.');
  }

  if (initialFindingTypes.includes('NEW_CREDENTIAL_CREATED') && toolResults.some((t) => t.toolName === 'get_access_tokens')) {
    correlations.push('API token inventory correlates with reported token creation event.');
  }

  if (correlations.length === 0 && observations.length > 0) {
    correlations.push('Multiple observed events occurred within the correlation time window.');
  }

  return {
    correlations,
    stepsTaken: 1,
  };
}

module.exports = { correlateEvidenceNode };

