/**
 * TransportPlan - Base class for all transport implementations
 *
 * Transport plans handle protocol-specific request/response patterns and
 * route operations to the plan registry. Each transport (IPC, HTTP, stdio,
 * WebWorker, React Native bridge) extends this base class.
 *
 * Responsibilities:
 * - Start/stop transport server
 * - Extract authentication context from protocol-specific requests
 * - Route operations to plan registry
 * - Format responses according to protocol conventions
 * - Handle errors and convert to protocol-specific error responses
 */

import type { PlanRegistry } from './PlanRegistry.js';
import type { AuthContext, PlanContext } from './types/context.js';
import { PlanError } from './errors.js';
import { createPlanContext } from './types/context.js';
import { error as errorResponse, errorFromException } from './types/responses.js';
import type { OperationResponse } from './types/responses.js';

/**
 * Transport plan configuration
 */
export interface TransportConfig {
  /**
   * Enable development mode (detailed errors, stack traces)
   */
  devMode?: boolean;

  /**
   * Request timeout (milliseconds)
   */
  timeout?: number;
}

/**
 * Base class for transport plans
 *
 * All transport implementations must extend this class and implement
 * the abstract methods.
 */
export abstract class TransportPlan {
  protected config: Required<TransportConfig>;

  constructor(
    protected registry: PlanRegistry,
    config: TransportConfig = {}
  ) {
    this.config = {
      devMode: config.devMode ?? process.env.NODE_ENV === 'development',
      timeout: config.timeout ?? 60000
    };
  }

  /**
   * Start the transport
   *
   * This method should:
   * - Initialize the transport server (HTTP, IPC handler, etc.)
   * - Register protocol-specific handlers
   * - Begin listening for requests
   *
   * @param config - Transport-specific configuration
   */
  abstract start(config?: any): Promise<void>;

  /**
   * Stop the transport
   *
   * This method should:
   * - Stop accepting new requests
   * - Clean up active connections
   * - Unregister handlers
   * - Release resources
   */
  abstract stop(): Promise<void>;

  /**
   * Extract authentication context from transport-specific request
   *
   * Each transport extracts auth differently:
   * - HTTP: Bearer token from Authorization header
   * - IPC: User from Electron session
   * - stdio: Environment variables or config file
   * - WebWorker: Session from shared state
   * - React Native: Native module session
   *
   * @param request - Transport-specific request object
   * @returns Auth context or null if not authenticated
   */
  protected abstract extractAuthContext(request: any): Promise<AuthContext | null>;

  /**
   * Invoke an operation through the registry
   *
   * This is the core routing method that all transport plans use.
   * It creates a plan context and routes to the registry.
   *
   * @param operation - Operation name
   * @param request - Request payload
   * @param transportRequest - Transport-specific request for auth extraction
   * @param requestId - Optional request ID (generated if not provided)
   * @returns Operation response (success or error)
   */
  protected async invokeOperation<TRequest, TResponse>(
    operation: string,
    request: TRequest,
    transportRequest: any,
    requestId?: string
  ): Promise<OperationResponse<TResponse>> {
    try {
      // Extract auth context
      const auth = await this.extractAuthContext(transportRequest);

      if (!auth) {
        return errorResponse('UNAUTHORIZED', 'Authentication required');
      }

      // Create plan context
      const context: PlanContext = createPlanContext(
        auth,
        requestId || this.generateRequestId(),
        { transport: this.constructor.name }
      );

      // Invoke through registry
      const result = await this.registry.invoke<TRequest, TResponse>(
        operation,
        request,
        context
      );

      return {
        success: true,
        result
      };
    } catch (err) {
      return this.formatError(err as Error);
    }
  }

  /**
   * Format error for transport protocol
   *
   * Converts plan errors to standard error response format.
   * Stack traces are included in development mode only.
   *
   * @param err - Error to format
   * @returns Error response
   */
  protected formatError(err: Error): OperationResponse<never> {
    const includeStack = this.config.devMode;

    if (err instanceof PlanError) {
      return errorResponse(
        err.code,
        err.message,
        err.details,
        includeStack ? err.stack : undefined
      );
    }

    // Unexpected error
    return errorFromException(err, 'INTERNAL_ERROR', includeStack);
  }

  /**
   * Generate a unique request ID
   *
   * Override this method to provide custom request ID generation.
   */
  protected generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if transport is running
   *
   * Override this if your transport can track running state.
   */
  abstract isRunning(): boolean;
}
