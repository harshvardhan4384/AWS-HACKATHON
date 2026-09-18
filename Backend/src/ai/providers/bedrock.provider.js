'use strict';

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const BaseModelProvider = require('./base.modelProvider');
const config = require('../../config/env');

/**
 * BedrockModelProvider — Official AWS Bedrock Runtime Converse API implementation.
 *
 * Official Reference:
 * https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
 * https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html
 *
 * Uses the AWS SDK for JavaScript v3 standard credential provider chain.
 * Never logs credentials, secrets, or raw provider tokens.
 */
class BedrockModelProvider extends BaseModelProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.region]
   * @param {string} [options.modelId]
   * @param {number} [options.timeoutMs]
   */
  constructor(options = {}) {
    const modelId = options.modelId || config.bedrockModelId;
    super({ modelId, providerName: 'AWS_BEDROCK' });

    this.region = options.region || config.awsRegion;
    this.timeoutMs = options.timeoutMs || config.bedrockTimeoutMs;

    // Initialize BedrockRuntimeClient with standard AWS SDK credential provider chain
    this.client = new BedrockRuntimeClient({
      region: this.region,
    });
  }

  /**
   * Translates abstract messages to Converse API message format.
   *
   * @param {Array<{ role: string, content: any }>} messages
   * @returns {Array<object>}
   * @private
   */
  _formatConverseMessages(messages) {
    return messages.map((msg) => {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';

      if (typeof msg.content === 'string') {
        return {
          role,
          content: [{ text: msg.content }],
        };
      }

      if (Array.isArray(msg.content)) {
        const formattedContent = msg.content.map((item) => {
          if (item.text) {
            return { text: item.text };
          }
          if (item.toolUse) {
            return {
              toolUse: {
                toolUseId: item.toolUse.toolUseId,
                name: item.toolUse.name,
                input: item.toolUse.input || {},
              },
            };
          }
          if (item.toolResult) {
            return {
              toolResult: {
                toolUseId: item.toolResult.toolUseId,
                content: [
                  item.toolResult.content && typeof item.toolResult.content === 'object'
                    ? { json: item.toolResult.content }
                    : { text: String(item.toolResult.content || '') },
                ],
                status: item.toolResult.status === 'error' ? 'error' : 'success',
              },
            };
          }
          return { text: JSON.stringify(item) };
        });

        return { role, content: formattedContent };
      }

      return { role, content: [{ text: String(msg.content || '') }] };
    });
  }

  /**
   * Invokes the model without tool capabilities.
   *
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {Array} params.messages
   * @param {object} [params.inferenceConfig]
   * @returns {Promise<{ text: string, stopReason: string, usage: object }>}
   */
  async invoke({ systemPrompt, messages, inferenceConfig = {} }) {
    const converseMessages = this._formatConverseMessages(messages);
    const system = systemPrompt ? [{ text: systemPrompt }] : undefined;

    const commandInput = {
      modelId: this.modelId,
      messages: converseMessages,
      system,
      inferenceConfig: {
        maxTokens: inferenceConfig.maxTokens || config.bedrockMaxTokens,
        temperature: inferenceConfig.temperature ?? config.bedrockTemperature,
      },
    };

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const command = new ConverseCommand(commandInput);
      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutHandle);

      const content = response.output?.message?.content || [];
      const text = content.map((c) => c.text).filter(Boolean).join('\n');

      return {
        text,
        stopReason: response.stopReason || 'end_turn',
        usage: response.usage || {},
      };
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Bedrock invocation timed out after ${this.timeoutMs}ms`);
        timeoutErr.code = 'TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    }
  }

  /**
   * Invokes the model with Converse tool configuration.
   *
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {Array} params.messages
   * @param {Array<object>} params.tools - Array of Bedrock tool specs: { toolSpec: { name, description, inputSchema: { json } } }
   * @param {object} [params.inferenceConfig]
   * @returns {Promise<{
   *   text: string|null,
   *   toolCalls: Array<{ toolUseId: string, name: string, input: object }>,
   *   stopReason: string,
   *   usage: object
   * }>}
   */
  async invokeWithTools({ systemPrompt, messages, tools = [], inferenceConfig = {} }) {
    const converseMessages = this._formatConverseMessages(messages);
    const system = systemPrompt ? [{ text: systemPrompt }] : undefined;

    // Format tool specifications for Converse API
    const formattedTools = tools.map((t) => {
      if (t.toolSpec) return t;
      return {
        toolSpec: {
          name: t.name,
          description: t.description || '',
          inputSchema: {
            json: t.inputSchema || { type: 'object', properties: {} },
          },
        },
      };
    });

    const commandInput = {
      modelId: this.modelId,
      messages: converseMessages,
      system,
      inferenceConfig: {
        maxTokens: inferenceConfig.maxTokens || config.bedrockMaxTokens,
        temperature: inferenceConfig.temperature ?? config.bedrockTemperature,
      },
      toolConfig: formattedTools.length > 0 ? { tools: formattedTools } : undefined,
    };

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const command = new ConverseCommand(commandInput);
      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutHandle);

      const content = response.output?.message?.content || [];
      const textParts = [];
      const toolCalls = [];

      for (const item of content) {
        if (item.text) {
          textParts.push(item.text);
        }
        if (item.toolUse) {
          toolCalls.push({
            toolUseId: item.toolUse.toolUseId,
            name: item.toolUse.name,
            input: item.toolUse.input || {},
          });
        }
      }

      return {
        text: textParts.length > 0 ? textParts.join('\n') : null,
        toolCalls,
        stopReason: response.stopReason || (toolCalls.length > 0 ? 'tool_use' : 'end_turn'),
        usage: response.usage || {},
      };
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Bedrock invocation timed out after ${this.timeoutMs}ms`);
        timeoutErr.code = 'TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    }
  }
}

module.exports = BedrockModelProvider;

