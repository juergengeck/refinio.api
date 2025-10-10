import { connectToInstance } from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/ConnectToInstance.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type { PublicKey } from '@refinio/one.core/lib/crypto/encryption.js';
import type { HexString } from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import { hexToUint8Array } from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import { handleNewConnection, ensureContactExists, type ProfileOptions } from '../helpers/ContactCreationHelper.js';
import { grantAccessRightsAfterPairing } from '../helpers/AccessRightsHelper.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Connection Handler for refinio.api
 *
 * Handles connection establishment with remote ONE instances and contact management.
 *
 * Key Concepts:
 * - Contacts are created automatically when a connection is successfully established
 * - Both sides of the connection should see each other as contacts (bidirectional)
 * - Contacts are accessed via LeuteModel.others() which returns SomeoneModel[]
 * - Each contact has a Profile with personId, nickname, and communicationEndpoints
 *
 * Connection Flow:
 * 1. One instance creates an invite (IOP invite)
 * 2. Other instance accepts the invite via connectToRemoteInstance()
 * 3. ConnectionsModel establishes the connection via CommServer
 * 4. Both instances automatically create contact entries for each other
 * 5. Contacts become visible via listContacts() / LeuteModel.others()
 */
export class ConnectionHandler {
  private leuteModel: LeuteModel;
  private connectionsModel: ConnectionsModel;
  private channelManager?: ChannelManager;

  constructor(leuteModel: LeuteModel, connectionsModel: ConnectionsModel, channelManager?: ChannelManager) {
    this.leuteModel = leuteModel;
    this.connectionsModel = connectionsModel;
    this.channelManager = channelManager;
  }

  /**
   * Connect to a remote instance using an invite URL or parameters
   */
  async connectToRemoteInstance(params: {
    url?: string;
    websocketUrl?: string;
    remotePublicKey: string;
    token?: string;
    connectionGroupName?: string;
  }) {
    try {
      console.log('ConnectionHandler: Establishing connection...');

      // Parse parameters
      const websocketUrl = params.websocketUrl || params.url;
      if (!websocketUrl) {
        throw new Error('WebSocket URL is required');
      }

      // Convert hex public key to PublicKey type
      const remotePublicKeyBytes = hexToUint8Array(params.remotePublicKey as HexString);
      const remotePublicKey = remotePublicKeyBytes as unknown as PublicKey;

      const connectionGroupName = params.connectionGroupName || 'default-connection-group';

      console.log(`  WebSocket URL: ${websocketUrl}`);
      console.log(`  Remote Public Key: ${params.remotePublicKey.substring(0, 16)}...`);
      console.log(`  Connection Group: ${connectionGroupName}`);

      // Establish connection using ONE.models connectToInstance
      const connectionInfo = await connectToInstance(
        websocketUrl,
        remotePublicKey,
        this.leuteModel,
        connectionGroupName
      );

      console.log('ConnectionHandler: Connection established successfully');

      // Automatically create contact for the remote person (symmetric on both sides)
      let contactCreated = false;
      try {
        console.log('ConnectionHandler: Creating contact for remote person...');
        await handleNewConnection(connectionInfo.personInfo.personId, this.leuteModel);
        contactCreated = true;
        console.log('ConnectionHandler: Contact created successfully');
      } catch (contactError) {
        console.error('ConnectionHandler: Failed to create contact:', contactError);
        // Continue even if contact creation fails - connection is still valid
      }

      return {
        success: true,
        connectionInfo: {
          localInstanceId: connectionInfo.instanceInfo.localInstanceId,
          remoteInstanceId: connectionInfo.instanceInfo.remoteInstanceId,
          personId: connectionInfo.personInfo.personId,
          isNewPerson: connectionInfo.personInfo.isNew,
          contactCreated
        }
      };
    } catch (error: any) {
      console.error('ConnectionHandler: Connection failed:', error);

      return {
        success: false,
        error: error.message,
        details: {
          code: error.code || 'CONNECTION_FAILED',
          stack: error.stack
        }
      };
    }
  }

