'use strict';

const BaseModelProvider = require('./base.modelProvider');

/**
 * MockModelProvider — Deterministic mock provider for tests and offline development.
 *
 * Can be configured with custom handlers or simulate realistic investigation flows:
 * 1. Planner invocation -> returns structured plan JSON
 * 2. Investigator with tools -> calls appropriate investigation tools, then produces findings
 * 3. Verifier -> verifies conclusions against facts and outputs structured verification
 */
class MockModelProvider extends BaseModelProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.modelId='mock-claude-3-5-sonnet']
   * @param {Function} [options.invokeHandler]
   * @param {Function} [options.invokeWithToolsHandler]
   */
  constructor(options = {}) {
    super({
      modelId: options.modelId || 'mock-claude-3-5-sonnet',
      providerName: 'MOCK_PROVIDER',
    });
    this.invokeHandler = options.invokeHandler || null;
    this.invokeWithToolsHandler = options.invokeWithToolsHandler || null;
    this.callCount = 0;
    this.recordedCalls = [];
  }

  async invoke(params) {
    this.callCount++;
    this.recordedCalls.push({ type: 'invoke', params });

    if (this.invokeHandler) {
      return await this.invokeHandler(params);
    }

    // Default mock response: returns JSON or plain text depending on prompt
    const lastMessage = params.messages[params.messages.length - 1]?.content || '';
    const lastText = typeof lastMessage === 'string' ? lastMessage : JSON.stringify(lastMessage);

    if (lastText.includes('investigation plan') || params.systemPrompt?.includes('Planner')) {
      return {
        text: JSON.stringify({
          objectives: [
            'Inspect recent login history for unfamiliar IP patterns',
            'Check for newly created SSH keys and API tokens',
            'Verify repository activity following credentials',
          ],
          priority: 'HIGH',
          requiredTools: [
            'get_login_history',
            'get_ssh_keys',
            'get_access_tokens',
            'get_repository_activity',
          ],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 150, outputTokens: 90, totalTokens: 240 },
      };
    }

    if (params.systemPrompt?.includes('Verifier')) {
      return {
        text: JSON.stringify({
          verified: true,
          evidenceCheck: 'All conclusions correspond to verified events in the database.',
          unsupportedClaims: [],
          confidence: 0.85,
          recommendations: [
            'Review newly added SSH keys on the connected provider account.',
            'Terminate active sessions originating from the unfamiliar IP.',
          ],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
      };
    }

    if (params.systemPrompt?.includes('INVESTIGATOR') || params.systemPrompt?.includes('Investigator') || lastText.includes('security investigation findings')) {
      return {
        text: JSON.stringify({
          summary: 'Investigation indicates an unfamiliar login was followed by credential generation.',
          observedFacts: [
            'Login observed from an IP not seen in the 30-day baseline.',
            'Personal access token was generated shortly after login.',
          ],
          inferences: [
            'Observed sequence is consistent with a credential persistence attempt.',
          ],
          evidenceGaps: [
            'Device fingerprint and client hardware details were unavailable.',
          ],
          recommendations: [
            'Audit and revoke unrecognized API tokens on the provider account.',
            'Enable multi-factor authentication if disabled.',
          ],
          confidence: 0.85,
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 300, outputTokens: 120, totalTokens: 420 },
      };
    }

    return {
      text: 'Mock response from AI model.',
      stopReason: 'end_turn',
      usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
    };
  }

  async invokeWithTools(params) {
    this.callCount++;
    this.recordedCalls.push({ type: 'invokeWithTools', params });

    if (this.invokeWithToolsHandler) {
      return await this.invokeWithToolsHandler(params);
    }

    // Check if tools were already executed in message history
    const hasToolResult = params.messages.some((m) =>
      Array.isArray(m.content) && m.content.some((c) => c.toolResult)
    );

    if (!hasToolResult) {
      // First round: ask to execute a tool (e.g. get_login_history)
      return {
        text: null,
        toolCalls: [
          {
            toolUseId: `mock_tool_use_${Date.now()}`,
            name: 'get_login_history',
            input: { limit: 10 },
          },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240 },
      };
    }

    // Second round (tool results are present): return synthesized investigation findings
    return {
      text: JSON.stringify({
        summary: 'Investigation indicates an unfamiliar login was followed by credential generation.',
        observedFacts: [
          'Login observed from an IP not seen in the 30-day baseline.',
          'Personal access token was generated shortly after login.',
        ],
        inferences: [
          'Observed sequence is consistent with a credential persistence attempt.',
        ],
        evidenceGaps: [
          'Device fingerprint and client hardware details were unavailable.',
        ],
        recommendations: [
          'Audit and revoke unrecognized API tokens on the provider account.',
          'Enable multi-factor authentication if disabled.',
        ],
      }),
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 350, outputTokens: 120, totalTokens: 470 },
    };
  }
}

module.exports = MockModelProvider;
