import { EventEmitter } from 'events';
import crypto from 'crypto';
import { CredentialManager } from '../auth/CredentialManager';
import { MessageType, Message, ErrorCode } from '../types';

export interface QuicServerOptions {
  port: number;
  host: string;
  credentialManager: CredentialManager;
  handlers: {
    object: any;
    recipe: any;
  };
}

export class QuicServer extends EventEmitter {
  private options: QuicServerOptions;
  private sessions: Map<string, any> = new Map();
  private server: any;

  constructor(options: QuicServerOptions) {
    super();
    this.options = options;
  }

  async start() {
    // Create UDP socket for QUIC
    const dgram = require('dgram');
    this.server = dgram.createSocket('udp4');
    
    this.server.on('message', async (msg: Buffer, rinfo: any) => {
      try {
        const message = JSON.parse(msg.toString()) as Message;
        await this.handleMessage(message, rinfo);
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });
    
    this.server.on('error', (err: Error) => {
      console.error('Server error:', err);
    });
    
    return new Promise<void>((resolve) => {
      this.server.bind(this.options.port, this.options.host, () => {
        resolve();
      });
    });
  }

  private async handleMessage(message: Message, rinfo: any) {
    const clientId = `${rinfo.address}:${rinfo.port}`;
    
    switch (message.type) {
      case MessageType.AUTH_REQUEST:
        await this.handleAuth(message, clientId, rinfo);
        break;
        
      case MessageType.CREATE_REQUEST:
      case MessageType.READ_REQUEST:
      case MessageType.UPDATE_REQUEST:
      case MessageType.DELETE_REQUEST:
        await this.handleCrudOperation(message, clientId, rinfo);
        break;
        
      case MessageType.RECIPE_EXECUTE:
        await this.handleRecipeExecution(message, clientId, rinfo);
        break;
        
      case MessageType.STREAM_SUBSCRIBE:
        await this.handleStreamSubscribe(message, clientId, rinfo);
        break;
        
      default:
        await this.sendError(rinfo, message.id, ErrorCode.VALIDATION_ERROR, 'Unknown message type');
    }
  }

  private async handleAuth(message: Message, clientId: string, rinfo: any) {
    try {
      // Generate challenge
      const challenge = crypto.randomBytes(32).toString('hex');
      
      // Send challenge
      await this.sendMessage(rinfo, {
        id: message.id,
        type: MessageType.AUTH_CHALLENGE,
        timestamp: Date.now(),
        payload: { challenge }
      });
      
      // Store challenge for verification
      this.sessions.set(clientId, { challenge, state: 'challenging' });
    } catch (error) {
      await this.sendError(rinfo, message.id, ErrorCode.INTERNAL_ERROR, 'Authentication failed');
    }
  }

  private async handleCrudOperation(message: Message, clientId: string, rinfo: any) {
    const session = this.sessions.get(clientId);
    
    if (!session || !session.authenticated) {
      await this.sendError(rinfo, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }
    
    try {
      let result: any;
      
      switch (message.type) {
        case MessageType.CREATE_REQUEST:
          result = await this.options.handlers.object.create(message.payload);
          await this.sendMessage(rinfo, {
            id: message.id,
            type: MessageType.CREATE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
          
        case MessageType.READ_REQUEST:
          result = await this.options.handlers.object.read(message.payload);
          await this.sendMessage(rinfo, {
            id: message.id,
            type: MessageType.READ_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
          
        case MessageType.UPDATE_REQUEST:
          result = await this.options.handlers.object.update(message.payload);
          await this.sendMessage(rinfo, {
            id: message.id,
            type: MessageType.UPDATE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
          
        case MessageType.DELETE_REQUEST:
          result = await this.options.handlers.object.delete(message.payload);
          await this.sendMessage(rinfo, {
            id: message.id,
            type: MessageType.DELETE_RESPONSE,
            timestamp: Date.now(),
            payload: result
          });
          break;
      }
    } catch (error: any) {
      await this.sendError(rinfo, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleRecipeExecution(message: Message, clientId: string, rinfo: any) {
    const session = this.sessions.get(clientId);
    
    if (!session || !session.authenticated) {
      await this.sendError(rinfo, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }
    
    try {
      const result = await this.options.handlers.recipe.execute(message.payload);
      await this.sendMessage(rinfo, {
        id: message.id,
        type: MessageType.RECIPE_RESULT,
        timestamp: Date.now(),
        payload: result
      });
    } catch (error: any) {
      await this.sendError(rinfo, message.id, ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  private async handleStreamSubscribe(message: Message, clientId: string, rinfo: any) {
    const session = this.sessions.get(clientId);
    
    if (!session || !session.authenticated) {
      await this.sendError(rinfo, message.id, ErrorCode.UNAUTHORIZED, 'Not authenticated');
      return;
    }
    
    // Store subscription
    if (!session.subscriptions) {
      session.subscriptions = [];
    }
    session.subscriptions.push(message.payload);
    
    // Send acknowledgment
    await this.sendMessage(rinfo, {
      id: message.id,
      type: MessageType.STREAM_EVENT,
      timestamp: Date.now(),
      payload: { subscribed: true }
    });
  }

  private async sendMessage(rinfo: any, message: Message) {
    const buffer = Buffer.from(JSON.stringify(message));
    this.server.send(buffer, rinfo.port, rinfo.address);
  }

  private async sendError(rinfo: any, id: string, code: ErrorCode, message: string) {
    await this.sendMessage(rinfo, {
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
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}