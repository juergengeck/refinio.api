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
  
  // Initialize ONE.core instance (similar to one.leute.replicant)
  const instanceOptions = {
    name: config.instance.name || `api-${await createRandomString(16)}`,
    email: config.instance.email || `api@${await createRandomString(16)}.local`,
    secret: config.instance.secret || await createRandomString(32),
    directory: storageDir,
    encryptStorage: config.instance.encryptStorage !== false,
    initialRecipes: [StateEntryRecipe, AppStateJournalRecipe]
  };
  
  await initInstance(instanceOptions);
  
  // Verify instance was created
  const instanceIdHash = getInstanceIdHash();
  if (!instanceIdHash) {
    throw new Error('Failed to initialize ONE.core instance');
  }
  
  console.log(`ONE.core instance initialized: ${instanceIdHash}`);
  
  // Initialize ONE.models API facade
  const oneApi = new One({
    commServerUrl: `http://${config.server.host}:${config.server.port}`
  });
  
  await oneApi.init();
  
  // Get the QUIC transport from one.core
  const quicTransport = getQuicTransport();
  if (!quicTransport) {
    throw new Error('QUIC transport not initialized in platform');
  }
  
  // Create auth manager
  const authManager = new InstanceAuthManager();
  
  // Initialize handlers with the ONE API
  const objectHandler = new ObjectHandler(oneApi);
  const recipeHandler = new RecipeHandler();
  const profileHandler = new ProfileHandler(oneApi, authManager);
  
  // Create QUICVC server using one.core's transport
  const server = new QuicVCServer({
    quicTransport,
    authManager,
    handlers: {
      object: objectHandler,
      recipe: recipeHandler,
      profile: profileHandler
    },
    config: {
      port: config.server.port,
      host: config.server.host
    }
  });
  
  await server.start();
  console.log(`Refinio API server listening on ${config.server.host}:${config.server.port}`);
  console.log(`Instance: ${instanceOptions.name} (${instanceOptions.email})`);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down API server...');
    await server.stop();
    await oneApi.shutdown();
    closeInstance();
    process.exit(0);
  });
  
  return { server, oneApi, instanceIdHash };
}

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer().catch(console.error);
}