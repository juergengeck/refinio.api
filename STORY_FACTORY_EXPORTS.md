# StoryFactory Exports

StoryFactory and related types are exported from the `@refinio/api/plan-system` entry point.

## Architecture

**Story** = minimal audit record tracking Plan execution
- What Plan was executed
- What product was created (hash)
- When, by whom

**Assembly** = Demand/Supply matching (separate concern, see assembly.core)
- NOT created automatically by StoryFactory
- Application code creates Assemblies separately
- `AssemblyListener` can listen to Story creation events

## Usage

```typescript
import {
  StoryFactory,
  type Story,
  type Plan,
  type ExecutionMetadata,
  type ExecutionResult,
  type OperationResult
} from '@refinio/api/plan-system';
```

## Available Exports

### Classes
- `StoryFactory` - Factory class for creating Stories

### Types
- `Story` - Story interface (audit trail)
- `Plan` - Plan reference type
- `ExecutionMetadata` - Metadata for Story creation (title, planId, owner, instanceVersion)
- `ExecutionResult<T>` - Return type from wrapExecution() with { result, storyId, assemblyId? }
- `OperationResult<T>` - Return type from wrapped operations with { result, productHash }

## Methods

### `wrapExecution<T>(metadata, operation)` (Preferred)

Wraps an operation and creates a Story atomically. The operation must return `{ result, productHash }`.

```typescript
const result = await factory.wrapExecution(
  {
    title: 'Create contact',
    planId: myPlanIdHash,
    owner: ownerPersonIdHash,
    instanceVersion: 'v1.0.0'
  },
  async () => {
    // Do the work
    const contact = await createContact(...);
    const stored = await storeVersionedObject(contact);
    return {
      result: contact,
      productHash: stored.hash
    };
  }
);

console.log('Result:', result.result);
console.log('Story ID:', result.storyId);
// result.assemblyId is undefined - create Assembly separately if needed
```

### `recordExecution(metadata, productHash, duration?)` (Low-level)

Creates a Story for an already-completed operation. Call this AFTER storing the product.

```typescript
// Execute operation first
const contact = await createContact(...);
const stored = await storeVersionedObject(contact);

// Then record the Story
const storyId = await factory.recordExecution(
  {
    title: 'Create contact',
    planId: myPlanIdHash,
    owner: ownerPersonIdHash,
    instanceVersion: 'v1.0.0'
  },
  stored.hash  // The product hash
);
```

### `onStoryCreated(listener)`

Register a listener for Story creation events. Used by assembly.core's `AssemblyListener`.

```typescript
const unsubscribe = factory.onStoryCreated((story) => {
  console.log('Story created:', story.id);
  // Create Assembly here if needed
});

// Later, when done:
unsubscribe();
```

## Complete Example

```typescript
import { StoryFactory } from '@refinio/api/plan-system';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';

const factory = new StoryFactory(storeVersionedObject);

// Register Plan first (gets real SHA256IdHash<Plan>)
const planIdHash = await factory.registerPlan({
  id: 'contacts',
  name: 'Contacts Plan',
  description: 'Contact management operations'
});

// Use wrapExecution for atomic Story creation
const result = await factory.wrapExecution(
  {
    title: 'Add contact: John',
    planId: planIdHash,
    owner: myPersonIdHash,
    instanceVersion: 'v1.0.0'
  },
  async () => {
    const contact = { $type$: 'Contact', name: 'John' };
    const stored = await storeVersionedObject(contact);
    return {
      result: { success: true, contactId: stored.idHash },
      productHash: stored.hash
    };
  }
);

console.log('Contact created:', result.result.contactId);
console.log('Story recorded:', result.storyId);
```

## Key Points

1. **Story metadata is minimal**: Only `title`, `planId`, `owner`, `instanceVersion`
2. **No Assembly metadata in Story**: Demand/Supply/matchScore belong to Assembly, not Story
3. **Assembly is separate**: Created by application code, not StoryFactory
4. **productHash is required**: Story.product = hash of what was created
5. **Use wrapExecution**: Preferred pattern for Plans - atomic execution + Story creation
