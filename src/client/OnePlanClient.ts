/**
 * ONE Plan Client
 *
 * Universal client for executing Plans through refinio.api transports.
 * Used by browser/cube UIs to access ONE operations without running ONE.core locally.
 *
 * Architecture:
 * - Browser runs NO ONE.core
 * - All operations go through refinio.api server
 * - Server runs ONE.core + Plans
 * - Client receives Story objects
 */

import type { PlanTransaction, StoryResult } from '../registry/PlanRegistry.js';

export interface ClientConfig {
  baseUrl: string;
  transport: 'rest' | 'quic' | 'websocket';
  timeout?: number;
  retryCount?: number;
}

/**
 * ONE Plan Client (Abstract Base)
 *
 * Base class for all transport implementations
 */
export abstract class OnePlanClient {
  constructor(protected config: ClientConfig) {}

  /**
   * Execute a Plan
   *
   * @returns Story object with execution result
   */
  abstract execute<T = any>(
    plan: string,
    method: string,
    params?: any
  ): Promise<StoryResult<T>>;

  /**
   * Get available Plans
   */
  abstract listPlans(): Promise<string[]>;

  /**
   * Get Plan metadata
   */
  abstract getPlanMetadata(plan: string): Promise<any>;

  /**
   * Close client connection
   */
  abstract close(): Promise<void>;
}

/**
 * REST Client
 *
 * Connects to refinio.api REST server
 */
export class RestPlanClient extends OnePlanClient {
  constructor(config: Omit<ClientConfig, 'transport'>) {
    super({ ...config, transport: 'rest' });
  }

  async execute<T = any>(
    plan: string,
    method: string,
    params?: any
  ): Promise<StoryResult<T>> {
    const url = `${this.config.baseUrl}/api/${plan}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params),
      signal: this.config.timeout
        ? AbortSignal.timeout(this.config.timeout)
        : undefined
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // REST response wraps Story in { success, body }
    if (result.body) {
      return result.body;
    }

    return result;
  }

  async listPlans(): Promise<string[]> {
    const response = await fetch(`${this.config.baseUrl}/api`);
    const result = await response.json();
    return result.map((endpoint: any) => endpoint.handler);
  }

  async getPlanMetadata(plan: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/${plan}`);
    return await response.json();
  }

  async close(): Promise<void> {
    // No persistent connection to close
  }
}

/**
 * QUIC/WebSocket Client
 *
 * Connects to refinio.api QUIC server (WebSocket transport)
 */
export class QuicPlanClient extends OnePlanClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout?: NodeJS.Timeout;
    }
  >();

  constructor(config: Omit<ClientConfig, 'transport'>) {
    super({ ...config, transport: 'quic' });
  }

  /**
   * Connect to server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.baseUrl);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (error) => reject(new Error('WebSocket connection failed'));
      this.ws.onmessage = (event) => this.handleMessage(event.data);
      this.ws.onclose = () => this.handleClose();
    });
  }

  async execute<T = any>(
    plan: string,
    method: string,
    params?: any
  ): Promise<StoryResult<T>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = `req-${++this.messageId}`;
    const message = {
      id,
      handler: plan, // QUIC transport uses "handler" field for backward compat
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout
        ? setTimeout(() => {
            this.pendingRequests.delete(id);
            reject(new Error(`Request timeout: ${plan}.${method}`));
          }, this.config.timeout)
        : undefined;

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(message));
    });
  }

  private handleMessage(data: string) {
    try {
      const response = JSON.parse(data);
      const pending = this.pendingRequests.get(response.id);

      if (!pending) {
        console.warn('Received response for unknown request:', response.id);
        return;
      }

      this.pendingRequests.delete(response.id);

      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }

      // Convert QUIC response to Story format
      const story: StoryResult = {
        success: response.success,
        plan: {
          plan: response.handler || response.plan,
          method: response.method,
          params: response.params
        },
        data: response.data,
        error: response.error,
        timestamp: Date.now()
      };

      pending.resolve(story);
    } catch (error) {
      console.error('Failed to parse server response:', error);
    }
  }

  private handleClose() {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  async listPlans(): Promise<string[]> {
    // Send discovery request
    const story = await this.execute('_system', 'listPlans', {});
    return story.data;
  }

  async getPlanMetadata(plan: string): Promise<any> {
    const story = await this.execute('_system', 'getPlanMetadata', { plan });
    return story.data;
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Type-Safe Plan Proxy
 *
 * Creates a type-safe interface for Plans
 */
export function createPlanProxy<T extends Record<string, (...args: any[]) => Promise<any>>>(
  client: OnePlanClient,
  planName: string
): T {
  return new Proxy({} as T, {
    get(_target, methodName: string) {
      return async (...args: any[]) => {
        const story = await client.execute(planName, methodName, args);
        if (!story.success) {
          throw new Error(story.error?.message || 'Unknown error');
        }
        return story.data;
      };
    }
  });
}

/**
 * Factory function for creating clients
 */
export function createOnePlanClient(config: ClientConfig): OnePlanClient {
  if (config.transport === 'rest') {
    return new RestPlanClient(config);
  } else if (config.transport === 'quic' || config.transport === 'websocket') {
    return new QuicPlanClient(config);
  }

  throw new Error(`Unsupported transport: ${config.transport}`);
}
