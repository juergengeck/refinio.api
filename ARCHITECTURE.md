# refinio.api Architecture

**Universal API layer for the ONE platform**

## Purpose

refinio.api provides:
1. **Handler Registry** - Central registration for all ONE operations
2. **Transport Adapters** - Expose handlers via stdio, QUIC, REST, IPC
3. **Server Implementations** - Ready-to-use servers for each transport

## Three Layers

### Layer 1: ONE Platform (Foundation)

```
@refinio/one.core      - Storage, crypto, instance
@refinio/one.models    - Leute, channels, topics
```

### Layer 2: refinio.api (API Infrastructure)

```
refinio.api/
├── handlers/          # ONE platform handlers
│   ├── OneStorageHandler.ts
│   ├── OneLeuteHandler.ts
│   ├── OneChannelsHandler.ts
│   ├── OneCryptoHandler.ts
│   └── OneInstanceHandler.ts
├── registry/          # Handler registry
│   ├── HandlerRegistry.ts
│   └── initialize-one-handlers.ts
├── transports/        # Transport adapters
│   ├── QuicTransport.ts
│   ├── McpTransport.ts
│   ├── RestTransport.ts
│   └── IpcTransport.ts
└── servers/           # Server implementations
    ├── mcp-stdio-server.ts
    ├── quic-server.ts
    └── rest-server.ts
```

### Layer 3: Applications (Usage)

#### refinio.one (Reference Implementation)

ONE platform CLI/server that exposes core ONE operations:

```typescript
// refinio.one/src/index.ts
import { initializeOneHandlers } from 'refinio.api';
import { startMcpStdioServer, QuicServer, RestServer } from 'refinio.api/servers';

// Initialize ONE.core
await initInstance({ ... });
const leuteModel = new LeuteModel();
const channelManager = new ChannelManager(leuteModel);

// Register ONE handlers
const registry = initializeOneHandlers({
  leuteModel,
  channelManager
});

// Start transports
await startMcpStdioServer(registry, { name: 'one', version: '1.0.0' });
const quicServer = new QuicServer(registry, { port: 8080 }, quicTransport);
const restServer = new RestServer(registry, { port: 3000 });
```

**Available to all clients:**
- `one.storage.storeVersionedObject(obj)`
- `one.leute.getContacts()`
- `one.channels.postToChannel(id, obj)`
- `one.crypto.sign(data, keyId)`
- `one.instance.getInfo()`

#### lama.electron (Application-Specific)

LAMA app includes **both** ONE handlers **and** LAMA-specific handlers:

```typescript
// lama.electron/main/init.ts
import { initializeOneHandlers } from 'refinio.api';
import { MemoryHandler, ChatMemoryHandler, AIAssistantHandler } from 'lama.core';

// Register ONE handlers
const registry = initializeOneHandlers({ leuteModel, channelManager });

// Register LAMA-specific handlers
registry.register('lama.memory', new MemoryHandler(...));
registry.register('lama.chatMemory', new ChatMemoryHandler(...));
registry.register('lama.aiAssistant', new AIAssistantHandler(...));
registry.register('lama.subjects', new SubjectsHandler(...));
registry.register('lama.proposals', new ProposalsHandler(...));

// Expose via IPC (Electron)
const ipcTransport = new IpcTransport(registry);
ipcTransport.register(ipcMain);

// Optionally expose via MCP for Claude Code
await startMcpStdioServer(registry, { name: 'lama', version: '1.0.0' });
```

**Available to clients:**
- ONE operations: `one.storage.*`, `one.leute.*`, etc.
- LAMA operations: `lama.memory.*`, `lama.aiAssistant.*`, etc.

#### lama.browser / lama.cube (Pure UI)

Browser-based UIs become **pure clients** - no ONE.core instance:

```typescript
// lama.browser/src/services/one-client.ts
class OneClient {
  async storeObject(obj: any) {
    return await fetch('http://localhost:3000/api/one.storage/storeVersionedObject', {
      method: 'POST',
      body: JSON.stringify(obj)
    });
  }

  async getContacts() {
    return await fetch('http://localhost:3000/api/one.leute/getContacts');
  }
}

// Or via WebSocket/QUIC:
const ws = new WebSocket('ws://localhost:8080');
ws.send(JSON.stringify({
  id: 'req-1',
  handler: 'one.leute',
  method: 'getContacts',
  params: {}
}));
```

#### Other Applications

Any app can use ONE through refinio.api:

```typescript
// my-app/src/index.ts
import { initializeOneHandlers } from 'refinio.api';
import { RestServer } from 'refinio.api/servers';

// Initialize ONE
const registry = initializeOneHandlers({ leuteModel, channelManager });

// Add app-specific handlers
registry.register('myapp.documents', new DocumentHandler(...));
registry.register('myapp.search', new SearchHandler(...));

// Expose via REST
const server = new RestServer(registry, { port: 4000 });
await server.start();
```

