import { EventEmitter } from 'events';
import type { QuicTransport } from '@refinio/one.core/lib/system/quic-transport.js';
import { getInstanceIdHash } from '@refinio/one.core/lib/instance.js';
import { InstanceAuthManager, AuthSession } from '../auth/InstanceAuthManager.js';
import { ObjectHandler } from '../handlers/ObjectHandler.js';
import { RecipeHandler } from '../handlers/RecipeHandler.js';
import { ProfileHandler } from '../handlers/ProfileHandler.js';
import { MessageType, Message, ErrorCode } from '../types.js';
import crypto from 'crypto';

export interface QuicVCServerOptions {
  quicTransport: QuicTransport;
  authManager: InstanceAuthManager;
  handlers: {
    object: ObjectHandler;
    recipe: RecipeHandler;
    profile: ProfileHandler;
  };
  config: {
    port: number;
    host: string;
  };
}

interface ClientSession {
  id: string;
  authenticated: boolean;
  authSession?: AuthSession;
  challenge?: string;
  state: 'new' | 'challenging' | 'authenticated';
}

/**
 * QUICVC Server using one.core's QUIC transport with verifiable credentials
 * 
 * Note: This is a simplified implementation using the WebSocket-based QUIC transport.
 * In production, you would implement proper QUIC streams and verifiable credential validation.
 */
export class QuicVCServer extends EventEmitter {
  private options: QuicVCServerOptions;
  private sessions: Map<string, ClientSession> = new Map();
  private connections: Map<string, any> = new Map(); // Store connection objects for sending responses
  private isRunning: boolean = false;

  constructor(options: QuicVCServerOptions) {
    super();
    this.options = options;
  }

  async start() {
    const { quicTransport, config } = this.options;
    
    console.log(`Starting QUICVC server on ${config.host}:${config.port}`);
    
    // Listen for incoming connections
    await quicTransport.listen({
      port: config.port,
      host: config.host
    });
    
    // Set up message handlers
    this.setupMessageHandlers();
    
    this.isRunning = true;
    console.log(`QUICVC server listening on ${config.host}:${config.port}`);
  }

  async stop() {
    if (this.isRunning) {
      console.log('Stopping QUICVC server...');
      
      // Close all sessions
      this.sessions.clear();
      
      // Close the transport
      this.options.quicTransport.close();
      
      this.isRunning = false;
      console.log('QUICVC server stopped');
    }
  }

