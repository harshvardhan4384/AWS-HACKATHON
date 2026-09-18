'use strict';

/**
 * BaseModelProvider — Abstract base class for model providers.
 *
 * Provides a uniform contract for calling models with and without tool configurations.
 * Allows switching between AWS Bedrock Runtime Converse API, Mock providers (for testing),
 * and future LLM providers without altering agent logic.
 */
class BaseModelProvider {
  /**
   * @param {object} [options]
   * @param {string} options.modelId - Model identifier (e.g. 'anthropic.claude-3-5-sonnet-20241022-v2:0')
   * @param {string} options.providerName - Provider name (e.g. 'AWS_BEDROCK')
   */
  constructor({ modelId, providerName }) {
    if (new.target === BaseModelProvider) {
      throw new TypeError('Cannot instantiate abstract class BaseModelProvider directly');
    }
    this.modelId = modelId;
    this.providerName = providerName;
  }

  /**
   * Invokes the model with text messages and system instructions.
   *
   * @param {object} params
   * @param {string} params.systemPrompt - System instructions
   * @param {Array<{ role: 'user'|'assistant', content: string|Array }>} params.messages - Message history
   * @param {object} [params.inferenceConfig] - { maxTokens, temperature }
   * @returns {Promise<{ text: string, stopReason: string, usage: object }>}
   * @abstract
   */
  async invoke(params) { // eslint-disable-line no-unused-vars
    throw new Error(`invoke() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Invokes the model with tool specifications enabled (Converse API tool use).
   *
   * @param {object} params
   * @param {string} params.systemPrompt - System instructions
   * @param {Array<{ role: 'user'|'assistant', content: string|Array }>} params.messages - Message history
   * @param {Array<object>} params.tools - Tool specifications
   * @param {object} [params.inferenceConfig] - { maxTokens, temperature }
   * @returns {Promise<{
   *   text: string|null,
   *   toolCalls: Array<{ toolUseId: string, name: string, input: object }>,
   *   stopReason: string,
   *   usage: object
   * }>}
   * @abstract
   */
  async invokeWithTools(params) { // eslint-disable-line no-unused-vars
    throw new Error(`invokeWithTools() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = BaseModelProvider;

