# Handler Registry Architecture

**refinio.api as Grand Central for all LAMA handlers**

## Overview

The Handler Registry provides a **single API surface** for all LAMA operations. Handlers are registered once and automatically exposed through multiple transports:

- **stdio** - MCP protocol for Claude Code, AI tools
- **QUIC** - Fast P2P transport for Web/CLI clients
- **REST** - HTTP API for web applications
- **IPC** - Electron inter-process communication

## Architecture

```
┌─────────────────────────────────────────┐
│    lama.core (Business Logic)          │
│  MemoryHandler, ChatMemoryHandler,     │
│  AIAssistantHandler, SubjectsHandler   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│    refinio.api (Handler Registry)       │
│  registry.register('memory', handler)   │
│  registry.register('chat', handler)     │
└─────────────────────────────────────────┘
         ↓          ↓          ↓          ↓
    ┌────┴──┐  ┌───┴──┐  ┌───┴───┐  ┌───┴──┐
    │ stdio │  │ QUIC │  │ REST  │  │ IPC  │
    │  MCP  │  │      │  │  API  │  │      │
    └───────┘  └──────┘  └───────┘  └──────┘
         ↓          ↓          ↓          ↓
    Claude     Web/CLI    HTTP      Electron
     Code      Clients    Clients      UI
```

## Key Benefits

1. **Single Registration** - Add handler once, available everywhere
2. **No Duplication** - No per-transport wrapping of methods
3. **Type Safety** - TypeScript types flow through all layers
4. **Auto-Discovery** - Transports automatically expose all handler methods
5. **Consistent API** - Same interface across all transports

## File Structure

```
refinio.api/src/
├── registry/
│   ├── HandlerRegistry.ts      # Core registry implementation
│   └── index.ts                # Registry initialization
├── transports/
│   ├── QuicTransport.ts        # QUIC message routing
│   ├── McpTransport.ts         # MCP tool conversion
│   ├── RestTransport.ts        # REST API routing
│   ├── IpcTransport.ts         # Electron IPC routing
│   └── index.ts
├── servers/
│   ├── mcp-stdio-server.ts     # MCP stdio server
│   ├── quic-server.ts          # QUIC server
│   ├── rest-server.ts          # REST server
│   └── index.ts
└── examples/
    └── usage-example.ts        # Usage examples
```

## Usage Example

### 1. Initialize Registry (in lama.electron/main)

```typescript
import { initializeRegistry } from 'refinio.api';
import { MemoryHandler } from 'lama.core/handlers/MemoryHandler.js';
import { ChatMemoryHandler } from 'lama.core/handlers/ChatMemoryHandler.js';

// Create handler instances
const memoryHandler = new MemoryHandler(subjectHandler);
const chatMemoryHandler = new ChatMemoryHandler(/* deps */);

// Initialize registry
const registry = initializeRegistry({
  nodeOneCore,
  channelManager,
  topicModel,
  leuteModel,
  memoryHandler,
  chatMemoryHandler,
  // ... other handlers
});
```

### 2. Expose via Multiple Transports

#### MCP (stdio) for Claude Code

```typescript
import { startMcpStdioServer } from 'refinio.api/servers';

// Start MCP stdio server
const mcpServer = await startMcpStdioServer(registry, {
  name: 'lama-mcp',
  version: '1.0.0'
});

// Claude Code can now use:
// - memory.createSubject
// - chatMemory.enableMemories
// - subjects.extractSubjects
// All as MCP tools!
```

**MCP Config** (~/.config/claude/mcp.json):
```json
{
  "mcpServers": {
    "lama": {
      "command": "node",
      "args": ["/path/to/refinio.api/dist/servers/mcp-stdio-server.js"]
    }
  }
}
```

#### QUIC for Web/CLI Clients

```typescript
import { QuicServer } from 'refinio.api/servers';

const quicServer = new QuicServer(registry, { port: 8080 }, oneQuicTransport);
await quicServer.start();

// Clients send JSON-RPC messages:
// {
//   id: 'req-123',
//   handler: 'memory',
//   method: 'createSubject',
//   params: { id: 'foo', name: 'Bar' }
// }
```

#### REST API for HTTP Clients

```typescript
import { RestServer } from 'refinio.api/servers';

const restServer = new RestServer(registry, {
  port: 3000,
  cors: true
});
await restServer.start();

// HTTP endpoints auto-generated:
// POST /api/memory/createSubject
// POST /api/chatMemory/enableMemories
// POST /api/subjects/extractSubjects
// GET /openapi.json (OpenAPI schema)
```

#### IPC for Electron Renderer

```typescript
import { IpcTransport } from 'refinio.api/transports';
import { ipcMain } from 'electron';

const ipcTransport = new IpcTransport(registry);
ipcTransport.register(ipcMain);

// Renderer can call:
// const result = await window.electronAPI.invoke('handler:call', {
//   handler: 'memory',
//   method: 'createSubject',
//   params: { id: 'foo', name: 'Bar' }
// });
```

### 3. Call Handlers from Clients

#### From Claude Code (MCP)

```typescript
// Claude Code automatically sees all tools:
// - memory.createSubject
// - memory.getSubject
// - chatMemory.enableMemories
// - subjects.extractSubjects
// etc.

// When Claude Code calls a tool:
const result = await callTool('memory.createSubject', {
  id: 'my-subject',
  name: 'My Subject',
  description: 'Test subject'
});
```

