# Refinio API Integration Modes

The Refinio API can operate in three different modes depending on your deployment needs. Note that modes 2 and 3 require integration within one.core itself and are described here as architectural patterns for future implementation.

## 1. Standalone Mode (Default)

The standalone mode runs as an independent server process with its own Instance. This is what we've built in the base implementation.

### Use Cases
- Dedicated API servers
- Microservice architectures
- Cloud deployments
- Development and testing

### Setup
```typescript
import { startApiServer } from '@lama/refinio-api';

const { server, instance } = await startApiServer();
console.log(`API server running on port 49498`);
console.log(`Instance owner: ${instance.owner.email}`);
```

### Characteristics
- Creates/manages its own Instance
- Runs on configurable port
- Full control over Instance lifecycle
- Filesystem-based storage (Node.js)

## 2. Browser Integration Mode (Future)

**Note: This requires implementation within one.core's browser platform loader.**

Integrate the API directly into a browser-based ONE application, sharing the same Instance.

### Use Cases
- Single-page applications (SPAs)
- Progressive web apps (PWAs)
- Browser extensions
- Local-first web applications

### Proposed Implementation
```typescript
// This would be implemented in one.core/lib/system/browser/api-server.ts
import '@refinio/one.core/lib/system/load-browser.js';
import { Instance } from '@refinio/one.core';
import { getQuicTransport } from '@refinio/one.core/lib/system/quic-transport.js';
import { QuicVCServer } from '@lama/refinio-api/server/QuicVCServer';
import { InstanceAuthManager } from '@lama/refinio-api/auth/InstanceAuthManager';
import { ObjectHandler } from '@lama/refinio-api/handlers/ObjectHandler';
import { RecipeHandler } from '@lama/refinio-api/handlers/RecipeHandler';

export class BrowserIntegratedAPI {
  private server: QuicVCServer | null = null;
  private instance: Instance;

  constructor(instance: Instance) {
    this.instance = instance;
  }

  async start(port: number = 49498) {
    // Use browser's QUIC transport (WebTransport API)
    const quicTransport = getQuicTransport();
    if (!quicTransport) {
      throw new Error('QUIC transport not available in browser');
    }

    // Reuse existing Instance
    const authManager = new InstanceAuthManager(this.instance);
    
    const objectHandler = new ObjectHandler();
    await objectHandler.initialize(this.instance);
    
    const recipeHandler = new RecipeHandler();
    await recipeHandler.initialize(this.instance);

    this.server = new QuicVCServer({
      instance: this.instance,
      quicTransport,
      authManager,
      handlers: {
        object: objectHandler,
        recipe: recipeHandler
      },
      config: {
        port,
        host: 'localhost' // Browser can only bind to localhost
      }
    });

    await this.server.start();
    console.log(`Browser API listening on localhost:${port}`);
  }

  async stop() {
    if (this.server) {
      await this.server.stop();
    }
  }
}

// Usage in browser app
async function initializeBrowserApp() {
  // Your app's existing Instance
  const instance = await createInstance({
    name: 'My Web App',
    email: 'user@example.com',
    secret: 'user-secret',
    encryptStorage: true
  });

  // Start integrated API
  const api = new BrowserIntegratedAPI(instance);
  await api.start(49498);

  // Now other browser tabs or extensions can connect
  // to localhost:49498 using the CLI or other clients
}
```

### Storage
- Uses IndexedDB (via one.core browser platform)
- Encrypted storage in browser
- Shared with main application

### Limitations
- Can only bind to localhost
- WebTransport API required (modern browsers)
- CORS restrictions apply
- Limited to browser sandbox

### Benefits
- No separate server process
- Shared Instance and storage
- Direct access to browser crypto APIs
- Works offline

## 3. Node.js Integration Mode (Future)

**Note: This requires implementation within one.core's Node.js platform loader.**

Integrate the API into an existing Node.js ONE application, sharing the Instance.

### Use Cases
- Electron applications
- Node.js desktop apps
- CLI tools with API capability
- Development tools

### Proposed Implementation
```typescript
// This would be implemented in one.core/lib/system/nodejs/api-server.ts
import '@refinio/one.core/lib/system/load-nodejs.js';
import { Instance } from '@refinio/one.core';
import { getQuicTransport } from '@refinio/one.core/lib/system/quic-transport.js';
import { QuicVCServer } from '@lama/refinio-api/server/QuicVCServer';
import { InstanceAuthManager } from '@lama/refinio-api/auth/InstanceAuthManager';
import { ObjectHandler } from '@lama/refinio-api/handlers/ObjectHandler';
import { RecipeHandler } from '@lama/refinio-api/handlers/RecipeHandler';

export class NodeIntegratedAPI {
  private server: QuicVCServer | null = null;
  private instance: Instance;
  private port: number;
  private host: string;

  constructor(instance: Instance, options?: { port?: number; host?: string }) {
    this.instance = instance;
    this.port = options?.port || 49498;
    this.host = options?.host || '0.0.0.0';
  }

  async start() {
    const quicTransport = getQuicTransport();
    if (!quicTransport) {
      throw new Error('QUIC transport not initialized');
    }

    const authManager = new InstanceAuthManager(this.instance);
    
    const objectHandler = new ObjectHandler();
    await objectHandler.initialize(this.instance);
    
    const recipeHandler = new RecipeHandler();
    await recipeHandler.initialize(this.instance);

    this.server = new QuicVCServer({
      instance: this.instance,
      quicTransport,
      authManager,
      handlers: {
        object: objectHandler,
        recipe: recipeHandler
      },
      config: {
        port: this.port,
        host: this.host
      }
    });

    await this.server.start();
    console.log(`Node.js integrated API on ${this.host}:${this.port}`);
  }

  async stop() {
    if (this.server) {
      await this.server.stop();
    }
  }

  // Additional methods for programmatic access
  async createObject(type: string, data: any, session?: any) {
    // Direct access without QUIC transport
    const handler = new ObjectHandler();
    await handler.initialize(this.instance);
    return handler.create({ type, data });
  }

  async executeRecipe(name: string, params: any, session?: any) {
    const handler = new RecipeHandler();
    await handler.initialize(this.instance);
    return handler.execute({ name, params });
  }
}

// Usage in Electron app
async function initializeElectronApp() {
  // Main process Instance
  const instance = await createInstance({
    name: 'My Electron App',
    email: 'user@example.com',
    secret: 'user-secret',
    directory: path.join(app.getPath('userData'), 'instance')
  });

  // Start integrated API
  const api = new NodeIntegratedAPI(instance, {
    port: 49498,
    host: '127.0.0.1' // Local only for security
  });
  await api.start();

  // Can also use programmatically
  const result = await api.createObject('Person', {
    name: 'Alice',
    email: 'alice@example.com'
  });
}
```

