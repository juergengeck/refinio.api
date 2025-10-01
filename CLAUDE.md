# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@refinio/refinio-api` is an instance-based API server for the ONE platform that uses QUIC with verifiable credentials (QUICVC) for transport. It provides CRUD operations for ONE objects, profile management using one.models, and recipe (data structure definition) management.

## Key Commands

### Build and Development
```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Build in watch mode
npm start              # Start the API server (node dist/index.js)
npm test               # Run tests with Jest
```

### Configuration
The server uses configuration from:
1. `refinio-api.config.json` (current directory)
2. `~/.refinio/api.config.json` (user home)
3. `/etc/refinio/api.config.json` (system)
4. Environment variables (see src/config.ts:68-94)

## Architecture

### Core Stack
- **ONE.core**: Underlying storage and cryptographic layer (`@refinio/one.core`)
- **ONE.models**: Model layer for Profiles, LeuteModel, ChannelManager (`@refinio/one.models`)
- **Transport**: QUIC-based transport with WebSocket fallback (QuicVCServer)
- **Module System**: ESM modules (`"type": "module"` in package.json)

### Initialization Flow (src/index.ts:19-126)
1. Load configuration from files or environment variables
2. Set storage directory via `setBaseDirOrName()`
3. Import recipes from:
   - `@refinio/one.core/lib/recipes.js` (CORE_RECIPES)
   - `@refinio/one.models/lib/recipes/recipes-stable.js`
   - `@refinio/one.models/lib/recipes/recipes-experimental.js`
   - Custom recipes: StateEntryRecipe, AppStateJournalRecipe
4. Initialize ONE.core instance with `initInstance()` - creates or loads Instance
5. Initialize LeuteModel and ChannelManager from one.models
6. Create handlers: ObjectHandler, RecipeHandler, ProfileHandler
7. Create QuicVCServer with one.core's QUIC transport
8. Start server listening on configured port

### Authentication Architecture (src/auth/InstanceAuthManager.ts)
- **Challenge-Response**: Server generates cryptographic challenge, client signs with Person key
- **Session Management**: Token-based sessions stored in memory (24h timeout)
- **Instance Owner**: Currently only instance owner can authenticate (full permissions)
- **Future**: Will support additional Person authentication via signature verification

### Handler Architecture
All handlers follow similar patterns:

**ObjectHandler** (src/handlers/ObjectHandler.ts)
- Uses `storeVersionedObject()` and `storeUnversionedObject()` from one.core
- Create: Store objects with `$type$` field
- Read: `getObjectByIdHash()` for versioned, `getObject()` for unversioned
- Update: Creates new version of versioned objects
- Delete: Not implemented (ONE.core uses immutable storage)

**ProfileHandler** (src/handlers/ProfileHandler.ts)
- Uses one.models `LeuteModel` for Profile management
- Profiles follow official one.models Profile recipe structure
- Contains: nickname, profileId, personId, owner, communicationEndpoint, personDescription

**RecipeHandler** (src/handlers/RecipeHandler.ts)
- Manages ONE Recipe objects (data structure definitions)
- Recipes are self-describing: every Recipe has `$type$: 'Recipe'`
- Hierarchical: recipes can define other recipes

### QUIC Server Implementation (src/server/QuicVCServer.ts)
- Uses one.core's QuicTransport (WebSocket-based in current implementation)
- Message-based protocol: all messages are JSON with id, type, timestamp, payload
- Session tracking per connection ID
- Handlers dispatch based on MessageType enum (src/types.ts:8-34)

### State Management (src/state/)
**AppStateModel**: CRDT-based state synchronization between browser and Node.js instances
- **StateEntry**: Individual state change records (timestamp, source, path, value, author)
- **AppStateJournal**: Set CRDT merging entries from both instances
- Uses CHUM channels for real-time state propagation
- Journal ID is fixed: `'AppStateJournal'` (single journal per instance)

## Important Patterns

