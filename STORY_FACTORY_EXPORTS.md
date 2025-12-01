# StoryFactory Exports

StoryFactory and related types are exported from the `@refinio/api/plan-system` entry point.

## Usage

```typescript
import {
  StoryFactory,
  type Story,
  type Assembly,
  type Plan,
  type Supply,
  type Demand,
  type ExecutionMetadata,
  type ExecutionResult
} from '@refinio/api/plan-system';
```

## Available Exports

### Classes
- `StoryFactory` - Factory class for creating Stories and Assemblies

### Types
- `Story` - Story interface (audit trail)
- `Assembly` - Assembly interface (supply+demand linking)
- `Plan` - Plan reference type
- `Supply` - What is offered/available
- `Demand` - What is needed/requested
- `ExecutionMetadata` - Metadata for recordExecution()
- `ExecutionResult<T>` - Return type from recordExecution()

## Example

```typescript
import { StoryFactory } from '@refinio/api/plan-system';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';

const factory = new StoryFactory(storeVersionedObject);

// Register listener for Story creation
const unsubscribe = factory.onStoryCreated((story) => {
  console.log('Story created:', story.id);
});

// Record execution
const result = await factory.recordExecution(
  {
    title: 'My operation',
    description: 'Doing something',
    planId: 'my-plan-id',
    owner: 'user-id',
    domain: 'my-domain',
    instanceVersion: '1.0.0',
    supply: { domain: 'my-domain', subjects: [], keywords: [] },
    demand: { domain: 'my-domain', keywords: [] }
  },
  async () => {
    // Do the work
    return { success: true };
  }
);

console.log('Result:', result.result);
console.log('Story ID:', result.storyId);
console.log('Assembly ID:', result.assemblyId);
```