### Storage
- Filesystem-based (same as standalone)
- Shared with main application
- Can use custom directory

### Benefits
- Shared Instance with main app
- Programmatic access to handlers
- Can expose on network interface
- Full Node.js capabilities

### Security Considerations
- Consider binding to localhost only
- Use firewall rules for network exposure
- Validate permissions in integrated mode

## Choosing the Right Mode

| Mode | Use When | Storage | Network | Instance | Status |
|------|----------|---------|---------|----------|--------|
| **Standalone** | Need dedicated API server | Filesystem | Any interface | Own Instance | ✅ Implemented |
| **Browser** | Building web apps | IndexedDB | localhost only | Shared | 🔮 Future (requires one.core integration) |
| **Node.js** | Building desktop apps | Filesystem | Any interface | Shared | 🔮 Future (requires one.core integration) |

## Implementation Roadmap

### Current Status
- ✅ **Standalone mode** is fully implemented in this package
- 🔮 **Browser/Node.js integration** requires changes in one.core

### Required one.core Changes

For integrated modes to work, one.core would need:

1. **Platform API Server Module**
   ```typescript
   // one.core/lib/system/api-server.ts
   export interface ApiServer {
     start(instance: Instance, config: ApiConfig): Promise<void>;
     stop(): Promise<void>;
   }
   ```

2. **Browser Implementation**
   ```typescript
   // one.core/lib/system/browser/api-server.ts
   export class BrowserApiServer implements ApiServer {
     // Uses WebTransport API
   }
   ```

3. **Node.js Implementation**
   ```typescript
   // one.core/lib/system/nodejs/api-server.ts  
   export class NodeApiServer implements ApiServer {
     // Uses native QUIC bindings
   }
   ```

### How to Request Integration

To request integrated mode support in one.core:

1. Open an issue in the one.core repository
2. Reference this architecture document
3. Provide use case justification
4. Propose implementation approach

## Migration Between Modes

### From Standalone to Integrated (When Available)
1. Stop standalone server
2. Copy Instance directory to app location
3. Initialize integrated API with existing Instance
4. Update client configurations

### From Integrated to Standalone
1. Export Instance data
2. Initialize standalone server with same credentials
3. Import Instance data
4. Update network configurations

## Example: Hybrid Deployment (Future)

Once integrated modes are available in one.core, you could run multiple modes simultaneously:

```typescript
// Main application with integrated API
const mainInstance = await createInstance({ /* main config */ });
const integratedAPI = new NodeIntegratedAPI(mainInstance);
await integratedAPI.start(); // Port 49498

// Separate admin API with its own Instance
const adminInstance = await createInstance({ /* admin config */ });
const { server: adminAPI } = await startApiServer({
  port: 49499,
  instance: adminInstance
});

// Browser app connects to integrated API
// Admin tools connect to admin API
```

## WebTransport Considerations (Future)

When browser integration is implemented in one.core, ensure WebTransport support:

```typescript
function checkWebTransportSupport(): boolean {
  return 'WebTransport' in window;
}

if (!checkWebTransportSupport()) {
  console.warn('WebTransport not supported, falling back to WebSocket');
  // Use WebSocket-based transport instead
}
```

## Performance Optimization

### Browser Integration
- Use Web Workers for heavy operations
- Implement caching strategies
- Minimize IndexedDB transactions

### Node.js Integration
- Use worker threads for CPU-intensive tasks
- Implement connection pooling
- Optimize filesystem operations

### Shared Best Practices
- Batch operations when possible
- Implement request debouncing
- Use streaming for large data sets

## Testing Strategies

### Current Testing (Standalone Mode)

```typescript
// Test standalone server
import { startApiServer } from '@lama/refinio-api';

const { server, instance } = await startApiServer();
// Run tests
await server.stop();
```

### Future Testing (When Integrated Modes Available)

#### Unit Testing
```typescript
// Test with mock Instance
const mockInstance = createMockInstance();
const api = new NodeIntegratedAPI(mockInstance);
// Test API methods
```

### Integration Testing
```typescript
// Test with real Instance in temp directory
const testInstance = await createInstance({
  directory: '/tmp/test-instance',
  wipeStorage: true
});
const api = new NodeIntegratedAPI(testInstance);
// Run integration tests
```

### End-to-End Testing
- Standalone: Test full server lifecycle
- Browser: Use Playwright/Puppeteer
- Node.js: Test with actual app integration