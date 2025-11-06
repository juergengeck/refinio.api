/**
 * Handler Registry
 *
 * Central registry for all LAMA handlers.
 * Handlers are registered once and automatically exposed through all transports:
 * - MCP Server (for Claude Code, AI tools)
 * - QUIC Server (for Web/CLI clients)
 * - IPC Adapter (for Electron UI)
 * - WebSocket fallback
 *
 * Key Principles:
 * - Handlers are platform-agnostic (from lama.core)
 * - Registry provides type-safe method invocation
 * - Transports auto-discover handlers and methods
 * - No manual wrapping per transport
 */

export interface Handler {
  [methodName: string]: (...args: any[]) => Promise<any>;
}

export interface HandlerMetadata {
  name: string;
  description?: string;
  version?: string;
  methods: MethodMetadata[];
}

export interface MethodMetadata {
  name: string;
  description?: string;
  params?: ParameterMetadata[];
  returns?: string;
}

export interface ParameterMetadata {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface CallResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Handler Registry
 *
 * Manages all handlers and provides unified invocation interface
 */
export class HandlerRegistry {
  private handlers = new Map<string, Handler>();
  private metadata = new Map<string, HandlerMetadata>();

  /**
   * Register a handler
   *
   * @param name - Handler name (e.g., 'memory', 'chat', 'aiAssistant')
   * @param handler - Handler instance with methods
   * @param metadata - Optional metadata for documentation/discovery
   */
  register(name: string, handler: Handler, metadata?: Partial<HandlerMetadata>) {
    if (this.handlers.has(name)) {
      throw new Error(`Handler '${name}' is already registered`);
    }

    this.handlers.set(name, handler);

    // Extract method names from handler
    const methods = this.extractMethods(handler);

    this.metadata.set(name, {
      name,
      description: metadata?.description,
      version: metadata?.version,
      methods: methods.map(methodName => ({
        name: methodName,
        description: metadata?.methods?.find(m => m.name === methodName)?.description
      }))
    });
  }

  /**
   * Unregister a handler
   */
  unregister(name: string): boolean {
    this.metadata.delete(name);
    return this.handlers.delete(name);
  }

  /**
   * Call a handler method
   *
   * @param handlerName - Handler name
   * @param methodName - Method name
   * @param params - Method parameters (single object or array of args)
   * @returns Result wrapped in CallResult
   */
  async call<T = any>(
    handlerName: string,
    methodName: string,
    params?: any
  ): Promise<CallResult<T>> {
    try {
      const handler = this.handlers.get(handlerName);

      if (!handler) {
        return {
          success: false,
          error: {
            code: 'HANDLER_NOT_FOUND',
            message: `Handler '${handlerName}' not found`
          }
        };
      }

      const method = handler[methodName];

      if (typeof method !== 'function') {
        return {
          success: false,
          error: {
            code: 'METHOD_NOT_FOUND',
            message: `Method '${methodName}' not found on handler '${handlerName}'`
          }
        };
      }

      // Invoke method - params can be single object or array
      const result = Array.isArray(params)
        ? await method.apply(handler, params)
        : await method.call(handler, params);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: error
        }
      };
    }
  }

  /**
   * Get a handler instance
   */
  getHandler<T extends Handler = Handler>(name: string): T | undefined {
    return this.handlers.get(name) as T | undefined;
  }

  /**
   * Check if handler exists
   */
  hasHandler(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Get handler metadata
   */
  getMetadata(name: string): HandlerMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * List all registered handlers
   */
  listHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all handler metadata
   */
  getAllMetadata(): HandlerMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Extract method names from handler
   * (skips constructor and private methods starting with _)
   */
  private extractMethods(handler: Handler): string[] {
    const methods: string[] = [];
    const proto = Object.getPrototypeOf(handler);

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (
        name !== 'constructor' &&
        !name.startsWith('_') &&
        typeof proto[name] === 'function'
      ) {
        methods.push(name);
      }
    }

    return methods;
  }

  /**
   * Create a proxy for type-safe handler invocation
   *
   * Usage:
   * const memory = registry.proxy<MemoryHandler>('memory');
   * const result = await memory.createSubject(params);
   */
  proxy<T extends Handler>(handlerName: string): T {
    const registry = this;

    return new Proxy({} as T, {
      get(_target, methodName: string) {
        return async (...args: any[]) => {
          const result = await registry.call(handlerName, methodName, args);
          if (!result.success) {
            throw new Error(result.error?.message || 'Unknown error');
          }
          return result.data;
        };
      }
    });
  }
}

/**
 * Create a new handler registry
 */
export function createHandlerRegistry(): HandlerRegistry {
  return new HandlerRegistry();
}
