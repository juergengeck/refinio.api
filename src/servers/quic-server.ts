/**
 * QUIC Server
 *
 * Exposes handler registry through QUIC transport.
 * Uses one.core's QUIC transport implementation.
 *
 * Usage:
 *   const server = new QuicServer(registry, { port: 8080 });
 *   await server.start();
 */

import type { HandlerRegistry } from '../registry/HandlerRegistry.js';
import { QuicTransport } from '../transports/QuicTransport.js';
import type { QuicMessage } from '../transports/QuicTransport.js';

export interface QuicServerConfig {
  port: number;
  host?: string;
}

/**
 * QUIC Server
 *
 * Listens for QUIC connections and routes to handler registry
 */
export class QuicServer {
  private quicTransport: QuicTransport;
  private connections = new Map<string, any>();

  constructor(
    private registry: HandlerRegistry,
    private config: QuicServerConfig,
    private oneQuicTransport: any // ONE.core's QUIC transport
  ) {
    this.quicTransport = new QuicTransport(registry);
  }

  /**
   * Start the QUIC server
   */
  async start() {
    // Register message handler with one.core's QUIC transport
    this.oneQuicTransport.on('message', this.handleMessage.bind(this));
    this.oneQuicTransport.on('connection', this.handleConnection.bind(this));
    this.oneQuicTransport.on('close', this.handleClose.bind(this));

    console.log(`QUIC Server listening on ${this.config.host || '0.0.0.0'}:${this.config.port}`);
  }

  /**
   * Stop the server
   */
  async stop() {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
  }

  /**
   * Handle new connection
   */
  private handleConnection(connectionId: string, connection: any) {
    console.log(`New connection: ${connectionId}`);
    this.connections.set(connectionId, connection);
  }

  /**
   * Handle connection close
   */
  private handleClose(connectionId: string) {
    console.log(`Connection closed: ${connectionId}`);
    this.connections.delete(connectionId);
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(connectionId: string, data: any) {
    try {
      const message: QuicMessage = JSON.parse(data.toString());
      const response = await this.quicTransport.handleMessage(message);

      // Send response back
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error(`Error handling message from ${connectionId}:`, error);

      // Send error response
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.send(
          JSON.stringify({
            id: 'unknown',
            success: false,
            error: {
              code: 'PARSE_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error'
            }
          })
        );
      }
    }
  }
}
