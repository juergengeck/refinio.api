/**
 * IFileSystemAdapter - Bridges ONE.models IFileSystem to Windows ProjFS
 *
 * This adapter uses @refinio/one.projfs to mount an IFileSystem
 * on Windows using ProjectedFS.
 */

import { createRequire } from 'module';
import type { IFileSystem } from '@refinio/one.models/lib/fileSystems/IFileSystem.js';

const require = createRequire(import.meta.url);
const { IFSProjFSProvider } = require('@refinio/one.projfs');

export interface IFileSystemAdapterOptions {
    mountPoint: string;
    fileSystem: IFileSystem;
    debug?: boolean;
}

/**
 * IFileSystemAdapter mounts ONE.models IFileSystem using Windows ProjFS
 */
export class IFileSystemAdapter {
    private provider: any = null;
    private fileSystem: IFileSystem;
    private mountPoint: string;
    private debug: boolean;
    private mounted: boolean = false;

    constructor(options: IFileSystemAdapterOptions) {
        this.fileSystem = options.fileSystem;
        this.mountPoint = options.mountPoint;
        this.debug = options.debug || false;
    }

    /**
     * Mount the filesystem using ProjFS
     */
    async mount(): Promise<void> {
        if (this.mounted) {
            throw new Error('Already mounted');
        }

        this.log('Mounting filesystem at', this.mountPoint);

        // Create IFSProjFSProvider (like electron-app does)
        this.provider = new IFSProjFSProvider({
            instancePath: '',  // Not used, fileSystem is passed directly
            virtualRoot: this.mountPoint,
            fileSystem: this.fileSystem,
            debug: this.debug
        });

        // Start the provider
        await this.provider.start(this.mountPoint);

        this.mounted = true;
        this.log('Filesystem mounted successfully');
    }

    /**
     * Unmount the filesystem
     */
    async unmount(): Promise<void> {
        if (!this.mounted || !this.provider) {
            return;
        }

        this.log('Unmounting filesystem');
        await this.provider.stop();
        this.provider = null;
        this.mounted = false;
    }

    /**
     * Check if mounted
     */
    isMounted(): boolean {
        return this.mounted && this.provider && this.provider.isRunning();
    }

    /**
     * Debug logging
     */
    private log(...args: any[]): void {
        if (this.debug) {
            console.log('[IFileSystemAdapter]', ...args);
        }
    }
}
