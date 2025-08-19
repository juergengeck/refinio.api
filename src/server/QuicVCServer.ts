import { EventEmitter } from 'events';
import { Instance } from '@refinio/one.core';
import { QuicTransport, QuicConnection, QuicStream } from '@refinio/one.core/lib/system/quic-transport.js';
import { InstanceAuthManager, AuthSession } from '../auth/InstanceAuthManager';
import { MessageType, Message, ErrorCode } from '../types';

export interface QuicVCServerOptions {
  instance: Instance;
  quicTransport: QuicTransport;
  authManager: InstanceAuthManager;
  handlers: {
    object: any;
    recipe: any;
  };
  config: {
    port: number;
    host: string;
  };
}

/**
 * QUICVC Server using one.core's QUIC transport with verifiable credentials
 */
export class QuicVCServer extends EventEmitter {
  private options: QuicVCServerOptions;
  private connections: Map<string, QuicConnection> = new Map();
  private sessions: Map<string, AuthSession> = new Map();
  private streams: Map<string, QuicStream> = new Map();

  constructor(options: QuicVCServerOptions) {
    super();
    this.options = options;
  }

  async start() {
    const { quicTransport, config } = this.options;
    
    // Listen for incoming connections
    await quicTransport.listen({
      port: config.port,
      host: config.host
    });

    // Handle incoming connections
    quicTransport.on('connection', async (connection: QuicConnection) => {
      console.log(`New QUIC connection from ${connection.remoteAddress}:${connection.remotePort}`);
      this.handleConnection(connection);
    });

    // Handle incoming messages (WebSocket compatibility layer)
    quicTransport.on('message', async (data: any, connection: QuicConnection) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        await this.handleMessage(message, connection);
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });

    // Clean up sessions periodically
    setInterval(() => {
      this.options.authManager.cleanupSessions();
    }, 60 * 1000); // Every minute
  }

  private async handleConnection(connection: QuicConnection) {
    const clientId = `${connection.remoteAddress}:${connection.remotePort}`;
    this.connections.set(clientId, connection);

    // Handle connection close
    connection.on('close', () => {
      console.log(`Connection closed: ${clientId}`);
      this.connections.delete(clientId);
      this.sessions.delete(clientId);
    });
  }

  private async handleMessage(message: Message, connection: QuicConnection) {
    const clientId = `${connection.remoteAddress}:${connection.remotePort}`;
    
    switch (message.type) {
      case MessageType.AUTH_REQUEST:
        await this.handleAuthRequest(message, clientId, connection);
        break;
        
      case MessageType.AUTH_RESPONSE:
        await this.handleAuthResponse(message, clientId, connection);
        break;
        
      case MessageType.CREATE_REQUEST:
      case MessageType.READ_REQUEST:
      case MessageType.UPDATE_REQUEST:
      case MessageType.DELETE_REQUEST:
        await this.handleCrudOperation(message, clientId, connection);
        break;
        
      case MessageType.RECIPE_EXECUTE:
        await this.handleRecipeExecution(message, clientId, connection);
        break;
        
      case MessageType.STREAM_SUBSCRIBE:
        await this.handleStreamSubscribe(message, clientId, connection);
        break;
        
      default:
        await this.sendError(connection, message.id, ErrorCode.VALIDATION_ERROR, 'Unknown message type');
    }
  }

  private async handleAuthRequest(message: Message, clientId: string, connection: QuicConnection) {
    try {
      // Generate challenge for this client
      const challenge = await this.options.authManager.generateChallenge(clientId);
      
      // Send challenge back
      await this.sendMessage(connection, {
        id: message.id,
        type: MessageType.AUTH_CHALLENGE,
        timestamp: Date.now(),
        payload: { 
          challenge,
          instanceId: this.options.instance.id,
          instanceOwner: this.options.instance.owner.id
        }
      });
    } catch (error: any) {
      await this.sendError(connection, message.id, ErrorCode.INTERNAL_ERROR, 'Authentication failed');
    }
  }

  private async handleAuthResponse(message: Message, clientId: string, connection: QuicConnection) {
    try {
      const { personId, signature, publicKey } = message.payload;
      
      // Verify authentication using Instance's auth manager
      const session = await this.options.authManager.verifyAuthentication(
        clientId,
        personId,
        signature,
        publicKey
      );
      
      if (!session) {
        await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Authentication failed');
        return;
      }
      
      // Store session
      this.sessions.set(clientId, session);
      
      // Send success response
      await this.sendMessage(connection, {
        id: message.id,
        type: MessageType.AUTH_RESPONSE,
        timestamp: Date.now(),
        payload: {
          authenticated: true,
          personId: session.personId,
          isOwner: session.isOwner,
          permissions: session.permissions,
          expiresAt: session.expiresAt
        }
      });
    } catch (error: any) {
      await this.sendError(connection, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleCrudOperation(message: Message, clientId: string, connection: QuicConnection) {
    const session = this.sessions.get(clientId);
    
    if (!session) {
      await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }
    
    // Check permissions based on operation type
    let requiredPermission: 'read' | 'write' | 'delete' = 'read';
    
    switch (message.type) {
      case MessageType.CREATE_REQUEST:
      case MessageType.UPDATE_REQUEST:
        requiredPermission = 'write';
        break;
      case MessageType.DELETE_REQUEST:
        requiredPermission = 'delete';
        break;
      case MessageType.READ_REQUEST:
        requiredPermission = 'read';
        break;
    }
    
    if (!this.options.authManager.hasPermission(session, requiredPermission)) {
      await this.sendError(connection, message.id, ErrorCode.FORBIDDEN, `No ${requiredPermission} permission`);
      return;
    }
    
    try {
      let result: any;
      
      switch (message.type) {
        case MessageType.CREATE_REQUEST:
          result = await this.options.handlers.object.create(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.CREATE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
          
        case MessageType.READ_REQUEST:
          result = await this.options.handlers.object.read(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.READ_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
          
        case MessageType.UPDATE_REQUEST:
          result = await this.options.handlers.object.update(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.UPDATE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
          
        case MessageType.DELETE_REQUEST:
          result = await this.options.handlers.object.delete(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.DELETE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
      }
    } catch (error: any) {
      await this.sendError(connection, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleRecipeExecution(message: Message, clientId: string, connection: QuicConnection) {
    const session = this.sessions.get(clientId);
    
    if (!session) {
      await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }
    
    // Most recipes require write permission
    if (!this.options.authManager.hasPermission(session, 'write')) {
      await this.sendError(connection, message.id, ErrorCode.FORBIDDEN, 'No write permission for recipes');
      return;
    }
    
    try {
      const result = await this.options.handlers.recipe.execute(message.payload);
      await this.sendMessage(connection, {
        id: message.id,
        type: MessageType.RECIPE_RESULT,
        timestamp: Date.now(),
        payload: result
      });
    } catch (error: any) {
      await this.sendError(connection, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleStreamSubscribe(message: Message, clientId: string, connection: QuicConnection) {
    const session = this.sessions.get(clientId);
    
    if (!session) {
      await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }
    
    // Streaming requires at least read permission
    if (!this.options.authManager.hasPermission(session, 'read')) {
      await this.sendError(connection, message.id, ErrorCode.FORBIDDEN, 'No read permission for streaming');
      return;
    }
    
    // Create a stream for this subscription
    try {
      const stream = await this.options.quicTransport.createStream(connection);
      this.streams.set(`${clientId}-${message.id}`, stream);
      
      // Send acknowledgment
      await this.sendMessage(connection, {
        id: message.id,
        type: MessageType.STREAM_EVENT,
        timestamp: Date.now(),
        payload: { subscribed: true, streamId: stream.id }
      });
      
      // Set up event forwarding (simplified)
      this.options.instance.on('objectChange', async (event: any) => {
        if (stream) {
          await stream.write(Buffer.from(JSON.stringify({
            type: MessageType.STREAM_EVENT,
            timestamp: Date.now(),
            payload: event
          })));
        }
      });
    } catch (error: any) {
      await this.sendError(connection, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async sendMessage(connection: QuicConnection, message: Message) {
    // Use QUIC transport's send method (WebSocket compatibility)
    const data = JSON.stringify(message);
    await connection.send(data);
  }

  private async sendError(connection: QuicConnection, id: string, code: ErrorCode, message: string) {
    await this.sendMessage(connection, {
      id,
      type: 'error' as any,
      timestamp: Date.now(),
      payload: {
        error: {
          code,
          message
        }
      }
    });
  }

  async stop() {
    // Close all connections
    for (const connection of this.connections.values()) {
      await connection.close();
    }
    
    // Close QUIC transport
    await this.options.quicTransport.close();
  }
}