## Handler Naming Convention

### ONE Platform Handlers (universal)
- `one.storage.*` - Storage operations
- `one.leute.*` - Identity and contacts
- `one.channels.*` - Channel management
- `one.crypto.*` - Cryptographic operations
- `one.instance.*` - Instance management

### Application Handlers (app-specific)
- `lama.memory.*` - LAMA memory/subject storage
- `lama.chatMemory.*` - LAMA chat-memory integration
- `lama.aiAssistant.*` - LAMA AI assistant
- `lama.subjects.*` - LAMA subject analysis
- `lama.proposals.*` - LAMA context-aware proposals
- `myapp.documents.*` - Custom app handlers
- `myapp.search.*` - Custom app handlers

## Transport Usage Matrix

| Transport | Use Case | Client Type | Example |
|-----------|----------|-------------|---------|
| **stdio (MCP)** | AI tools | Claude Code, Cursor, etc. | `one.leute.getContacts` as MCP tool |
| **QUIC** | P2P sync | Web/CLI clients | `{ handler: 'one.storage', method: 'storeVersionedObject' }` |
| **REST** | HTTP API | Web apps, curl | `POST /api/one.leute/getContacts` |
| **IPC** | Electron | Renderer process | `invoke('handler:call', { handler: 'one.leute', method: 'getContacts' })` |

## Benefits

### For Application Developers
- **Use ONE without complexity** - Call `one.storage.storeObject()` instead of learning internals
- **Any transport** - Same API works over stdio, QUIC, REST, IPC
- **Add app handlers** - Register custom handlers alongside ONE handlers
- **Type safety** - Full TypeScript types through proxy pattern

### For Tool Developers (Claude Code, etc.)
- **Discover ONE operations** - All ONE methods exposed as MCP tools
- **No manual wrapping** - Tools auto-generated from handlers
- **Consistent interface** - Same patterns across all ONE apps

### For Platform Developers
- **Single API surface** - ONE operations defined once
- **No duplication** - Add handler method → available everywhere
- **Evolution** - Add new handlers without breaking existing code

## Example: Claude Code Using ONE

```json
// ~/.config/claude/mcp.json
{
  "mcpServers": {
    "one": {
      "command": "node",
      "args": ["/path/to/refinio.one/dist/index.js"]
    }
  }
}
```

**Claude Code sees:**
- `one.storage.storeVersionedObject` - Store data
- `one.storage.getObjectByIdHash` - Retrieve data
- `one.leute.getContacts` - List contacts
- `one.leute.createGroup` - Create group
- `one.channels.postToChannel` - Post to channel
- `one.crypto.sign` - Sign data
- `one.instance.getInfo` - Get instance info

**No manual tool definitions needed** - all auto-discovered!

## Example: Web App Using ONE

```typescript
// Frontend (React, Vue, etc.)
const one = new OneApiClient('http://localhost:3000');

// Store data
const result = await one.storage.storeVersionedObject({
  $type$: 'Document',
  title: 'My Document',
  content: '...'
});

// Get contacts
const contacts = await one.leute.getContacts();

// Create group
const group = await one.leute.createGroup({
  name: 'My Team',
  members: [contact1.idHash, contact2.idHash]
});
```

## Evolution Path

### Phase 1: Core ONE Handlers ✅
- [x] OneStorageHandler
- [x] OneLeuteHandler
- [x] OneChannelsHandler
- [x] OneCryptoHandler
- [x] OneInstanceHandler

### Phase 2: refinio.one Reference Implementation
- [ ] Initialize ONE.core
- [ ] Register ONE handlers
- [ ] Start stdio server (MCP)
- [ ] Start QUIC server
- [ ] Start REST server
- [ ] CLI interface

### Phase 3: LAMA Migration
- [ ] Update lama.electron to use registry
- [ ] Register LAMA handlers alongside ONE handlers
- [ ] Replace IPC handlers with registry
- [ ] Migrate mcp.core to use McpTransport

### Phase 4: Browser/Cube as Pure Clients
- [ ] Remove ONE.core from lama.browser
- [ ] Implement REST/QUIC client
- [ ] UI becomes pure view layer
- [ ] All operations via network calls to electron/node

## Documentation

- [Handler Registry](README-HANDLER-REGISTRY.md) - Complete guide
- [Usage Examples](src/examples/usage-example.ts) - Code examples
- [Transport Details](src/transports/) - Transport implementations

## Questions?

The key insight: **refinio.api is the universal API for ONE**, not just for LAMA. Any ONE-based application can use it.
