'use strict';

const { PLANNER_SYSTEM_PROMPT } = require('../../prompts/system.prompt');
const { toolRegistry } = require('../../tools/tool.registry');

/**
 * Node: planInvestigation (Role: PLANNER)
 * Generates a structured investigation plan specifying objectives and required tools.
 */
async function plannerNode(state, config = {}) {
  const { incident, evidence } = state;
  const modelProvider = config.configurable?.modelProvider;

  const toolsSummary = toolRegistry.list().map((t) => ({
    name: t.name,
    description: t.description,
  }));

  const userPrompt = `
Analyze the following security incident and propose an investigation plan:

INCIDENT:
- ID: ${incident.id}
- Title: ${incident.title}
- Severity: ${incident.severity}
- Summary: ${incident.summary || 'None provided'}
- Detection Source: ${incident.detectionSource || 'RULE_MATCH'}

FINDINGS (EVIDENCE):
${JSON.stringify(
  (evidence || []).map((e) => ({
    type: e.evidenceType,
    confidence: e.confidence,
    summary: e.evidenceData?.summary || e.evidenceType,
  })),
  null,
  2
)}

AVAILABLE READ-ONLY TOOLS:
${JSON.stringify(toolsSummary, null, 2)}

Provide your investigation plan in JSON format with "objectives", "priority", and "requiredTools".
`.trim();

  let plan = null;

  if (modelProvider) {
    try {
      const response = await modelProvider.invoke({
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Extract JSON from response text
      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          plan = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback if parsing fails
        }
      }
    } catch (err) {
      throw err;
    }
  }

  // Fallback heuristic plan if model response is unavailable
  if (!plan || !Array.isArray(plan.objectives)) {
    const requiredTools = ['get_account_events', 'get_login_history'];
    if (incident.title?.toLowerCase().includes('ssh')) {
      requiredTools.push('get_ssh_keys');
    }
    if (incident.title?.toLowerCase().includes('token') || incident.title?.toLowerCase().includes('credential')) {
      requiredTools.push('get_access_tokens');
    }
    if (incident.title?.toLowerCase().includes('repo')) {
      requiredTools.push('get_repository_activity');
    }

    plan = {
      objectives: [
        `Investigate root cause of incident: ${incident.title}`,
        'Verify recent login history for unfamiliar IP addresses',
        'Inspect credentials and active authorizations',
      ],
      priority: incident.severity || 'MEDIUM',
      requiredTools,
    };
  }

  return {
    plan,
    stepsTaken: 1,
  };
}

module.exports = { plannerNode };
