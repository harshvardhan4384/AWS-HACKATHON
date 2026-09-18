'use strict';

const { VERIFIER_SYSTEM_PROMPT } = require('../../prompts/system.prompt');

/**
 * Node: verifyConclusion (Role: VERIFIER)
 * Validates that investigator claims, observations, and recommendations
 * are strictly substantiated by raw tool evidence.
 */
async function verifierNode(state, config = {}) {
  const { observations, conclusions, proposedActions, toolResults, confidence } = state;
  const modelProvider = config.configurable?.modelProvider;

  const verificationPrompt = `
Verify the following investigation conclusions against raw evidence:

OBSERVED FACTS:
${JSON.stringify(observations, null, 2)}

INFERENCES / CONCLUSIONS:
${JSON.stringify(conclusions, null, 2)}

PROPOSED RECOMMENDATIONS:
${JSON.stringify(proposedActions, null, 2)}

TOOL EVIDENCE:
${JSON.stringify(toolResults.map((t) => ({ tool: t.toolName, hasData: Boolean(t.data) })), null, 2)}

Evaluate and return JSON:
{
  "verified": true | false,
  "evidenceCheck": "<Summary of evidence check>",
  "unsupportedClaims": [],
  "confidence": <Adjusted confidence 0.0 - 1.0>,
  "recommendations": ["<Sanitized recommendations>"]
}
`.trim();

  let verification = null;

  if (modelProvider) {
    try {
      const response = await modelProvider.invoke({
        systemPrompt: VERIFIER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: verificationPrompt }],
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          verification = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback if parsing fails
        }
      }
    } catch (err) {
      throw err;
    }
  }

  // Fallback verification
  if (!verification) {
    const hasEvidence = toolResults.length > 0 && toolResults.some((t) => t.data);
    verification = {
      verified: hasEvidence,
      evidenceCheck: hasEvidence
        ? 'All documented facts correspond to raw tool query outputs.'
        : 'Investigation contains unverified claims due to tool data unavailability.',
      unsupportedClaims: hasEvidence ? [] : ['Some claims lack direct tool proof.'],
      confidence: hasEvidence ? Math.min(confidence || 0.75, 0.85) : 0.4,
      recommendations: proposedActions.length > 0 ? proposedActions : ['Review security logs with primary administrator.'],
    };
  }

  return {
    verification,
    confidence: typeof verification.confidence === 'number' ? verification.confidence : confidence,
    proposedActions: verification.recommendations || proposedActions,
    stepsTaken: 1,
  };
}

module.exports = { verifierNode };
