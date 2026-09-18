'use strict';

const { z } = require('zod');

/**
 * BaseTool — Abstract base class for all Re:COVER investigation tools.
 *
 * ALL Task 10 investigation tools are strictly READ-ONLY.
 * Tools NEVER modify database or external provider security states.
 */
class BaseTool {
  /**
   * @param {object} config
   * @param {string} config.name - Tool identifier (e.g. 'get_login_history')
   * @param {string} config.description - Detailed explanation of what evidence this tool retrieves
   * @param {z.ZodType} config.inputSchema - Zod schema for input argument validation
   * @param {z.ZodType} [config.outputSchema] - Zod schema for result validation
   * @param {'INFO'|'LOW'} [config.riskLevel='INFO'] - Tool risk level (read-only queries are INFO or LOW)
   * @param {boolean} [config.requiresConnectedAccount=true]
   */
  constructor({
    name,
    description,
    inputSchema,
    outputSchema,
    riskLevel = 'INFO',
    requiresConnectedAccount = true,
  }) {
    if (new.target === BaseTool) {
      throw new TypeError('Cannot instantiate abstract class BaseTool directly');
    }
    if (!name || typeof name !== 'string') {
      throw new TypeError('Tool must declare a unique string name');
    }
    if (!description || typeof description !== 'string') {
      throw new TypeError(`Tool '${name}' must have a description`);
    }
    if (!inputSchema || !(inputSchema instanceof z.ZodType)) {
      throw new TypeError(`Tool '${name}' must declare a Zod inputSchema`);
    }

    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema || z.any();
    this.riskLevel = riskLevel;
    this.requiresConnectedAccount = Boolean(requiresConnectedAccount);

    // CRITICAL SECURITY INVARIANT: All investigation tools MUST be readOnly
    this.readOnly = true;
  }

  /**
   * Executes the tool logic against the database / provider state.
   *
   * @param {object} context
   * @param {string} context.userId - Authenticated user ID
   * @param {string} [context.connectedAccountId] - Target connected account ID
   * @param {object} [context.params] - Validated input arguments
   * @returns {Promise<object>} Structured evidence data
   * @abstract
   */
  async execute(context) { // eslint-disable-line no-unused-vars
    throw new Error(`execute() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Generates a Bedrock Runtime Converse API tool specification.
   *
   * @returns {object} { toolSpec: { name, description, inputSchema: { json: object } } }
   */
  toBedrockToolSpec() {
    return {
      toolSpec: {
        name: this.name,
        description: this.description,
        inputSchema: {
          json: this._zodToJsonSchema(this.inputSchema),
        },
      },
    };
  }

  /**
   * Converts a Zod object schema to basic JSON Schema for Converse API.
   *
   * @param {z.ZodType} schema
   * @returns {object} JSON Schema representation
   * @private
   */
  _zodToJsonSchema(schema) {
    // If Zod 4 or Zod 3, extract shape
    const shape = schema.shape || (schema._def && schema._def.shape ? schema._def.shape() : {});
    const properties = {};
    const required = [];

    for (const [key, prop] of Object.entries(shape)) {
      let type = 'string';
      let description = prop.description || '';

      const def = prop._def || {};
      const typeName = def.typeName || prop.constructor.name;

      if (typeName.includes('Number')) type = 'number';
      else if (typeName.includes('Boolean')) type = 'boolean';
      else if (typeName.includes('Array')) type = 'array';
      else if (typeName.includes('Object')) type = 'object';

      properties[key] = {
        type,
        ...(description ? { description } : {}),
      };

      if (!prop.isOptional && !prop.isNullable && !typeName.includes('Optional') && !typeName.includes('Nullable')) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
}

module.exports = BaseTool;

