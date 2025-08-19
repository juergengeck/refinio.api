import '@refinio/one.core/lib/system/load-nodejs.js';
import { createInstance } from '@refinio/one.core';
import { getQuicTransport } from '@refinio/one.core/lib/system/quic-transport.js';
import { QuicVCServer } from './server/QuicVCServer';
import { InstanceAuthManager } from './auth/InstanceAuthManager';
import { ObjectHandler } from './handlers/ObjectHandler';
import { RecipeHandler } from './handlers/RecipeHandler';
import { loadConfig } from './config';

export async function startApiServer() {
  const config = await loadConfig();
  
  // Create or load the Instance - the owner of this Instance is the admin
  const instance = await createInstance({
    name: config.instance.name,
    email: config.instance.email,
    secret: config.instance.secret,
    directory: config.instance.directory,
    encryptStorage: config.instance.encryptStorage
  });
  
  // Get the QUIC transport from one.core
  const quicTransport = getQuicTransport();
  if (!quicTransport) {
    throw new Error('QUIC transport not initialized in platform');
  }
  
  // Create auth manager that uses Instance ownership
  const authManager = new InstanceAuthManager(instance);
  
  // Initialize handlers with the Instance
  const objectHandler = new ObjectHandler();
  await objectHandler.initialize(instance);
  
  const recipeHandler = new RecipeHandler();
  await recipeHandler.initialize(instance);
  
  // Create QUICVC server using one.core's transport
  const server = new QuicVCServer({
    instance,
    quicTransport,
    authManager,
    handlers: {
      object: objectHandler,
      recipe: recipeHandler
    },
    config: {
      port: config.server.port,
      host: config.server.host
    }
  });
  
  await server.start();
  console.log(`Refinio API server listening on ${config.server.host}:${config.server.port}`);
  console.log(`Instance owner (admin): ${instance.owner.email}`);
  
  return { server, instance };
}

if (require.main === module) {
  startApiServer().catch(console.error);
}