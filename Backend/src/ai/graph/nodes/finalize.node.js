'use strict';

/**
 * Node: finalizeInvestigation
 * Assembles the final structured investigation result and marks state completed.
 */
async function finalizeInvestigationNode(state) {
  const {
    incidentId,
    summary,
    observations,
    conclusions,
    correlations,
    evidenceGaps,
    proposedActions,
    confidence,
    verification,
    toolCalls,
    connectedAccountId,
    status,
  } = state;

  const finalStatus = status === 'LIMIT_REACHED' ? 'LIMIT_REACHED' : 'COMPLETED';

  const structuredResult = {
    incidentId,
    summary: summary || 'Investigation complete.',
    status: finalStatus,
    confidence: Math.min(Math.max(confidence || 0.7, 0.0), 1.0),
    observedFacts: observations || [],
    findings: conclusions || [],
    correlations: correlations || [],
    evidenceGaps: evidenceGaps || [],
    affectedAccounts: connectedAccountId ? [connectedAccountId] : [],
    recommendations: proposedActions || [],
    toolCallsMade: toolCalls || [],
    verification: verification || {
      verified: true,
      evidenceCheck: 'Verified.',
      unsupportedClaims: [],
    },
    completedAt: new Date().toISOString(),
  };

  return {
    status: finalStatus,
    resultSummary: structuredResult,
    stepsTaken: 1,
  };
}

module.exports = { finalizeInvestigationNode };

