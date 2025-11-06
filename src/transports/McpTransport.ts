/**
 * MCP Transport Adapter
 *
 * Exposes handler registry through MCP stdio protocol.
 * Auto-discovers all handlers and methods, converting them to MCP tools.
 *
 * Each handler method becomes an MCP tool:
 * - Tool name: "handlerName.methodName" (e.g., "memory.createSubject")
 * - Tool parameters: Derived from handler method signature
 * - Tool execution: Calls registry.call()
 */

import type { HandlerRegistry } from '../registry/HandlerRegistry.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Transport
 *
 * Converts handler registry to MCP tool definitions
 */
export class McpTransport {
  private tools: MCPTool[] = [];

  constructor(private registry: HandlerRegistry) {
    this.discoverTools();
  }

  /**
   * Auto-discover all handlers and methods as MCP tools
   */
  private discoverTools() {
    const metadata = this.registry.getAllMetadata();

    for (const handler of metadata) {
      for (const method of handler.methods) {
        this.tools.push({
          name: `${handler.name}.${method.name}`,
          description:
            method.description || `${handler.name} - ${method.name}`,
          inputSchema: {
            type: 'object',
            properties: this.buildInputSchema(method.params),
            required: method.params?.filter(p => p.required).map(p => p.name)
          }
        });
      }
    }
  }

  /**
   * Build JSON schema for method parameters
   */
  private buildInputSchema(params?: any[]): Record<string, any> {
    if (!params) return {};

    const properties: Record<string, any> = {};
    for (const param of params) {
      properties[param.name] = {
        type: param.type || 'string',
        description: param.description
      };
    }
    return properties;
  }

  /**
   * Get all MCP tool definitions
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(
    toolName: string,
    params: Record<string, any>
  ): Promise<MCPToolResult> {
    // Parse tool name: "handlerName.methodName"
    const [handlerName, methodName] = toolName.split('.');

    if (!handlerName || !methodName) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid tool name: ${toolName}. Expected format: handlerName.methodName`
          }
        ],
        isError: true
      };
    }

    // Call registry
    const result = await this.registry.call(handlerName, methodName, params);

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error?.message || 'Unknown error'}`
          }
        ],
        isError: true
      };
    }

    // Format result as text
    const text =
      typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data, null, 2);

    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }
}
