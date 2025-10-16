import '@refinio/one.core/lib/system/load-nodejs.js';
import { initInstance, getInstanceIdHash, getInstanceOwnerIdHash, registerRecipes, closeInstance } from '@refinio/one.core/lib/instance.js';
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

export async function startApiServer(): Promise<{
  server: any;
  httpServer: any;
  channelManager: any;
  leuteModel: any;
  connectionsModel: any;
  instanceIdHash: string;
  filerAdapter: any;
}> {
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
    ownerName: config.instance.ownerName || config.instance.email || 'API Owner',
    directory: storageDir,
    encryptStorage: config.instance.encryptStorage !== false,
    initialRecipes: [...CORE_RECIPES, ...RecipesStable, ...RecipesExperimental, StateEntryRecipe, AppStateJournalRecipe],
    initiallyEnabledReverseMapTypes: reverseMaps as any,
    initiallyEnabledReverseMapTypesForIdObjects: reverseMapsForIdObjects as any,
    wipeStorage: config.instance.wipeStorage || false
  };

  await initInstance(instanceOptions);

  // Verify instance was created
  const instanceIdHash = getInstanceIdHash();
  if (!instanceIdHash) {
    throw new Error('Failed to initialize ONE.core instance');
  }

  console.log(`ONE.core instance initialized: ${instanceIdHash}`);
  const ownerIdHash = getInstanceOwnerIdHash();
  console.log(`Instance owner: ${ownerIdHash}`);

  // Verify owner Person exists in storage
  if (ownerIdHash) {
    const { getIdObject } = await import('@refinio/one.core/lib/storage-versioned-objects.js');
    try {
      const ownerPerson = await getIdObject(ownerIdHash);
      console.log(`Owner Person verified in storage:`, ownerPerson);
    } catch (err) {
      console.error(`Owner Person NOT found in storage!`, err);
      throw new Error(`Owner Person (${ownerIdHash}) not found in storage after initInstance`);
    }
  }

  // Get the QUIC transport from one.core
  const quicTransport = getQuicTransport();
  if (!quicTransport) {
    throw new Error('QUIC transport not initialized in platform');
  }

  // Create auth manager
  const authManager = new InstanceAuthManager();

  // Initialize models directly (like Replicant does)
  const {
    LeuteModel,
    ChannelManager,
    ConnectionsModel
  } = await import('@refinio/one.models/lib/models/index.js');

  const { default: TopicModel } = await import('@refinio/one.models/lib/models/Chat/TopicModel.js');
  const { default: Notifications } = await import('@refinio/one.models/lib/models/Notifications.js');
  const { default: IoMManager } = await import('@refinio/one.models/lib/models/IoM/IoMManager.js');
  const { default: JournalModel } = await import('@refinio/one.models/lib/models/JournalModel.js');
  const { default: QuestionnaireModel } = await import('@refinio/one.models/lib/models/QuestionnaireModel.js');

  // Default to public server (can be overridden via config file)
  const commServerUrl = config.instance.commServerUrl || 'wss://comm10.dev.refinio.one';
  console.log(`Using comm server: ${commServerUrl}`);

  const leuteModel = new LeuteModel(commServerUrl, true);
  const channelManager = new ChannelManager(leuteModel);
  const topicModel = new TopicModel(channelManager, leuteModel);
  const notifications = new Notifications(channelManager);
  const iomManager = new IoMManager(leuteModel, commServerUrl);

  // Create empty JournalModel and QuestionnaireModel for filesystem structure
  // (not fully initialized, but sufficient for filesystem to work)
  const journalModel = null as any;  // JournalFileSystem will handle gracefully
  const questionnaireModel = new QuestionnaireModel(channelManager);

  // If we're mounting a filesystem (creating invites), we need to accept incoming connections
  const isServer = !!config.filer?.mountPoint;

  const connectionsModel = new ConnectionsModel(leuteModel, {
    commServerUrl: commServerUrl,
    acceptIncomingConnections: isServer,  // Accept connections when we create invites
    acceptUnknownInstances: false,  // Don't accept unknown instances
    acceptUnknownPersons: false,  // Don't accept unknown persons
    allowPairing: true,  // REQUIRED for both creating and accepting invitations
    allowDebugRequests: false,
    pairingTokenExpirationDuration: 3600000,
    establishOutgoingConnections: true,  // Both server and client can make outgoing connections
    noImport: false,
    noExport: false
  });

  await leuteModel.init();
  console.log('✅ LeuteModel initialized');
  await channelManager.init();
  console.log('✅ ChannelManager initialized');
  await connectionsModel.init();
  console.log('✅ ConnectionsModel initialized - listening on CommServer:', commServerUrl);
  await topicModel.init();
  console.log('✅ TopicModel initialized');
  await questionnaireModel.init();
  console.log('✅ QuestionnaireModel initialized');

  // Register global pairing success handler for both incoming and outgoing connections
  // This ensures both SERVER (invite creator) and CLIENT (invite acceptor) create contacts
  const { handleNewConnection } = await import('./helpers/ContactCreationHelper.js');
  const { grantAccessRightsAfterPairing } = await import('./helpers/AccessRightsHelper.js');

  connectionsModel.pairing.onPairingSuccess(
    async (initiatedLocally, localPersonId, localInstanceId, remotePersonId, remoteInstanceId, token) => {
      console.log(`[PAIRING] Pairing success - initiated locally: ${initiatedLocally}`);
      console.log(`[PAIRING] Remote person: ${remotePersonId}`);

      try {
        // Create contact for remote person
        await handleNewConnection(remotePersonId, leuteModel);
        console.log('[PAIRING] Contact created successfully');

        // Grant access rights for CHUM sync
        await grantAccessRightsAfterPairing(remotePersonId, leuteModel, channelManager);
        console.log('[PAIRING] Access rights granted');
      } catch (error) {
        console.error('[PAIRING] Failed to create contact or grant access:', error);
      }
    }
  );

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
  // Use next port to avoid conflict with QuicVCServer
  const httpPort = config.server.port + 1;
  const { HttpRestServer } = await import('./server/HttpRestServer.js');
  const httpServer = new HttpRestServer(connectionHandler, leuteModel, httpPort);
  await httpServer.start();

  console.log(`HTTP REST API listening on port ${httpPort}`);

  // Optionally mount filesystem
  let filerAdapter = null;
  if (config.filer?.mountPoint) {
    console.log(`Mounting filesystem at ${config.filer.mountPoint}...`);

    try {
      // Import filer adapter and helper
      const { IFileSystemAdapter } = await import('./filer/IFileSystemAdapter.js');
      const { createCompleteFiler } = await import('./filer/createFilerWithPairing.js');

      // Create complete filer with all filesystems
      const inviteUrlPrefix = config.filer.inviteUrlPrefix || 'https://one.refinio.net/invite';
      const fileSystem = await createCompleteFiler({
        leuteModel,
        topicModel,
        channelManager,
        connectionsModel,
        notifications,
        iomManager,
        journalModel,
        questionnaireModel,
        commServerUrl,
        inviteUrlPrefix
      });

      // Create adapter and mount
      filerAdapter = new IFileSystemAdapter({
        mountPoint: config.filer.mountPoint,
        fileSystem,
        debug: true  // Always enable debug for testing
      });

      await filerAdapter.mount();
      console.log(`✅ Filesystem mounted at ${config.filer.mountPoint}`);
    } catch (error) {
      console.error('Failed to mount filesystem:', error);
      console.error('  This is expected if ProjFS native module is not built');
      console.error('  Server will still accept incoming connections');
      // Don't throw - server can still work without filesystem mount
    }
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down API server...');
    if (filerAdapter) {
      await filerAdapter.unmount();
    }
    await httpServer.stop();
    await server.stop();
    closeInstance();
    process.exit(0);
  });

  return { server, httpServer, channelManager, leuteModel, connectionsModel, instanceIdHash, filerAdapter };
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