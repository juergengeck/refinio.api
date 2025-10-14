#!/usr/bin/env node

/**
 * Test Instance Runner
 *
 * Runs a single refinio.api instance in a separate process for integration testing.
 * Configuration is passed via environment variables.
 */

import { startApiServer } from '../../dist/index.js';

async function runInstance() {
    try {
        console.error('[RUNNER] Starting instance...');
        const result = await startApiServer();

        // Send ready message to parent via stdout (as JSON)
        const readyMessage = {
            type: 'ready',
            instanceId: result.instanceIdHash,
            port: process.env.REFINIO_API_PORT,
            mountPoint: process.env.REFINIO_FILER_MOUNT_POINT || null
        };

        console.log(JSON.stringify(readyMessage));
        console.error('[RUNNER] Instance ready');

        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            console.error('[RUNNER] Received SIGTERM, shutting down...');
            try {
                if (result.filerAdapter) {
                    await result.filerAdapter.unmount();
                }
                if (result.httpServer) {
                    await result.httpServer.stop();
                }
                if (result.server) {
                    await result.server.stop();
                }
                console.error('[RUNNER] Shutdown complete');
                process.exit(0);
            } catch (err) {
                console.error('[RUNNER] Error during shutdown:', err);
                process.exit(1);
            }
        });

        process.on('SIGINT', async () => {
            console.error('[RUNNER] Received SIGINT, shutting down...');
            process.exit(0);
        });

    } catch (error) {
        console.error('[RUNNER] Failed to start instance:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runInstance();