  /**
   * Connect using an IOP invite
   */
  async connectWithInvite(inviteData: {
    url: string;
    publicKey: string;
    token: string;
  }) {
    console.log('ConnectionHandler: Connecting with IOP invite');
    console.log('ConnectionHandler: Invite data:', JSON.stringify(inviteData, null, 2));

    try {
      // Use ConnectionsModel.pairing.connectUsingInvitation() with callback pattern
      // This is the correct way - wait for the onPairingSuccess callback
      const invitation = {
        url: inviteData.url,
        publicKey: inviteData.publicKey as HexString,
        token: inviteData.token
      };
      console.log('ConnectionHandler: Parsed invitation:', JSON.stringify(invitation, null, 2));

      // Register callback FIRST, before calling connectUsingInvitation
      // Create a promise that resolves when pairing succeeds OR times out
      const pairingPromise = new Promise<{
        localPersonId: SHA256IdHash<any>;
        localInstanceId: SHA256IdHash<any>;
        remotePersonId: SHA256IdHash<any>;
        remoteInstanceId: SHA256IdHash<any>;
      }>((resolve, reject) => {
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        let disconnectCallback: (() => void) | null = null;

        // Cleanup function to prevent memory leaks
        const cleanup = () => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          if (disconnectCallback) {
            disconnectCallback();
            disconnectCallback = null;
          }
        };

        // Register one-time callback for this pairing
        const callback = async (
          initiatedLocally: boolean,
          localPersonId: SHA256IdHash<any>,
          localInstanceId: SHA256IdHash<any>,
          remotePersonId: SHA256IdHash<any>,
          remoteInstanceId: SHA256IdHash<any>,
          token: string
        ) => {
          console.log('ConnectionHandler: Pairing success callback fired');
          console.log(`  Initiated locally: ${initiatedLocally}`);
          console.log(`  Remote person: ${remotePersonId}`);
          console.log(`  Remote instance: ${remoteInstanceId}`);

          cleanup();
          resolve({
            localPersonId,
            localInstanceId,
            remotePersonId,
            remoteInstanceId
          });
        };

        // CRITICAL: Register callback BEFORE initiating connection
        // Store disconnect function to clean up if promise times out or errors
        disconnectCallback = this.connectionsModel.pairing.onPairingSuccess(callback);
        console.log('ConnectionHandler: Pairing callback registered, initiating connection...');

        // Set timeout to prevent infinite hangs (60 seconds should be enough)
        timeoutHandle = setTimeout(() => {
          cleanup();
          reject(new Error('Pairing timeout - onPairingSuccess callback never fired after 60 seconds'));
        }, 60000);

        // Initiate connection inside promise to catch errors
        console.log('ConnectionHandler: Establishing connection via ConnectionsModel.pairing...');
        this.connectionsModel.pairing.connectUsingInvitation(invitation)
          .then(() => {
            console.log('ConnectionHandler: connectUsingInvitation() completed, waiting for callback...');
          })
          .catch((error) => {
            console.error('ConnectionHandler: connectUsingInvitation() failed:', error);
            cleanup();
            reject(new Error(`Failed to initiate pairing: ${error.message}`));
          });
      });

      // Wait for the pairing success callback (with timeout)
      const pairingInfo = await pairingPromise;
      console.log('ConnectionHandler: Pairing success callback received');

      // Create contact for the remote person
      let contactCreated = false;
      try {
        console.log('ConnectionHandler: Creating contact for remote person...');
        await handleNewConnection(pairingInfo.remotePersonId, this.leuteModel);
        contactCreated = true;
        console.log('ConnectionHandler: Contact created successfully');

        // Grant access rights to create data for CHUM sync
        console.log('ConnectionHandler: Granting access rights to remote person...');
        await grantAccessRightsAfterPairing(
          pairingInfo.remotePersonId,
          this.leuteModel,
          this.channelManager
        );
        console.log('ConnectionHandler: Access rights granted');
      } catch (contactError) {
        console.error('ConnectionHandler: Failed to create contact or grant access:', contactError);
      }

      return {
        success: true,
        connectionInfo: {
          localInstanceId: pairingInfo.localInstanceId,
          remoteInstanceId: pairingInfo.remoteInstanceId,
          personId: pairingInfo.remotePersonId,
          isNewPerson: true,
          contactCreated
        }
      };
    } catch (error: any) {
      console.error('ConnectionHandler: Connection failed:', error);

      return {
        success: false,
        error: error.message,
        details: {
          code: error.code || 'CONNECTION_FAILED',
          stack: error.stack
        }
      };
    }
  }

  /**
   * List active connections
   */
  async listConnections() {
    try {
      // Use the injected ConnectionsModel instance
      const connections = this.connectionsModel.connectionsInfo();

      return {
        success: true,
        connections: connections.map((conn: any) => ({
          connectionId: conn.id,
          remotePersonId: conn.remotePersonId,
          remoteInstanceId: conn.remoteInstanceId,
          isOnline: conn.isOnline,
          established: conn.established
        }))
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get connection status
   */
  async getConnectionStatus() {
    try {
      // Use the injected ConnectionsModel instance
      const onlineState = this.connectionsModel.onlineState;
      const connections = this.connectionsModel.connectionsInfo();

      return {
        success: true,
        online: onlineState,
        totalConnections: connections.length,
        activeConnections: connections.filter((c: any) => c.isOnline).length
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List all contacts/persons
   *
   * Returns all known persons (contacts) from this instance.
   * Contacts are automatically created when a connection is successfully established.
   *
   * When two instances connect:
   * 1. Instance A accepts Instance B's invite
   * 2. ConnectionsModel establishes the connection
   * 3. Instance A creates a contact for Instance B
   * 4. Instance B creates a contact for Instance A
   * 5. Both can now see each other via listContacts()
   *
   * This bidirectional contact creation is the proof that connection succeeded.
   *
   * @returns Array of contacts with personId, nickname, and communicationEndpoints
   */
  async listContacts() {
    try {
      // Get all known persons except ourselves
      const someones = await this.leuteModel.others();

      const contacts = await Promise.all(
        someones.map(async (someone) => {
          try {
            const profile = await someone.mainProfile();
            return {
              personId: profile.personId,
              nickname: profile.nickname || null,
              communicationEndpoints: profile.communicationEndpoints.length > 0
                ? profile.communicationEndpoints
                : null
            };
          } catch (err) {
            // If profile loading fails, return minimal info
            return {
              personId: someone.idHash,
              nickname: null,
              communicationEndpoints: null
            };
          }
        })
      );

      return {
        success: true,
        contacts
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}