/**
 * ONE Storage Plan
 *
 * Platform-agnostic Plan for ONE.core storage operations.
 * Exposes all storage functionality through unified API.
 */

import {
  storeVersionedObject,
  getObjectByIdHash,
  getVersionedObjectByHash
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {
  storeUnversionedObject,
  getObject
} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  storeArrayBufferAsBlob,
  readBlobAsArrayBuffer
} from '@refinio/one.core/lib/storage-blob.js';
import type {
  SHA256Hash,
  SHA256IdHash
} from '@refinio/one.core/lib/util/type-checks.js';
import type {
  OneVersionedObjectTypes,
  OneUnversionedObjectTypes
} from '@refinio/one.core/lib/recipes.js';

/**
 * ONE Storage Plan
 *
 * Universal storage operations for ONE platform
 */
export class OneStoragePlan {
  /**
   * Store a versioned object
   *
   * @returns { hash, idHash, versionHash }
   */
  async storeVersionedObject(obj: OneVersionedObjectTypes) {
    const result = await storeVersionedObject(obj);
    return {
      hash: result.hash,
      idHash: result.idHash,
      versionHash: result.versionHash
    };
  }

  /**
   * Get versioned object by ID hash (latest version)
   */
  async getObjectByIdHash(idHash: SHA256IdHash<any>) {
    const result = await getObjectByIdHash(idHash);
    return {
      obj: result.obj,
      idHash: result.idHash,
      hash: result.hash
    };
  }

  /**
   * Get versioned object by specific version hash
   */
  async getVersionedObjectByHash(hash: SHA256Hash<any>) {
    return await getVersionedObjectByHash(hash);
  }

  /**
   * Store an unversioned object
   *
   * @returns hash
   */
  async storeUnversionedObject(obj: OneUnversionedObjectTypes) {
    const hash = await storeUnversionedObject(obj);
    return { hash };
  }

  /**
   * Get unversioned object by hash
   */
  async getUnversionedObject(hash: SHA256Hash<any>) {
    return await getObject(hash);
  }

  /**
   * Store binary data as BLOB
   *
   * @returns { hash, status }
   */
  async storeBlob(arrayBuffer: ArrayBuffer) {
    const result = await storeArrayBufferAsBlob(arrayBuffer);
    return {
      hash: result.hash,
      status: result.status
    };
  }

  /**
   * Read BLOB as ArrayBuffer
   */
  async readBlob(hash: SHA256Hash<'BLOB'>) {
    return await readBlobAsArrayBuffer(hash);
  }
}
