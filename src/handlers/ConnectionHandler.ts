import { connectToInstance } from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/ConnectToInstance.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import type { PublicKey } from '@refinio/one.core/lib/crypto/encryption.js';
import type { HexString } from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import { hexToUint8Array } from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';

/**
 * Connection Handler for refinio.api
 *
 * Handles connection establishment with remote ONE instances
 */
export class ConnectionHandler {
  private leuteModel: LeuteModel;
  private connectionsModel: ConnectionsModel;

  constructor(leuteModel: LeuteModel, connectionsModel: ConnectionsModel) {
    this.leuteModel = leuteModel;
    this.connectionsModel = connectionsModel;
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

      return {
        success: true,
        connectionInfo: {
          localInstanceId: connectionInfo.instanceInfo.localInstanceId,
          remoteInstanceId: connectionInfo.instanceInfo.remoteInstanceId,
          personId: connectionInfo.personInfo.personId,
          isNewPerson: connectionInfo.personInfo.isNew
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

    return this.connectToRemoteInstance({
      websocketUrl: inviteData.url,
      remotePublicKey: inviteData.publicKey,
      token: inviteData.token,
      connectionGroupName: 'iop-invite-connection'
    });
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
}