/**
 * Usage Example
 *
 * Shows how to initialize and use the handler registry with different transports
 */

import { initializeRegistry } from '../registry/index.js';
import { QuicTransport, McpTransport, RestTransport, IpcTransport } from '../transports/index.js';

// Example: Initialize in lama.electron main process
async function exampleElectronInit() {
  // 1. Create handlers with dependencies (from lama.core)
  const deps = {
    nodeOneCore: {}, // Your NodeOneCore instance
    channelManager: {}, // Your ChannelManager
    topicModel: {}, // Your TopicModel
    leuteModel: {}, // Your LeuteModel
    aiAssistantModel: {}, // Your AIAssistantHandler
    llmManager: {}, // Your LLMManager
    chatMemoryHandler: {}, // Your ChatMemoryHandler
    memoryHandler: {}, // Your MemoryHandler
    subjectsHandler: {}, // Your SubjectsHandler
    proposalsHandler: {} // Your ProposalsHandler
  };

  // 2. Initialize registry with all handlers
  const registry = initializeRegistry(deps);

  // 3. Create transports

  // QUIC transport for Web/CLI clients
  const quicTransport = new QuicTransport(registry);
  // Use with your QUIC server implementation

  // MCP transport for Claude Code / AI tools
  const mcpTransport = new McpTransport(registry);
  const tools = mcpTransport.getTools();
  // Pass tools to MCP server

  // REST transport for HTTP API
  const restTransport = new RestTransport(registry);
  const endpoints = restTransport.getEndpoints();
  // Use with your HTTP server

  // IPC transport for Electron renderer
  const ipcTransport = new IpcTransport(registry);
  const { ipcMain } = await import('electron');
  ipcTransport.register(ipcMain);

  return { registry, quicTransport, mcpTransport, restTransport, ipcTransport };
}

// Example: Call handler from QUIC client
async function exampleQuicClient(quicTransport: QuicTransport) {
  const response = await quicTransport.handleMessage({
    id: 'req-123',
    handler: 'memory',
    method: 'createSubject',
    params: {
      id: 'my-subject',
      name: 'My Subject',
      description: 'Test subject'
    }
  });

  console.log('Response:', response);
  // { id: 'req-123', success: true, data: { idHash: '...', hash: '...', filePath: '...' } }
}

// Example: Call handler from MCP tool
async function exampleMcpTool(mcpTransport: McpTransport) {
  const result = await mcpTransport.executeTool('memory.createSubject', {
    id: 'my-subject',
    name: 'My Subject',
    description: 'Test subject'
  });

  console.log('Result:', result);
  // { content: [{ type: 'text', text: '...' }], isError: false }
}

// Example: Call handler from REST API
async function exampleRestApi(restTransport: RestTransport) {
  const response = await restTransport.handleRequest({
    handler: 'memory',
    method: 'createSubject',
    body: {
      id: 'my-subject',
      name: 'My Subject',
      description: 'Test subject'
    }
  });

  console.log('Response:', response);
  // { statusCode: 200, body: { success: true, data: { ... } } }
}

// Example: Call handler from Electron renderer
async function exampleIpcRenderer() {
  // In renderer process:
  const result = await window.electronAPI.invoke('handler:call', {
    handler: 'memory',
    method: 'createSubject',
    params: {
      id: 'my-subject',
      name: 'My Subject',
      description: 'Test subject'
    }
  });

  console.log('Result:', result);
  // { success: true, data: { idHash: '...', hash: '...', filePath: '...' } }
}

// Example: Type-safe usage with proxy
async function exampleTypeSafeProxy(registry: any) {
  // Create type-safe proxy for MemoryHandler
  const memory = registry.proxy('memory');

  // Now you can call methods directly with type checking
  const result = await memory.createSubject({
    id: 'my-subject',
    name: 'My Subject',
    description: 'Test subject'
  });

  console.log('Result:', result);
  // TypeScript knows the return type!
}

export {
  exampleElectronInit,
  exampleQuicClient,
  exampleMcpTool,
  exampleRestApi,
  exampleIpcRenderer,
  exampleTypeSafeProxy
};
