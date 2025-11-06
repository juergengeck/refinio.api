/**
 * Initialize ONE Platform Plans
 *
 * Registers all core ONE.core and ONE.models Plans.
 * This is the canonical API surface for the ONE platform.
 *
 * Follows ONE first principles:
 * - Plan objects contain method and parameters
 * - Plans are evaluated and results stored in Story objects
 *
 * Used by:
 * - refinio.one (reference CLI/server)
 * - lama.electron (includes LAMA-specific Plans)
 * - Any ONE-based application
 */

import { PlanRegistry, createPlanRegistry } from './PlanRegistry.js';
import { OneStoragePlan } from '../handlers/OneStoragePlan.js';
import { OneLeutePlan } from '../handlers/OneLeutePlan.js';
import { OneChannelsPlan } from '../handlers/OneChannelsPlan.js';
import { OneCryptoPlan } from '../handlers/OneCryptoPlan.js';
import { OneInstancePlan } from '../handlers/OneInstancePlan.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';

export interface OneDependencies {
  leuteModel: LeuteModel;
  channelManager: ChannelManager;
}

/**
 * Initialize ONE Platform Plans
 *
 * Creates registry with all core ONE operations.
 * Returns registry ready for any transport (stdio, QUIC, REST, IPC).
 */
export function initializeOnePlans(deps: OneDependencies): PlanRegistry {
  const registry = createPlanRegistry();

  // Core ONE Plans
  registry.register('one.storage', new OneStoragePlan(), {
    description: 'ONE.core storage operations',
    version: '1.0.0',
    methods: [
      { name: 'storeVersionedObject', description: 'Store versioned object' },
      { name: 'getObjectByIdHash', description: 'Get latest version by ID hash' },
      { name: 'getVersionedObjectByHash', description: 'Get specific version' },
      { name: 'storeUnversionedObject', description: 'Store unversioned object' },
      { name: 'getUnversionedObject', description: 'Get unversioned object' },
      { name: 'storeBlob', description: 'Store binary data' },
      { name: 'readBlob', description: 'Read binary data' }
    ]
  });

  registry.register('one.leute', new OneLeutePlan(deps.leuteModel), {
    description: 'ONE.models identity and contact management',
    version: '1.0.0',
    methods: [
      { name: 'getOwnIdentity', description: 'Get own Person identity' },
      { name: 'getContacts', description: 'Get all contacts' },
      { name: 'getContact', description: 'Get specific contact' },
      { name: 'createContact', description: 'Create new contact' },
      { name: 'updateContact', description: 'Update contact' },
      { name: 'getGroups', description: 'Get all groups' },
      { name: 'createGroup', description: 'Create new group' },
      { name: 'addGroupMember', description: 'Add member to group' },
      { name: 'removeGroupMember', description: 'Remove member from group' }
    ]
  });

  registry.register('one.channels', new OneChannelsPlan(deps.channelManager), {
    description: 'ONE.models channel management',
    version: '1.0.0',
    methods: [
      { name: 'createChannel', description: 'Create new channel' },
      { name: 'postToChannel', description: 'Post object to channel' },
      { name: 'getChannel', description: 'Get channel info' },
      { name: 'listChannels', description: 'List all channels' },
      { name: 'getMatchingChannels', description: 'Get matching channel infos' },
      { name: 'deleteChannel', description: 'Delete channel' }
    ]
  });

  registry.register('one.crypto', new OneCryptoPlan(), {
    description: 'ONE.core cryptographic operations',
    version: '1.0.0',
    methods: [
      { name: 'sign', description: 'Sign data' },
      { name: 'verify', description: 'Verify signature' },
      { name: 'encrypt', description: 'Encrypt data' },
      { name: 'decrypt', description: 'Decrypt data' },
      { name: 'hash', description: 'Calculate SHA-256 hash' }
    ]
  });

  registry.register('one.instance', new OneInstancePlan(), {
    description: 'ONE.core instance management',
    version: '1.0.0',
    methods: [
      { name: 'getInstanceId', description: 'Get instance ID hash' },
      { name: 'getOwner', description: 'Get instance owner' },
      { name: 'getInfo', description: 'Get instance information' }
    ]
  });

  return registry;
}
