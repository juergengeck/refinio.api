/**
 * MCP Stdio Server
 *
 * MCP (Model Context Protocol) server using stdio transport.
 * Exposes handler registry as MCP tools for Claude Code and other AI tools.
 *
 * Usage:
 *   node dist/servers/mcp-stdio-server.js
 *
 * Or in MCP config:
 *   {
 *     "mcpServers": {
 *       "lama": {
 *         "command": "node",
 *         "args": ["/path/to/refinio.api/dist/servers/mcp-stdio-server.js"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { HandlerRegistry } from '../registry/HandlerRegistry.js';
import { McpTransport } from '../transports/McpTransport.js';

/**
 * MCP Stdio Server
 *
 * Wraps handler registry in MCP protocol over stdio
 */
export class McpStdioServer {
  private server: Server;
  private mcpTransport: McpTransport;

  constructor(
    private registry: HandlerRegistry,
    private serverInfo: { name: string; version: string }
  ) {
    this.mcpTransport = new McpTransport(registry);
    this.server = new Server(
      {
        name: serverInfo.name,
        version: serverInfo.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.mcpTransport.getTools();
      return { tools };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      const result = await this.mcpTransport.executeTool(name, args || {});
      return result;
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log to stderr (stdout is used for MCP protocol)
    console.error(`MCP Server started: ${this.serverInfo.name} v${this.serverInfo.version}`);
    console.error(`Tools available: ${this.mcpTransport.getTools().length}`);
  }

  /**
   * Stop the server
   */
  async stop() {
    await this.server.close();
  }
}

/**
 * Create and start MCP stdio server
 *
 * Call this from your initialization code with a configured registry
 */
export async function startMcpStdioServer(
  registry: HandlerRegistry,
  serverInfo: { name: string; version: string }
): Promise<McpStdioServer> {
  const server = new McpStdioServer(registry, serverInfo);
  await server.start();
  return server;
}