  private setupMessageHandlers() {
    const { quicTransport } = this.options;

    // Listen for incoming connections
    quicTransport.on('connection', (connection: any) => {
      console.log(`New connection: ${connection.id}`);
      this.connections.set(connection.id, connection);
    });

    // Handle messages from the WebSocket-based QUIC transport
    quicTransport.on('message', async (data: any, connection: any) => {
      try {
        console.log(`Received message from ${connection.id}:`, data.toString().substring(0, 100));
        const message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
        const clientId = connection.id;

        // Store connection for sending responses
        this.connections.set(clientId, connection);

        await this.handleMessage(message, clientId, connection);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    quicTransport.on('error', (error: Error) => {
      console.error('QUIC transport error:', error);
      this.emit('error', error);
    });

    quicTransport.on('close', (connection: any) => {
      console.log(`Connection closed: ${connection.id}`);
      this.connections.delete(connection.id);
      this.sessions.delete(connection.id);
    });
  }

  private async handleMessage(message: Message, clientId: string, connection: any) {
    // Get or create client session
    let session = this.sessions.get(clientId);
    if (!session) {
      session = {
        id: clientId,
        authenticated: false,
        state: 'new'
      };
      this.sessions.set(clientId, session);
    }

    // Handle message based on type
    switch (message.type) {
      case MessageType.AUTH_REQUEST:
        await this.handleAuthRequest(message, session, connection);
        break;

      case MessageType.CREATE_REQUEST:
      case MessageType.READ_REQUEST:
      case MessageType.UPDATE_REQUEST:
      case MessageType.DELETE_REQUEST:
        await this.handleCrudOperation(message, session, connection);
        break;

      case MessageType.RECIPE_REGISTER:
      case MessageType.RECIPE_GET:
      case MessageType.RECIPE_LIST:
        await this.handleRecipeOperation(message, session, connection);
        break;

      case MessageType.STREAM_SUBSCRIBE:
        await this.handleStreamSubscribe(message, session, connection);
        break;

      default:
        await this.sendError(connection, message.id, ErrorCode.VALIDATION_ERROR, 'Unknown message type');
    }
  }

  private async handleAuthRequest(message: Message, session: ClientSession, connection: any) {
    try {
      const { authManager } = this.options;

      if (message.payload.response && session.challenge) {
        // Verify challenge response
        const authSession = await authManager.verifyChallenge(session.id, message.payload.response);

        if (authSession) {
          session.authenticated = true;
          session.authSession = authSession;
          session.state = 'authenticated';

          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.AUTH_RESPONSE,
            timestamp: Date.now(),
            payload: {
              success: true,
              sessionToken: authSession.sessionToken,
              permissions: authSession.permissions
            }
          });
        } else {
          await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Invalid credentials');
        }
      } else {
        // Generate and send challenge
        const challenge = await authManager.generateChallenge(session.id);
        session.challenge = challenge;
        session.state = 'challenging';

        await this.sendMessage(connection, {
          id: message.id,
          type: MessageType.AUTH_CHALLENGE,
          timestamp: Date.now(),
          payload: { challenge }
        });
      }
    } catch (error: any) {
      await this.sendError(connection, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleCrudOperation(message: Message, session: ClientSession, connection: any) {
    if (!session.authenticated || !session.authSession) {
      await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }

    const { object } = this.options.handlers;

    try {
      let result: any;

      switch (message.type) {
        case MessageType.CREATE_REQUEST:
          result = await object.create(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.CREATE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;

        case MessageType.READ_REQUEST:
          result = await object.read(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.READ_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;

        case MessageType.UPDATE_REQUEST:
          result = await object.update(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.UPDATE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;

        case MessageType.DELETE_REQUEST:
          result = await object.delete(message.payload);
          await this.sendMessage(connection, {
            id: message.id,
            type: MessageType.DELETE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
      }
    } catch (error: any) {
      await this.sendError(connection, message.id, error.code || ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleRecipeOperation(message: Message, session: ClientSession, connection: any) {
    if (!session.authenticated || !session.authSession) {
      await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }

    const { recipe } = this.options.handlers;

    try {
      let result: any;

      switch (message.type) {
        case MessageType.RECIPE_REGISTER:
          result = await recipe.register(message.payload);
          break;

        case MessageType.RECIPE_GET:
          result = await recipe.get(message.payload);
          break;

        case MessageType.RECIPE_LIST:
          result = await recipe.list();
          break;
      }

      await this.sendMessage(connection, {
        id: message.id,
        type: MessageType.RECIPE_RESPONSE,
        timestamp: Date.now(),
        payload: result
      });
    } catch (error: any) {
      await this.sendError(connection, message.id, error.code || ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleStreamSubscribe(message: Message, session: ClientSession, connection: any) {
    if (!session.authenticated) {
      await this.sendError(connection, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }

    // Stream subscription would be implemented here
    // For now, just acknowledge
    await this.sendMessage(connection, {
      id: message.id,
      type: MessageType.STREAM_EVENT,
      timestamp: Date.now(),
      payload: {
        subscribed: true,
        message: 'Stream subscription not yet implemented'
      }
    });
  }

  private async sendMessage(connection: any, message: Message) {
    try {
      const { quicTransport } = this.options;
      const data = JSON.stringify(message);

      // Get the WebSocket client for this connection
      const ws = (quicTransport as any).wsClients?.get(connection.id);
      if (ws && ws.readyState === 1) { // 1 = OPEN
        ws.send(data);
      } else {
        console.error(`Cannot send to ${connection.id}: connection not available`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private async sendError(connection: any, messageId: string, code: ErrorCode, message: string) {
    await this.sendMessage(connection, {
      id: messageId,
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
}