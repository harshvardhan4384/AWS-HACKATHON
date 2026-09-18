'use strict';

const BaseTool = require('./base.tool');
const connectedAccountRepository = require('../../repositories/connectedAccount.repository');
const auditLogRepository = require('../../repositories/auditLog.repository');
const { redactSensitive } = require('../../utils/redaction');
const config = require('../../config/env');

/**
 * ToolRegistry — Manages and executes read-only security investigation tools.
 *
 * Enforces strict security boundaries:
 * 1. Read-only verification: Only tools with readOnly === true can be registered or run.
 * 2. Tenant isolation: ConnectedAccount must belong to the authenticated user.
 * 3. Argument validation: Zod validation on every call.
 * 4. Sanitization: All outputs are recursively stripped of secrets and tokens.
 * 5. Bounded size: Outputs are limited to aiMaxToolResultItems to prevent model context flooding.
 * 6. Audit logging: Every tool call, rejection, or failure is logged to AuditLog.
 */
class ToolRegistry {
  constructor() {
    /** @type {Map<string, BaseTool>} */
    this._tools = new Map();
  }

  /**
   * Registers a read-only investigation tool.
   *
   * @param {BaseTool} tool
   * @throws {TypeError} if tool is not a BaseTool instance or not read-only
   * @throws {Error} if tool with same name already registered
   */
  register(tool) {
    if (!(tool instanceof BaseTool)) {
      throw new TypeError('Tool must be an instance of BaseTool');
    }
    if (tool.readOnly !== true) {
      throw new TypeError(`Tool '${tool.name}' violates safety mandate: must be readOnly: true`);
    }
    if (this._tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this._tools.set(tool.name, tool);
  }

  /**
   * Retrieves a tool by name.
   *
   * @param {string} name
   * @returns {BaseTool|null}
   */
  get(name) {
    return this._tools.get(name) || null;
  }

  /**
   * Returns all registered tools.
   *
   * @returns {BaseTool[]}
   */
  list() {
    return Array.from(this._tools.values());
  }

  /**
   * Returns Bedrock Converse API tool specifications for all registered tools.
   *
   * @returns {Array<object>}
   */
  toBedrockToolSpecs() {
    return Array.from(this._tools.values()).map((t) => t.toBedrockToolSpec());
  }

  /**
   * Safely executes a registered tool with full validation, ownership check,
   * secret redaction, and audit logging.
   *
   * @param {object} params
   * @param {string} params.toolName - Name of tool to execute
   * @param {string} params.userId - Authenticated user ID
   * @param {string} [params.connectedAccountId] - Target connected account ID
   * @param {object} [params.input={}] - Input arguments from LLM tool call
   * @param {string} [params.correlationId] - Agent investigation correlation ID
   * @returns {Promise<{
   *   toolName: string,
   *   success: boolean,
   *   data: object|Array,
   *   isUntrustedData: true
   * }>}
   */
  async executeTool({ toolName, userId, connectedAccountId, input = {}, correlationId = null }) {
    const tool = this.get(toolName);

    // 1. Tool Existence Check
    if (!tool) {
      await this._audit(userId, toolName, 'TOOL_REJECTED', 'FAILURE', correlationId, {
        reason: `Unknown tool '${toolName}'`,
      });
      throw new Error(`Tool '${toolName}' is not registered in Re:COVER Tool Registry`);
    }

    // 2. Strict Read-Only Verification
    if (tool.readOnly !== true) {
      await this._audit(userId, toolName, 'TOOL_REJECTED', 'FAILURE', correlationId, {
        reason: `Tool '${toolName}' is not read-only`,
      });
      throw new Error(`Execution blocked: Tool '${toolName}' is not read-only`);
    }

    // 3. Resolve ConnectedAccountId (from input or fallback to parameter)
    const effectiveAccountId = input.connectedAccountId || connectedAccountId;

    // 4. Connected Account Ownership Validation
    if (tool.requiresConnectedAccount) {
      if (!effectiveAccountId) {
        await this._audit(userId, toolName, 'TOOL_REJECTED', 'FAILURE', correlationId, {
          reason: 'Missing required connectedAccountId',
        });
        throw new Error(`Tool '${toolName}' requires a valid connectedAccountId`);
      }

      const account = await connectedAccountRepository.findById(effectiveAccountId);
      if (!account || account.userId !== userId) {
        await this._audit(userId, toolName, 'TOOL_REJECTED', 'FAILURE', correlationId, {
          reason: 'Access denied: Connected account does not belong to user',
          connectedAccountId: effectiveAccountId,
        });
        const err = new Error(`Connected account '${effectiveAccountId}' not found or access denied`);
        err.statusCode = 403;
        throw err;
      }
    }

    // 5. Input Schema Validation
    let validatedParams;
    try {
      validatedParams = tool.inputSchema.parse(input);
    } catch (valErr) {
      await this._audit(userId, toolName, 'TOOL_REJECTED', 'FAILURE', correlationId, {
        reason: 'Input validation failed',
        errors: valErr.issues || valErr.errors,
      });
      const err = new Error(`Invalid arguments for tool '${toolName}': ${valErr.message}`);
      err.statusCode = 400;
      throw err;
    }

    // 6. Execute Tool
    let rawResult;
    try {
      rawResult = await tool.execute({
        userId,
        connectedAccountId: effectiveAccountId,
        params: validatedParams,
      });
    } catch (execErr) {
      await this._audit(userId, toolName, 'TOOL_FAILED', 'FAILURE', correlationId, {
        error: execErr.message,
      });
      throw execErr;
    }

    // 7. Output Sanitization & Bounding
    let sanitizedData = redactSensitive(rawResult);

    // Bound array results to aiMaxToolResultItems
    if (Array.isArray(sanitizedData)) {
      sanitizedData = sanitizedData.slice(0, config.aiMaxToolResultItems);
    } else if (sanitizedData && typeof sanitizedData === 'object') {
      for (const [key, val] of Object.entries(sanitizedData)) {
        if (Array.isArray(val) && val.length > config.aiMaxToolResultItems) {
          sanitizedData[key] = val.slice(0, config.aiMaxToolResultItems);
        }
      }
    }

    // 8. Audit Success
    await this._audit(userId, toolName, 'TOOL_CALLED', 'SUCCESS', correlationId, {
      itemCount: Array.isArray(sanitizedData) ? sanitizedData.length : undefined,
    });

    return {
      toolName,
      success: true,
      data: sanitizedData,
      isUntrustedData: true,
    };
  }

  /**
   * Helper to write structured audit logs for tool events.
   *
   * @private
   */
  async _audit(userId, toolName, actionType, result, correlationId, metadata = {}) {
    try {
      await auditLogRepository.create({
        userId,
        actorType: 'AGENT',
        actorId: 'AI_INVESTIGATOR',
        actionType,
        targetType: 'Tool',
        targetId: toolName,
        result,
        correlationId,
        metadata: {
          toolName,
          ...metadata,
        },
      });
    } catch {
      // Audit log failures must not crash tool execution
    }
  }

  /**
   * Clears all registered tools (for testing isolation).
   */
  clear() {
    this._tools.clear();
  }

  get size() {
    return this._tools.size;
  }
}

const toolRegistry = new ToolRegistry();

module.exports = { ToolRegistry, toolRegistry };

