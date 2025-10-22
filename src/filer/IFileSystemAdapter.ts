/**
 * IFileSystemAdapter - Bridges ONE.models IFileSystem to platform-specific filesystem
 *
 * This adapter automatically detects the platform and uses:
 * - Windows: ProjFS (@refinio/one.projfs)
 * - Linux/WSL: FUSE3 (@refinio/one.fuse3)
 */

import { createRequire } from 'module';
import fs from 'fs';
import type { IFileSystem } from '@refinio/one.models/lib/fileSystems/IFileSystem.js';

const require = createRequire(import.meta.url);

/**
 * Detect if running in WSL
 */
function isWSL(): boolean {
    try {
        const procVersion = fs.readFileSync('/proc/version', 'utf-8');
        return procVersion.toLowerCase().includes('microsoft') || procVersion.toLowerCase().includes('wsl');
    } catch {
        return false;
    }
}

/**
 * Detect platform and load appropriate native module
 */
async function loadNativeProvider() {
    const platform = process.platform;
    console.log('[loadNativeProvider] Platform:', platform);

    if (platform === 'win32') {
        // Windows - use ProjFS (CommonJS)
        console.log('[loadNativeProvider] Loading ProjFS...');
        try {
            const { IFSProjFSProvider } = require('@refinio/one.projfs');
            return { provider: IFSProjFSProvider, type: 'projfs' };
        } catch (error) {
            throw new Error(
                `Failed to load @refinio/one.projfs module. ` +
                `This is required for Windows ProjFS support. ` +
                `Install it with: npm install @refinio/one.projfs\n` +
                `Original error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    } else if (platform === 'linux' || isWSL()) {
        // Linux/WSL - use FUSE3 (use dynamic import for ESM compatibility)
        console.log('[loadNativeProvider] Detected Linux/WSL, loading FUSE3...');
        try {
            // @ts-ignore - dynamic import of module without types
            const fuse3Module = await import('@refinio/one.fuse3/IFSFuse3Provider.js');
            console.log('[loadNativeProvider] FUSE3 module loaded:', Object.keys(fuse3Module));
            return { provider: fuse3Module.IFSFuse3Provider, type: 'fuse3' };
        } catch (error) {
            throw new Error(
                `Failed to load @refinio/one.fuse3 module. ` +
                `This is required for Linux/WSL FUSE3 support. ` +
                `Install it with: npm install @refinio/one.fuse3\n` +
                `Original error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    } else {
        throw new Error(`Unsupported platform: ${platform}`);
    }
}

export interface IFileSystemAdapterOptions {
    mountPoint: string;
    fileSystem: IFileSystem;
    debug?: boolean;
}

/**
 * IFileSystemAdapter mounts ONE.models IFileSystem using platform-specific provider
 */
export class IFileSystemAdapter {
    private provider: any = null;
    private fileSystem: IFileSystem;
    private mountPoint: string;
    private debug: boolean;
    private mounted: boolean = false;
    private providerType: string | null = null;
    private ProviderClass: any = null;

    constructor(options: IFileSystemAdapterOptions) {
        this.fileSystem = options.fileSystem;
        this.mountPoint = options.mountPoint;
        this.debug = options.debug || false;
    }

    /**
     * Mount the filesystem using platform-specific provider
     */
    async mount(): Promise<void> {
        if (this.mounted) {
            throw new Error('Already mounted');
        }

        console.log('[IFileSystemAdapter] Mount called');

        // Load platform-specific provider (lazy loading)
        if (!this.ProviderClass) {
            console.log('[IFileSystemAdapter] Loading native provider...');
            const { provider, type } = await loadNativeProvider();
            this.ProviderClass = provider;
            this.providerType = type;
            console.log(`[IFileSystemAdapter] Using ${type.toUpperCase()} provider for platform: ${process.platform}`);
        }

        console.log('[IFileSystemAdapter] Mounting filesystem at', this.mountPoint);

        // Create provider instance based on platform
        this.provider = new this.ProviderClass({
            instancePath: '',  // Not used, fileSystem is passed directly
            virtualRoot: this.mountPoint,
            fileSystem: this.fileSystem,
            debug: this.debug
        });

        // Start the provider
        await this.provider.start(this.mountPoint);

        this.mounted = true;
        this.log(`Filesystem mounted successfully using ${this.providerType!.toUpperCase()}`);
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
