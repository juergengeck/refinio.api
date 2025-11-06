/**
 * IPC Transport Adapter
 *
 * Exposes handler registry through Electron IPC.
 * Provides a single IPC handler that routes all calls to the registry.
 *
 * Usage in Electron main process:
 *
 * const transport = new IpcTransport(registry);
 * transport.register(ipcMain);
 *
 * Usage in renderer:
 *
 * const result = await window.electronAPI.invoke('handler:call', {
 *   handler: 'memory',
 *   method: 'createSubject',
 *   params: { ... }
 * });
 */

import type { HandlerRegistry } from '../registry/HandlerRegistry.js';

export interface IpcMessage {
  handler: string;
  method: string;
  params?: any;
}

export interface IpcResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * IPC Transport
 *
 * Single IPC handler that routes to registry
 */
export class IpcTransport {
  constructor(private registry: HandlerRegistry) {}

  /**
   * Register IPC handlers
   *
   * @param ipcMain - Electron's ipcMain instance
   */
  register(ipcMain: any) {
    // Main handler for all registry calls
    ipcMain.handle('handler:call', async (_event: any, message: IpcMessage) => {
      return await this.handleCall(message);
    });

    // Handler discovery
    ipcMain.handle('handler:list', async () => {
      return this.registry.getAllMetadata();
    });

    // Handler metadata
    ipcMain.handle('handler:metadata', async (_event: any, name: string) => {
      return this.registry.getMetadata(name);
    });
  }

  /**
   * Handle IPC call
   */
  private async handleCall(message: IpcMessage): Promise<IpcResponse> {
    const { handler, method, params } = message;

    // Validate
    if (!handler || !method) {
      return {
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
      success: result.success,
      data: result.data,
      error: result.error
    };
  }
}
