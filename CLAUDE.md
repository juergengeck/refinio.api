# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@refinio/refinio-api` is an instance-based API server for the ONE platform that uses QUIC with verifiable credentials (QUICVC) for transport. It provides CRUD operations for ONE objects, profile management using one.models, and recipe (data structure definition) management.

## Key Commands

### Build and Development
```bash
npm run build                    # Compile TypeScript to dist/
npm run dev                      # Build in watch mode
npm start                        # Start the API server (node dist/index.js)
npm test                         # Run tests with Jest
npm run test:integration         # Run integration tests (requires electron-app running)
```

### Configuration
The server uses configuration from (in order of precedence):
1. Environment variables (highest priority)
2. `refinio-api.config.json` (current directory)
3. `~/.refinio/api.config.json` (user home)
4. `/etc/refinio/api.config.json` (system)
5. Default values in src/config.ts

**Important Environment Variables**:
- `REFINIO_API_PORT` - Server port (default: 49498)
- `REFINIO_API_HOST` - Server bind address (default: 0.0.0.0)
- `REFINIO_INSTANCE_DIRECTORY` - Storage directory (default: ~/.refinio/instance)
- `REFINIO_INSTANCE_SECRET` - Instance secret (required)
- `REFINIO_INSTANCE_EMAIL` - Instance owner email
- `REFINIO_COMM_SERVER_URL` - CommServer URL (default: wss://comm10.dev.refinio.one)
- `REFINIO_ENCRYPT_STORAGE` - Enable storage encryption (default: false)
- `REFINIO_FILER_MOUNT_POINT` - Filesystem mount point (optional)
- `REFINIO_FILER_INVITE_URL_PREFIX` - Invite URL prefix (optional)
- `REFINIO_LOG_LEVEL` - Logging level: debug|info|warn|error

## Architecture

### Core Stack
- **ONE.core**: Underlying storage and cryptographic layer (`@refinio/one.core`)
- **ONE.models**: Model layer for Profiles, LeuteModel, ChannelManager (`@refinio/one.models`)
- **Transport**: QUIC-based transport with WebSocket fallback (QuicVCServer)
- **Module System**: ESM modules (`"type": "module"` in package.json)

### Initialization Flow (src/index.ts:19-252)
1. Load configuration from files or environment variables
2. Set storage directory via `setBaseDirOrName()`
3. Import recipes from:
   - `@refinio/one.core/lib/recipes.js` (CORE_RECIPES)
   - `@refinio/one.models/lib/recipes/recipes-stable.js`
   - `@refinio/one.models/lib/recipes/recipes-experimental.js`
   - Custom recipes: StateEntryRecipe, AppStateJournalRecipe
4. Initialize ONE.core instance with `initInstance()` - creates or loads Instance
5. Initialize all required models from one.models:
   - LeuteModel - Person/Profile management
   - ChannelManager - CHUM channel communication
   - TopicModel - Chat topics
   - Notifications - Notification system
   - IoMManager - Internet of Me manager
   - JournalModel - Set to null (not fully initialized)
   - QuestionnaireModel - Questionnaire management
   - ConnectionsModel - Connection establishment and pairing
6. Register global pairing success handler for automatic contact creation
7. Create handlers: ObjectHandler, RecipeHandler, ProfileHandler, ConnectionHandler
8. Create QuicVCServer with one.core's QUIC transport
9. Create HttpRestServer for REST API endpoints (port from config)
10. Optionally mount complete Filer filesystem via IFileSystemAdapter (if config.filer.mountPoint set)
11. Start both servers listening on configured ports

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

**ConnectionHandler** (src/handlers/ConnectionHandler.ts)
- Manages connections between ONE instances
- Uses one.models `ConnectionsModel` for connection establishment
- Contacts are created automatically when connections succeed (bidirectional)
- Contacts accessed via `LeuteModel.others()` returning `SomeoneModel[]`
- Connection flow: create invite → accept invite → establish connection → auto-create contacts

### Server Architecture

**QuicVCServer** (src/server/QuicVCServer.ts)
- Uses one.core's QuicTransport (WebSocket-based in current implementation)
- Message-based protocol: all messages are JSON with id, type, timestamp, payload
- Session tracking per connection ID
- Handlers dispatch based on MessageType enum (src/types.ts)
- Requires authentication before handling CRUD/recipe operations

**HttpRestServer** (src/server/HttpRestServer.ts)
- Provides REST API endpoints for connection management
- Runs on same port as QUIC server (configurable via REFINIO_API_PORT)
- Key endpoints:
  - `POST /api/connections/invite` - Accept invitation and establish connection
  - `GET /api/connections` - List active connections
  - `GET /api/contacts` - List contacts (via LeuteModel.others())
  - `GET /health` - Health check endpoint
- CORS enabled for cross-origin requests

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
- `LeuteModel` - Person/Profile management, contact access via `.others()`
- `ChannelManager` - CHUM channel communication
- `ConnectionsModel` - Instance-to-instance connection management, pairing invites
- All require `.init()` before use (src/index.ts:107-109)

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

### Testing and Debugging

**Integration Tests** (test/integration/connection-test.js):
- Tests complete connection flow between refinio.api and electron-app
- Verifies bidirectional contact creation
- Requires electron-app to be available in parent directory
- Run with: `npm run test:integration`

**Manual Testing**:
1. Configure refinio-api.config.json or set environment variables
2. `npm run build && npm start`
3. Test REST endpoints:
   ```bash
   # Health check
   curl http://localhost:49498/health

   # List contacts
   curl http://localhost:49498/api/contacts

   # Accept invitation
   curl -X POST http://localhost:49498/api/connections/invite \
     -H "Content-Type: application/json" \
     -d '{"inviteUrl": "https://one.refinio.net/invite#..."}'
   ```
4. Test QUIC WebSocket connection with ws library or WebSocket client

**Debugging Connection Issues**:
- Check `REFINIO_COMM_SERVER_URL` is correct and accessible
- Verify `allowPairing: true` in ConnectionsModel config
- Look for "onPairingSuccess callback fired" log messages
- Query contacts after connection: `await leuteModel.others()`
- Check network connectivity to CommServer

## ConnectionsModel Configuration (src/index.ts:116-127)

The ConnectionsModel is initialized with specific settings:
- `commServerUrl` - Communication server URL (default: wss://comm10.dev.refinio.one, override via REFINIO_COMM_SERVER_URL)
- `allowPairing: true` - **CRITICAL**: Required to accept invitations and trigger onPairingSuccess callbacks
- `acceptIncomingConnections` - Dynamic based on server role:
  - `true` when mounting filesystem (server creates invites)
  - `false` when running as client only
- `acceptUnknownInstances: false` - Only accept known instances
- `acceptUnknownPersons: false` - Only accept known persons
- `establishOutgoingConnections: true` - Can initiate connections (both server and client)
- `pairingTokenExpirationDuration: 3600000` - 1 hour token validity
- `noImport: false` / `noExport: false` - Enable data import/export

## Filesystem Integration (Optional)

The API server can optionally mount a virtual filesystem using ProjFS (Windows) or FUSE (Linux/Mac):

### Configuration (src/config.ts)
```typescript
filer: {
  mountPoint: 'C:\\OneFiler',              // Mount point for filesystem
  inviteUrlPrefix: 'https://one.refinio.net/invite',  // URL prefix for invite links
  debug: false                             // Enable debug logging
}
```

### Implementation (src/filer/)
- **IFileSystemAdapter** - Bridges IFileSystem to ProjFS/FUSE
- **createCompleteFiler** - Helper to create complete Filer with all 7 filesystems:
  - `/chats` - Chat/topic filesystem
  - `/debug` - Debug filesystem
  - `/invites` - Pairing invites (iop_invite.txt, iom_invite.txt and PNG QR codes)
  - `/objects` - ONE objects filesystem
  - `/types` - Recipe/type definitions
  - `/profiles` - Profile management
  - `/questionnaires` - Questionnaire filesystem

### Mount Process (src/index.ts:199-237)
1. Import IFileSystemAdapter and createCompleteFiler
2. Create complete Filer with all filesystems using all initialized models
3. Create adapter with mount point and filesystem
4. Call `adapter.mount()` to mount filesystem
5. All filesystems become accessible, including invites at `/invites/`

## Special Files

- `@OneObjectInterfaces.d.ts` - Augments one.core's object interface registry
- `src/OneCoreInit.ts` - ONE.core initialization utilities (if needed separately)
- `lib/` - Compiled JavaScript output (parallel to dist/)
- `src/helpers/ContactCreationHelper.ts` - Utility for automatic contact creation on connection
- `src/helpers/AccessRightsHelper.ts` - Utility for granting access rights after pairing
- `src/state/AppStateRecipes.ts` - Custom recipes for state synchronization

## Connection Establishment Flow

### Invitation-Based Pairing (src/handlers/ConnectionHandler.ts)

**Key Pattern**: Use callback registration BEFORE calling `connectUsingInvitation()`

```typescript
// 1. Create promise that resolves when pairing succeeds
const pairingPromise = new Promise((resolve, reject) => {
  // 2. Register callback FIRST (before initiating connection)
  const disconnectCallback = connectionsModel.pairing.onPairingSuccess(
    async (initiatedLocally, localPersonId, localInstanceId,
           remotePersonId, remoteInstanceId, token) => {
      // Callback fires when pairing succeeds
      resolve({ remotePersonId, remoteInstanceId });
    }
  );

  // 3. Set timeout to prevent infinite hangs
  setTimeout(() => reject(new Error('Timeout')), 60000);

  // 4. Initiate connection (callback will fire when successful)
  connectionsModel.pairing.connectUsingInvitation(invitation)
    .catch(reject);
});

// 5. Wait for callback to fire
const pairingInfo = await pairingPromise;

// 6. Create contact for remote person
await handleNewConnection(pairingInfo.remotePersonId, leuteModel);

// 7. Grant access rights for CHUM sync
await grantAccessRightsAfterPairing(pairingInfo.remotePersonId,
  leuteModel, channelManager);
```

**Critical Notes**:
- `allowPairing: true` MUST be set in ConnectionsModel config
- Callback must be registered BEFORE calling `connectUsingInvitation()`
- Connection is bidirectional - both sides create contacts for each other
- Contacts prove successful connection establishment

### Contact Creation Pattern (src/helpers/ContactCreationHelper.ts)

Contacts are automatically created when connections succeed using a three-step process:

```typescript
// 1. Create Profile using ProfileModel
const profile = await ProfileModel.constructWithNewProfile(
  ensureIdHash(personId),
  await leuteModel.myMainIdentity(),
  'default',
  [], // communicationEndpoints
  []  // personDescriptions
);
await profile.saveAndLoad();

// 2. Create Someone object linking to the Profile
const newSomeone = {
  $type$: 'Someone' as const,
  someoneId: personId,
  mainProfile: profileHash,
  identities: new Map([[personId.toString(), new Set([profileHash])]])
};
const someoneResult = await storeVersionedObject(newSomeone);

// 3. Add to contacts list (idempotent)
await leuteModel.addSomeoneElse(someoneResult.idHash);
```

**Helper Functions**:
- `ensureContactExists(personId, leuteModel)` - Checks for existing contact or creates new one
- `handleNewConnection(remotePersonId, leuteModel)` - Called automatically on pairing success

### Access Rights After Pairing (src/helpers/AccessRightsHelper.ts)

After successful pairing, access rights must be granted to enable CHUM channel synchronization:

```typescript
await grantAccessRightsAfterPairing(
  remotePersonId,
  leuteModel,
  channelManager
);
```

**What this does**:
1. Grants the remote person access to local Person object
2. Grants access to CHUM channels for data synchronization
3. Enables bidirectional state sharing via AppStateModel

**When to call**: Immediately after contact creation in the `onPairingSuccess` callback (both server and client sides)

## Common Pitfalls and Best Practices

### Connection Establishment
❌ **Wrong**: Calling `connectUsingInvitation()` without registering callback first
```typescript
// This will hang - callback fires but nobody is listening!
await connectionsModel.pairing.connectUsingInvitation(invitation);
```

✅ **Correct**: Register callback BEFORE calling `connectUsingInvitation()`
```typescript
const promise = new Promise((resolve) => {
  const disconnect = connectionsModel.pairing.onPairingSuccess(resolve);
  connectionsModel.pairing.connectUsingInvitation(invitation);
});
await promise;
```

### Model Initialization
❌ **Wrong**: Using models before calling `.init()`
```typescript
const leuteModel = new LeuteModel(commServerUrl, true);
await leuteModel.others(); // Will fail - not initialized!
```

✅ **Correct**: Always call `.init()` before using models
```typescript
const leuteModel = new LeuteModel(commServerUrl, true);
await leuteModel.init();
await leuteModel.others(); // Now works
```

### Import Paths
❌ **Wrong**: Omitting `.js` extension in ESM imports
```typescript
import { foo } from './bar'; // Will fail in ESM
```

✅ **Correct**: Always include `.js` extension
```typescript
import { foo } from './bar.js'; // Works in ESM
```

### Recipe Registration
❌ **Wrong**: Using object type without registering recipe
```typescript
const obj = { $type$: 'MyType', data: 'foo' };
await storeVersionedObject(obj); // Will fail - recipe not registered
```

✅ **Correct**: Register recipe in `initialRecipes` during `initInstance()`
```typescript
const MyTypeRecipe = { /* recipe definition */ };
await initInstance({
  initialRecipes: [...CORE_RECIPES, MyTypeRecipe]
});
```

## Known Limitations

- Delete operation not implemented (ONE.core is immutable by design)
- Authentication currently only supports instance owner
- QUIC transport uses WebSocket fallback (not native QUIC streams)
- Query functionality requires reverse maps setup (ObjectHandler.query())
- Storage encryption not fully supported on all platforms (config.ts:43)
- Filesystem integration requires fuse3.one package installed
