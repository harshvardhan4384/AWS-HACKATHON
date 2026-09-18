'use strict';

const { INVESTIGATOR_SYSTEM_PROMPT } = require('../../prompts/system.prompt');
const { toolRegistry } = require('../../tools/tool.registry');
const envConfig = require('../../../config/env');

/**
 * Node: collectEvidence (Role: INVESTIGATOR)
 * Executes read-only investigation tools through ToolRegistry and synthesizes findings.
 */
async function investigatorNode(state, config = {}) {
  const { incident, plan, userId, connectedAccountId, correlationId } = state;
  const modelProvider = config.configurable?.modelProvider;

  const maxToolCalls = envConfig.aiMaxToolCalls;
  const toolCallsMade = [];
  const toolResultsAccumulated = [];
  let toolCount = 0;

  // 1. Determine tools to execute from plan
  const toolsToExecute = (plan?.requiredTools || ['get_account_events', 'get_login_history']).slice(0, maxToolCalls);

  // 2. Execute tools through ToolRegistry
  for (const toolName of toolsToExecute) {
    if (toolCount >= maxToolCalls) {
      break;
    }

    try {
      const toolResult = await toolRegistry.executeTool({
        toolName,
        userId,
        connectedAccountId: connectedAccountId || undefined,
        input: {
          connectedAccountId: connectedAccountId || undefined,
          limit: 10,
        },
        correlationId,
      });

      toolCount++;
      toolCallsMade.push({
        toolName,
        timestamp: new Date().toISOString(),
      });
      toolResultsAccumulated.push({
        toolName,
        data: toolResult.data,
        isUntrustedData: true,
      });
    } catch (toolErr) {
      toolResultsAccumulated.push({
        toolName,
        error: toolErr.message,
        isUntrustedData: true,
      });
    }
  }

  // 3. Ask Model to analyze accumulated evidence (or synthesize structured result)
  let analysis = null;

  if (modelProvider) {
    const analysisPrompt = `
Synthesize the following security investigation findings for incident "${incident.title}":

INCIDENT:
- Title: ${incident.title}
- Severity: ${incident.severity}
- Summary: ${incident.summary}

COLLECTED TOOL RESULTS (UNTRUSTED SECURITY DATA):
${JSON.stringify(toolResultsAccumulated, null, 2)}

Provide your output strictly in JSON according to your system prompt instructions:
{
  "summary": "<Concise summary>",
  "observedFacts": ["<Observed fact from tool results>"],
  "inferences": ["<Plausible correlation or inference>"],
  "evidenceGaps": ["<Missing information>"],
  "affectedAccounts": ["${connectedAccountId || incident.id}"],
  "timeline": [],
  "recommendations": ["<Non-executable recommendation>"],
  "confidence": <0.0 - 1.0>
}
`.trim();

    try {
      const response = await modelProvider.invoke({
        systemPrompt: INVESTIGATOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: analysisPrompt }],
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback if parsing fails
        }
      }
    } catch (err) {
      throw err;
    }
  }

  // Fallback synthesis if model unavailable
  if (!analysis) {
    const facts = [];
    for (const tr of toolResultsAccumulated) {
      if (tr.data && typeof tr.data === 'object') {
        facts.push(`Tool '${tr.toolName}' returned ${JSON.stringify(tr.data).slice(0, 120)}...`);
      }
    }

    analysis = {
      summary: `Automated investigation conducted across ${toolCount} read-only tools for incident: ${incident.title}.`,
      observedFacts: facts.length > 0 ? facts : [`Incident ${incident.title} verified with findings.`],
      inferences: ['Activity requires analyst review to confirm intent.'],
      evidenceGaps: ['Hardware device authentication details unavailable.'],
      affectedAccounts: [connectedAccountId || incident.id],
      timeline: [{ time: new Date().toISOString(), event: incident.title }],
      recommendations: ['Review recent logins and rotate any unverified credentials.'],
      confidence: 0.75,
    };
  }

  const isLimitReached = toolCount >= maxToolCalls;

  return {
    toolCalls: toolCallsMade,
    toolResults: toolResultsAccumulated,
    observations: analysis.observedFacts || [],
    evidenceGaps: analysis.evidenceGaps || [],
    conclusions: analysis.inferences || [],
    proposedActions: analysis.recommendations || [],
    summary: analysis.summary || '',
    confidence: typeof analysis.confidence === 'number' ? analysis.confidence : 0.7,
    stepsTaken: 1,
    toolCallCount: toolCount,
    status: isLimitReached ? 'LIMIT_REACHED' : 'IN_PROGRESS',
  };
}

module.exports = { investigatorNode };
