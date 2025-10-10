import '@refinio/one.core/lib/system/load-nodejs.js';
import { initInstance, getInstanceIdHash, registerRecipes, closeInstance } from '@refinio/one.core/lib/instance.js';
import { setBaseDirOrName } from '@refinio/one.core/lib/system/storage-base.js';
import { getQuicTransport } from '@refinio/one.core/lib/system/quic-transport.js';
import { createRandomString } from '@refinio/one.core/lib/system/crypto-helpers.js';
import One from '@refinio/one.models/lib/api/One.js';
import { QuicVCServer } from './server/QuicVCServer.js';
import { InstanceAuthManager } from './auth/InstanceAuthManager.js';
import { ObjectHandler } from './handlers/ObjectHandler.js';
import { RecipeHandler } from './handlers/RecipeHandler.js';
import { ProfileHandler } from './handlers/ProfileHandler.js';
import { loadConfig } from './config.js';
import { StateEntryRecipe, AppStateJournalRecipe } from './state/AppStateRecipes.js';

// Export state management components
export { AppStateModel, StateEntryRecipe, AppStateJournalRecipe } from './state/index.js';
export type { StateEntry, AppStateJournal } from './state/index.js';

export async function startApiServer() {
  const config = await loadConfig();

  // Set storage directory
  const storageDir = config.instance.directory || './storage';
  setBaseDirOrName(storageDir);

  // Import all recipes needed by one.models
  const [coreRecipes, stableRecipes, experimentalRecipes, stableReverseMaps, experimentalReverseMaps] = await Promise.all([
    import('@refinio/one.core/lib/recipes.js'),
    import('@refinio/one.models/lib/recipes/recipes-stable.js'),
    import('@refinio/one.models/lib/recipes/recipes-experimental.js'),
    import('@refinio/one.models/lib/recipes/reversemaps-stable.js'),
    import('@refinio/one.models/lib/recipes/reversemaps-experimental.js')
  ]);

  const CORE_RECIPES = (coreRecipes as any).CORE_RECIPES || [];
  const RecipesStable = (stableRecipes as any).default || [];
  const RecipesExperimental = (experimentalRecipes as any).default || [];
  const ReverseMapsStable = (stableReverseMaps as any).ReverseMapsStable || new Map();
  const ReverseMapsExperimental = (experimentalReverseMaps as any).ReverseMapsExperimental || new Map();
  const ReverseMapsForIdObjectsStable = (stableReverseMaps as any).ReverseMapsForIdObjectsStable || new Map();
  const ReverseMapsForIdObjectsExperimental = (experimentalReverseMaps as any).ReverseMapsForIdObjectsExperimental || new Map();

  const reverseMaps = new Map([
    ...ReverseMapsStable,
    ...ReverseMapsExperimental
  ]);

  const reverseMapsForIdObjects = new Map([
    ...ReverseMapsForIdObjectsStable,
    ...ReverseMapsForIdObjectsExperimental
  ]);

  // Initialize ONE.core instance with all recipes
  const instanceOptions = {
    name: config.instance.name || `api-${await createRandomString(16)}`,
    email: config.instance.email || `api@${await createRandomString(16)}.local`,
    secret: config.instance.secret || await createRandomString(32),
    directory: storageDir,
    encryptStorage: config.instance.encryptStorage !== false,
    initialRecipes: [...CORE_RECIPES, ...RecipesStable, ...RecipesExperimental, StateEntryRecipe, AppStateJournalRecipe],
    initiallyEnabledReverseMapTypes: reverseMaps as any,
    initiallyEnabledReverseMapTypesForIdObjects: reverseMapsForIdObjects as any,
    wipeStorage: false
  };
  
  await initInstance(instanceOptions);
  
  // Verify instance was created
  const instanceIdHash = getInstanceIdHash();
  if (!instanceIdHash) {
    throw new Error('Failed to initialize ONE.core instance');
  }
  
  console.log(`ONE.core instance initialized: ${instanceIdHash}`);
  
  // Get the QUIC transport from one.core
  const quicTransport = getQuicTransport();
  if (!quicTransport) {
    throw new Error('QUIC transport not initialized in platform');
  }

  // Create auth manager
  const authManager = new InstanceAuthManager();

  // Initialize models directly (like Replicant does)
  const { LeuteModel, ChannelManager, ConnectionsModel } = await import('@refinio/one.models/lib/models/index.js');

  // Default to public server (can be overridden via config file)
  const commServerUrl = config.instance.commServerUrl || 'wss://comm10.dev.refinio.one';
  console.log(`Using comm server: ${commServerUrl}`);

  const leuteModel = new LeuteModel(commServerUrl, true);
  const channelManager = new ChannelManager(leuteModel);
  const connectionsModel = new ConnectionsModel(leuteModel, {
    commServerUrl: commServerUrl,
    acceptIncomingConnections: false,  // Client only makes outgoing connections via invites
    acceptUnknownInstances: false,  // Client doesn't accept unknown instances
    acceptUnknownPersons: false,  // Client doesn't accept unknown persons
    allowPairing: true,  // REQUIRED to accept invitations and trigger onPairingSuccess callbacks
    allowDebugRequests: false,
    pairingTokenExpirationDuration: 3600000,
    establishOutgoingConnections: true,
    noImport: false,
    noExport: false
  });

  await leuteModel.init();
  console.log('✅ LeuteModel initialized');
  await channelManager.init();
  console.log('✅ ChannelManager initialized');
  await connectionsModel.init();
  console.log('✅ ConnectionsModel initialized - listening on CommServer:', commServerUrl);

  // Initialize handlers with the appropriate models
  const objectHandler = new ObjectHandler(channelManager);
  const recipeHandler = new RecipeHandler();
  const profileHandler = new ProfileHandler(leuteModel, authManager);
  const { ConnectionHandler } = await import('./handlers/ConnectionHandler.js');
  const connectionHandler = new ConnectionHandler(leuteModel, connectionsModel, channelManager);

  // Create QUICVC server using one.core's transport
  const server = new QuicVCServer({
    quicTransport,
    authManager,
    handlers: {
      object: objectHandler,
      recipe: recipeHandler,
      profile: profileHandler,
      connectionHandler
    },
    config: {
      port: config.server.port,
      host: config.server.host
    }
  });
  
  await server.start();
  console.log(`Refinio API server listening on ${config.server.host}:${config.server.port}`);
  console.log(`Instance: ${instanceOptions.name} (${instanceOptions.email})`);

  // Also start HTTP REST server for refinio.cli compatibility
  const { HttpRestServer } = await import('./server/HttpRestServer.js');
  const httpPort = parseInt(process.env.REFINIO_API_PORT || config.server.port.toString());
  const httpServer = new HttpRestServer(connectionHandler, leuteModel, httpPort);
  await httpServer.start();

  console.log(`HTTP REST API listening on port ${httpPort}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down API server...');
    await httpServer.stop();
    await server.stop();
    closeInstance();
    process.exit(0);
  });

  return { server, httpServer, channelManager, leuteModel, connectionsModel, instanceIdHash };
}

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cross-platform entry point detection
// Compare resolved absolute paths instead of URLs to handle Windows backslashes
const isMainModule = __filename === resolve(process.argv[1]);

if (isMainModule) {
  startApiServer().catch(console.error);
}