### ONE.core Object Storage
```typescript
// Store versioned object (has idHash + hash, can update)
const result = await storeVersionedObject({ $type$: 'MyType', ...data });
// result.idHash - stable ID across versions
// result.hash - content hash of this version

// Store unversioned object (only hash, immutable)
const result = await storeUnversionedObject({ $type$: 'MyType', ...data });
// result.hash - content hash
```

### Recipe System
Every ONE object requires:
- `$type$` field - identifies the recipe
- Recipe must be registered in `initialRecipes` during `initInstance()`
- Recipes define structure via `rule` array (itemprop, itemtype, optional)

### Import Paths
- Always use `.js` extensions in imports (ESM requirement): `import './foo.js'`
- Type imports: `import type { Foo } from './types.js'`
- Dynamic imports for recipes: `await import('@refinio/one.models/lib/recipes/recipes-stable.js')`

### Message Protocol
All QUIC messages follow src/types.ts:1-6 structure:
```typescript
interface Message {
  id: string;           // Correlation ID
  type: MessageType;    // Enum from MessageType
  timestamp: number;    // Unix timestamp
  payload: any;         // Type-specific data
}
```

## Module System Notes

- **ESM only**: Uses `"type": "module"` - no CommonJS
- **__dirname equivalent**: Use `fileURLToPath(import.meta.url)` pattern (src/index.ts:128-132)
- **JSON imports**: Enabled via `resolveJsonModule: true` in tsconfig.json
- **Dynamic imports**: Use `await import()` for conditional loading

## TypeScript Configuration

- **Target**: ES2022 with ESNext modules
- **Strict mode**: Enabled
- **Source maps**: Generated for debugging
- **Declaration files**: Generated in dist/ alongside compiled JS
- **Special types**: `@OneObjectInterfaces.d.ts` extends ONE.core's object interfaces

## External Dependencies

### Required ONE Platform Packages
- `@refinio/one.core` - Core storage, crypto, instance management
- `@refinio/one.models` - LeuteModel, ChannelManager, Profile recipes

### ONE.core Key Functions
- `initInstance()` / `getInstanceIdHash()` / `closeInstance()` - Instance lifecycle
- `getQuicTransport()` - Get QUIC transport from platform
- `storeVersionedObject()` / `getObjectByIdHash()` - Versioned storage
- `storeUnversionedObject()` / `getObject()` - Unversioned storage
- `registerRecipes()` - Add custom recipes

### ONE.models Key Classes
- `LeuteModel` - Person/Profile management
- `ChannelManager` - CHUM channel communication
- Both require `.init()` before use (src/index.ts:90-91)

## Common Tasks

### Adding a New Handler
1. Create handler class in src/handlers/
2. Implement methods that take request objects and return responses
3. Add to handlers object in src/index.ts:102-106
4. Add MessageType entries in src/types.ts if needed
5. Add dispatch cases in QuicVCServer.handleMessage() (src/server/QuicVCServer.ts:120-157)

### Adding a New Recipe
1. Define TypeScript interface in appropriate file
2. Create Recipe object with `$type$: 'Recipe'` and rule array
3. Add to `initialRecipes` array in src/index.ts:60
4. If extending ONE object types, declare in @OneObjectInterfaces.d.ts

### Testing the Server
Currently no test suite exists. Manual testing:
1. Configure refinio-api.config.json
2. `npm run build && npm start`
3. Connect with client (e.g., refinio-cli if available)
4. Send JSON messages over QUIC connection

## Special Files

- `@OneObjectInterfaces.d.ts` - Augments one.core's object interface registry
- `src/OneCoreInit.ts` - ONE.core initialization utilities (if needed separately)
- `lib/` - Compiled JavaScript output (parallel to dist/)

## Known Limitations

- Delete operation not implemented (ONE.core is immutable by design)
- Authentication currently only supports instance owner
- QUIC transport uses WebSocket fallback (not native QUIC streams)
- Query functionality requires reverse maps setup (ObjectHandler.query())
- Storage encryption not fully supported on all platforms (config.ts:37)
