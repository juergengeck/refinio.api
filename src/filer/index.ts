/**
 * Filer module - Integration with ONE.models IFileSystem and ProjFS
 *
 * This module provides adapters to mount ONE.models file systems
 * through ProjFS on Windows or FUSE3 on Linux.
 */

export { IFileSystemAdapter, type IFileSystemAdapterOptions } from './IFileSystemAdapter.js';
export { createCompleteFiler, type FilerModels } from './createFilerWithPairing.js';
