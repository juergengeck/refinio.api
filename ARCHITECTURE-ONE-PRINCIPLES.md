# refinio.api - Aligned with ONE First Principles

**Universal API layer following ONE's fundamental architecture**

## ONE First Principles Applied

From [ONE first principles](https://docs.refinio.one/one_first_principles/):

> **Principle 3**: "Transactions in ONE are defined in ONE objects called **Plan**. Plan objects reference immutable functions and their parameters. After a Plan object has been evaluated, the Plan object and the result are referenced in a **Story** object. Story objects are the memories of ONE."

## Architecture Mapping

### ONE Concepts → refinio.api

```
┌─────────────────────────────────────────────┐
│           ONE First Principles               │
│                                             │
│  Plan → Method + Parameters                 │
│  Evaluation → Execute Plan                  │
│  Story → Plan + Result + Metadata           │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         refinio.api (Implementation)         │
│                                             │
│  PlanRegistry                               │
│  ├── Plans (one.storage, one.leute, etc.)  │
│  ├── execute() → Story                      │
│  └── Story = { plan, data, timestamp }     │
└─────────────────────────────────────────────┘
```

### Terminology

| ONE Concept | refinio.api | Description |
|-------------|-------------|-------------|
| **Plan** | `Plan` class | Collection of executable methods |
| **Plan object** | `PlanTransaction` | Method invocation (plan + method + params) |
| **Evaluation** | `registry.execute()` | Execute the plan |
| **Story** | `StoryResult` | Plan + Result + execution metadata |

## Transaction Flow (ONE Pattern)

```typescript
// 1. Define Plan (collection of methods)
class OneStoragePlan {
  async storeVersionedObject(obj: any) { ... }
  async getObjectByIdHash(idHash: string) { ... }
}

// 2. Register Plan
registry.register('one.storage', new OneStoragePlan());

// 3. Create Plan Transaction (method + params)
const planTransaction = {
  plan: 'one.storage',
  method: 'storeVersionedObject',
  params: { $type$: 'Document', content: '...' }
};

// 4. Execute Plan
const story = await registry.execute(
  'one.storage',
  'storeVersionedObject',
  { $type$: 'Document', content: '...' }
);

// 5. Story object contains Plan + Result
{
  success: true,
  plan: {
    plan: 'one.storage',
    method: 'storeVersionedObject',
    params: { ... }
  },
  data: { hash: '...', idHash: '...' },
  timestamp: 1234567890,
  executionTime: 42
}
```

## Core Components

### PlanRegistry

Central registry managing all Plans following ONE's transaction pattern:

```typescript
class PlanRegistry {
  // Register a Plan (collection of methods)
  register(name: string, plan: Plan, metadata?: PlanMetadata)

  // Execute Plan → Create Story
  execute<T>(planName: string, methodName: string, params?: any): Promise<StoryResult<T>>

  // Get Plan instance
  getPlan<T>(name: string): T | undefined

  // Type-safe proxy
  proxy<T>(planName: string): T
}
```

### Plan

A collection of executable methods (aligned with ONE's immutable functions):

```typescript
interface Plan {
  [methodName: string]: (...args: any[]) => Promise<any>;
}

// Example: ONE Storage Plan
class OneStoragePlan implements Plan {
  async storeVersionedObject(obj: OneVersionedObjectTypes) { ... }
  async getObjectByIdHash(idHash: SHA256IdHash) { ... }
  async storeBlob(data: ArrayBuffer) { ... }
}
```

### PlanTransaction

Captures method + parameters BEFORE execution (ONE's Plan object):

```typescript
interface PlanTransaction {
  plan: string;      // Plan name: 'one.storage'
  method: string;    // Method name: 'storeVersionedObject'
  params: any;       // Parameters: { $type$: 'Document', ... }
}
```

### Story

Captures Plan + Result AFTER execution (ONE's Story object):

```typescript
interface StoryResult<T = any> {
  success: boolean;
  plan: PlanTransaction;    // The executed plan
  data?: T;                 // Result data
  error?: { ... };          // Or error
  timestamp: number;        // When executed
  executionTime?: number;   // How long it took
}
```

## Plan Hierarchy

### ONE Platform Plans

Core ONE operations (universal across all ONE applications):

```typescript
// ONE.core Plans
registry.register('one.storage', new OneStoragePlan());
registry.register('one.crypto', new OneCryptoPlan());
registry.register('one.instance', new OneInstancePlan());

// ONE.models Plans
registry.register('one.leute', new OneLeutePlan(leuteModel));
registry.register('one.channels', new OneChannelsPlan(channelManager));
```

### Application Plans

Application-specific operations (built on ONE platform):

```typescript
// LAMA Plans
registry.register('lama.memory', new LamaMemoryPlan(...));
registry.register('lama.chatMemory', new LamaChatMemoryPlan(...));
registry.register('lama.aiAssistant', new LamaAIAssistantPlan(...));
registry.register('lama.subjects', new LamaSubjectsPlan(...));

// Your App Plans
registry.register('myapp.documents', new MyAppDocumentsPlan(...));
registry.register('myapp.search', new MyAppSearchPlan(...));
```

## Transport Adapters

All transports expose Plans using ONE's transaction pattern:

### QUIC Transport

```typescript
// Client sends PlanTransaction
{
  id: 'req-123',
  plan: 'one.storage',
  method: 'storeVersionedObject',
  params: { ... }
}

// Server returns Story
{
  id: 'req-123',
  success: true,
  plan: { ... },
  data: { hash: '...', idHash: '...' },
  timestamp: 1234567890
}
```

### MCP (stdio) Transport

```typescript
// Each Plan method becomes an MCP tool
// Tool name: "planName.methodName"

one.storage.storeVersionedObject
one.leute.getContacts
one.channels.postToChannel
```

### REST Transport

```typescript
// Endpoint: POST /api/:plan/:method

POST /api/one.storage/storeVersionedObject
POST /api/one.leute/getContacts
POST /api/one.channels/postToChannel

// Response is Story object
{
  success: true,
  plan: { plan: 'one.storage', method: 'storeVersionedObject', ... },
  data: { ... },
  timestamp: 1234567890
}
```

### IPC Transport

```typescript
// Electron renderer sends PlanTransaction
await window.electronAPI.invoke('plan:execute', {
  plan: 'one.storage',
  method: 'storeVersionedObject',
  params: { ... }
});

// Main process returns Story
{
  success: true,
  plan: { ... },
  data: { ... },
  timestamp: 1234567890
}
```

## Audit Trail (Story Objects)

Following ONE's principle of rollback/roll-forward capability:

```typescript
// All transactions create Story objects
const story1 = await registry.execute('one.storage', 'storeVersionedObject', obj1);
const story2 = await registry.execute('one.storage', 'storeVersionedObject', obj2);

// Story objects can be stored for audit
await storeStory(story1);
await storeStory(story2);

// Full audit log available
const auditLog = await getStories();
// [
//   { plan: { plan: 'one.storage', method: 'storeVersionedObject', ... }, ... },
//   { plan: { plan: 'one.storage', method: 'storeVersionedObject', ... }, ... }
// ]
```

## Benefits of ONE Alignment

### 1. Immutable Transaction Log

Every execution creates a Story object capturing:
- What was executed (Plan + method + params)
- When it was executed (timestamp)
- What the result was (data or error)
- How long it took (executionTime)

### 2. Rollback/Roll-forward Capability

Story objects enable:
- Time-travel debugging
- Replay of transactions
- Audit trail analysis
- Undo/redo operations

### 3. Consistent Architecture

Same pattern throughout:
- ONE.core uses Plan → Story
- refinio.api uses Plan → Story
- All applications built on this pattern

### 4. Natural Multi-tenancy

Plans are isolated namespaces:
- `one.*` - Platform plans
- `lama.*` - LAMA plans
- `myapp.*` - Your app plans

No name collisions, clear ownership.

## Migration from "Handler" Terminology

Old (generic):
```typescript
registry.register('memory', handler);
await registry.call('memory', 'createSubject', params);
```

New (ONE-aligned):
```typescript
registry.register('lama.memory', plan);
const story = await registry.execute('lama.memory', 'createSubject', params);
```

Benefits:
- ✅ Aligns with ONE first principles
- ✅ Clear transaction semantics
- ✅ Story objects provide audit capability
- ✅ Consistent terminology across platform
- ✅ Familiar to ONE developers

## Example: Complete Flow

```typescript
// 1. Initialize ONE
await initInstance({ ... });
const leuteModel = new LeuteModel();
const channelManager = new ChannelManager(leuteModel);

// 2. Create Plans
const storagePlan = new OneStoragePlan();
const leutePlan = new OneLeutePlan(leuteModel);

// 3. Register Plans
const registry = createPlanRegistry();
registry.register('one.storage', storagePlan);
registry.register('one.leute', leutePlan);

// 4. Execute Plan (creates Story)
const story = await registry.execute(
  'one.storage',
  'storeVersionedObject',
  {
    $type$: 'Document',
    title: 'My Document',
    content: '...'
  }
);

// 5. Story object captures everything
console.log(story);
// {
//   success: true,
//   plan: {
//     plan: 'one.storage',
//     method: 'storeVersionedObject',
//     params: { $type$: 'Document', ... }
//   },
//   data: { hash: '...', idHash: '...', versionHash: '...' },
//   timestamp: 1234567890,
//   executionTime: 42
// }

// 6. Expose via transports
const mcpServer = new McpStdioServer(registry);
const quicServer = new QuicServer(registry, { port: 8080 });
const restServer = new RestServer(registry, { port: 3000 });
```

## Documentation

- [ONE First Principles](https://docs.refinio.one/one_first_principles/)
- [Handler Registry (original)](README-HANDLER-REGISTRY.md) - now superseded by Plan Registry
- [Usage Examples](src/examples/usage-example.ts)

## Summary

refinio.api implements ONE's transaction pattern:
1. **Plan** → Collection of executable methods
2. **Execute** → Evaluate Plan with parameters
3. **Story** → Capture Plan + Result + metadata

This provides:
- Audit capability (all transactions logged as Stories)
- Rollback/roll-forward (replay Story objects)
- Consistent architecture (same pattern throughout)
- Clear semantics (Plan → Execute → Story)

**Identity is all you need** - and Plans are how you express actions on that identity.
