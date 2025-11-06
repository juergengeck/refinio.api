/**
 * QUIC Transport Adapter
 *
 * Exposes handler registry through QUIC/WebSocket transport.
 * Messages use JSON-RPC-like protocol:
 *
 * Request:
 * {
 *   id: 'uuid',
 *   handler: 'memory',
 *   method: 'createSubject',
 *   params: { ... }
 * }
 *
 * Response:
 * {
 *   id: 'uuid',
 *   success: true,
 *   data: { ... }
 * }
 */

import type { HandlerRegistry } from '../registry/HandlerRegistry.js';

export interface QuicMessage {
  id: string;
  handler: string;
  method: string;
  params?: any;
}

export interface QuicResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * QUIC Transport
 *
 * Handles incoming QUIC/WebSocket messages and routes to registry
 */
export class QuicTransport {
  constructor(private registry: HandlerRegistry) {}

  /**
   * Handle incoming message
   */
  async handleMessage(message: QuicMessage): Promise<QuicResponse> {
    const { id, handler, method, params } = message;

    // Validate message
    if (!handler || !method) {
      return {
        id,
        success: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Missing handler or method'
        }
      };
    }

    // Call registry
    const result = await this.registry.call(handler, method, params);

    return {
      id,
      success: result.success,
      data: result.data,
      error: result.error
    };
  }

  /**
   * List available handlers (for discovery)
   */
  getHandlers() {
    return this.registry.getAllMetadata();
  }
}