#### From Web/CLI Client (QUIC)

```typescript
// Send JSON-RPC message
const response = await quicClient.send({
  id: 'req-123',
  handler: 'memory',
  method: 'createSubject',
  params: {
    id: 'my-subject',
    name: 'My Subject'
  }
});

// Response:
// {
//   id: 'req-123',
//   success: true,
//   data: { idHash: '...', hash: '...', filePath: '...' }
// }
```

#### From HTTP Client (REST)

```bash
curl -X POST http://localhost:3000/api/memory/createSubject \
  -H 'Content-Type: application/json' \
  -d '{"id":"my-subject","name":"My Subject"}'

# Response:
# {
#   "success": true,
#   "data": {
#     "idHash": "...",
#     "hash": "...",
#     "filePath": "..."
#   }
# }
```

#### From Electron Renderer (IPC)

```typescript
// In renderer process
const result = await window.electronAPI.invoke('handler:call', {
  handler: 'memory',
  method: 'createSubject',
  params: {
    id: 'my-subject',
    name: 'My Subject'
  }
});

// Result:
// {
//   success: true,
//   data: { idHash: '...', hash: '...', filePath: '...' }
// }
```

## Type-Safe Proxy Pattern

For type-safe handler invocation:

```typescript
import type { MemoryHandler } from 'lama.core/handlers/MemoryHandler.js';

// Create type-safe proxy
const memory = registry.proxy<MemoryHandler>('memory');

// Now TypeScript knows all methods and types!
const result = await memory.createSubject({
  id: 'my-subject',
  name: 'My Subject',
  description: 'Test'
});

// TypeScript knows result.idHash, result.hash, etc.
```

## Adding New Handlers

1. **Create handler in lama.core**:
```typescript
// lama.core/handlers/MyNewHandler.ts
export class MyNewHandler {
  constructor(private deps: any) {}

  async doSomething(params: any) {
    // Business logic
  }
}
```

2. **Register in refinio.api**:
```typescript
// lama.electron/main/init.ts
const myHandler = new MyNewHandler(deps);
registry.register('myHandler', myHandler, {
  description: 'My new handler',
  version: '1.0.0'
});
```

3. **Done!** Now available in:
- MCP as `myHandler.doSomething`
- QUIC as `{ handler: 'myHandler', method: 'doSomething' }`
- REST as `POST /api/myHandler/doSomething`
- IPC as `handler:call` with `handler: 'myHandler'`

## Transport Details

### stdio (MCP)

- **Protocol**: Model Context Protocol over stdin/stdout
- **Format**: JSON-RPC 2.0
- **Tools**: Auto-discovered from registry
- **Use Case**: Claude Code, AI assistants
- **Port**: N/A (uses stdio)

### QUIC

- **Protocol**: Custom JSON-RPC over QUIC
- **Format**: `{ id, handler, method, params }`
- **Transport**: ONE.core's QUIC implementation
- **Use Case**: Web clients, CLI tools, P2P sync
- **Port**: Configurable (default: 8080)

### REST

- **Protocol**: HTTP/REST
- **Format**: JSON request/response
- **Endpoints**: Auto-generated from registry
- **Documentation**: OpenAPI 3.0 schema at `/openapi.json`
- **Use Case**: Web apps, curl, Postman
- **Port**: Configurable (default: 3000)

### IPC

- **Protocol**: Electron IPC
- **Format**: `{ handler, method, params }`
- **Channel**: `handler:call`
- **Use Case**: Electron renderer ↔ main process
- **Port**: N/A (in-process)

## Handler Registry API

### Core Methods

```typescript
// Register handler
registry.register(name: string, handler: Handler, metadata?: HandlerMetadata)

// Call handler method
const result = await registry.call(handlerName: string, methodName: string, params: any)

// Get handler instance
const handler = registry.getHandler<T>(name: string)

// Check if handler exists
const exists = registry.hasHandler(name: string)

// List all handlers
const handlers = registry.listHandlers()

// Get metadata
const metadata = registry.getMetadata(name: string)
const allMetadata = registry.getAllMetadata()

// Type-safe proxy
const proxy = registry.proxy<T>(name: string)
```

### CallResult Format

All `registry.call()` invocations return:

```typescript
{
  success: boolean;
  data?: any;              // If success
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```

## Migration Path

### Current State (Duplicated)

```typescript
// MCP tool executor
switch (toolName) {
  case 'store_subject':
    return await memoryHandler.createSubject(params);
  case 'retrieve_subject':
    return await memoryHandler.getSubject(params);
  // ... 30 more tools
}

// IPC handler
ipcMain.handle('memory:createSubject', async (event, params) => {
  return await memoryHandler.createSubject(params);
});

// REST endpoint
app.post('/api/memory/createSubject', async (req, res) => {
  const result = await memoryHandler.createSubject(req.body);
  res.json(result);
});
```

### New State (Registry)

```typescript
// Register once
registry.register('memory', memoryHandler);

// All transports use registry automatically
// No per-method wrapping needed!
```

## Next Steps

1. ✅ Create HandlerRegistry
2. ✅ Create transport adapters (QUIC, MCP, REST, IPC)
3. ✅ Create server implementations
4. ⏳ Update lama.electron to use registry
5. ⏳ Update mcp.core to use registry
6. ⏳ Migrate existing handlers to registry pattern
7. ⏳ Remove old per-method wrappers

## Questions?

See `src/examples/usage-example.ts` for complete working examples.
