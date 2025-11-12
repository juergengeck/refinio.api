/**
 * IPCTransportPlan - Electron IPC transport implementation
 *
 * Provides transport between Electron main process and renderer process
 * using ipcMain.handle() for the backend side.
 *
 * Key features:
 * - Single universal handler: 'plan:invoke'
 * - Extracts auth from Electron session
 * - Routes all operations through plan registry
 * - Formats responses for IPC protocol
 */

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { TransportPlan } from '../TransportPlan.js';
import type { TransportConfig } from '../TransportPlan.js';
import type { PlanRegistry } from '../PlanRegistry.js';
import type { AuthContext } from '../types/context.js';
import { UnauthorizedError } from '../errors.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * IPC transport configuration
 */
export interface IPCTransportConfig extends TransportConfig {
  /**
   * IPC channel name for operation invocation
   */
  channel?: string;

  /**
   * Function to get authenticated user from session
   *
   * This should be provided by the Electron app to extract
   * the current user from the session/window context.
   */
  getUserFromSession?: (event: IpcMainInvokeEvent) => Promise<{
    userId: SHA256IdHash<Person>;
    sessionId: string;
    capabilities: string[];
  } | null>;
}

/**
 * IPC Transport Plan (Main Process)
 *
 * Registers IPC handlers and routes operations to plan registry.
 */
export class IPCTransportPlan extends TransportPlan {
  private channel: string;
  private getUserFromSession?: IPCTransportConfig['getUserFromSession'];
  private running = false;

  constructor(
    registry: PlanRegistry,
    config: IPCTransportConfig = {}
  ) {
    super(registry, config);
    this.channel = config.channel || 'plan:invoke';
    this.getUserFromSession = config.getUserFromSession;
  }

  /**
   * Start the IPC transport
   *
   * Registers universal IPC handler for all operations.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('IPC transport already running');
    }

    // Register universal handler
    ipcMain.handle(this.channel, async (event, operation: string, request: any) => {
      try {
        const requestId = this.generateRequestId();

        const response = await this.invokeOperation(
          operation,
          request,
          event,
          requestId
        );

        return response;
      } catch (error) {
        // This should not happen as invokeOperation catches everything,
        // but just in case...
        return this.formatError(error as Error);
      }
    });

    this.running = true;
    console.log(`IPC transport started on channel: ${this.channel}`);
  }

  /**
   * Stop the IPC transport
   *
   * Removes IPC handlers.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    ipcMain.removeHandler(this.channel);
    this.running = false;
    console.log('IPC transport stopped');
  }

  /**
   * Check if transport is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Extract auth context from Electron IPC event
   *
   * Uses the provided getUserFromSession function if available,
   * otherwise returns a default context (for development/testing).
   */
  protected async extractAuthContext(event: IpcMainInvokeEvent): Promise<AuthContext | null> {
    if (this.getUserFromSession) {
      const user = await this.getUserFromSession(event);
      if (!user) {
        return null;
      }

      return {
        userId: user.userId,
        sessionId: user.sessionId,
        capabilities: user.capabilities
      };
    }

    // Development mode: allow all operations
    // In production, you MUST provide getUserFromSession
    if (this.config.devMode) {
      console.warn('IPC transport running without authentication (devMode)');
      return {
        userId: 'dev-user' as any, // Cast for development
        sessionId: 'dev-session',
        capabilities: ['*'] // Full access in dev mode
      };
    }

    // Production mode without auth function: reject
    throw new UnauthorizedError('Authentication not configured');
  }
}
