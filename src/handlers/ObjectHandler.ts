import '@refinio/one.core/lib/system/load-nodejs.js';
import type One from '@refinio/one.models/lib/api/One.js';
import { storeVersionedObject, getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { storeUnversionedObject, getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { OneObjectTypes, OneVersionedObjectTypes, OneUnversionedObjectTypes } from '@refinio/one.core/lib/recipes.js';
import { ErrorCode } from '../types.js';

export interface CreateRequest {
  type: string;
  data: any;
  versioned?: boolean;
}

export interface ReadRequest {
  hash: string;
  versioned?: boolean;
}

export interface UpdateRequest {
  idHash: string;
  data: any;
}

export interface DeleteRequest {
  hash: string;
}

export interface QueryRequest {
  type: string;
  conditions?: any;
  limit?: number;
}

export class ObjectHandler {
  private oneApi: One;

  constructor(oneApi: One) {
    this.oneApi = oneApi;
  }

  /**
   * Create a new object in ONE storage
   */
  async create(request: CreateRequest): Promise<any> {
    try {
      const obj = {
        $type$: request.type,
        ...request.data
      };

      if (request.versioned) {
        // Store as versioned object
        const result = await storeVersionedObject(obj as OneVersionedObjectTypes);
        return {
          success: true,
          idHash: result.idHash,
          hash: result.hash,
          versioned: true
        };
      } else {
        // Store as unversioned object
        const result = await storeUnversionedObject(obj as OneUnversionedObjectTypes);
        return {
          success: true,
          hash: result.hash,
          versioned: false
        };
      }
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to create object: ${error.message}`
      };
    }
  }

  /**
   * Read an object from ONE storage
   */
  async read(request: ReadRequest): Promise<any> {
    try {
      if (request.versioned) {
        // Read versioned object by ID hash
        const result = await getObjectByIdHash(request.hash as SHA256IdHash);
        return {
          success: true,
          data: result.obj,
          idHash: result.idHash,
          hash: result.hash,
          versioned: true
        };
      } else {
        // Read unversioned object by hash
        const obj = await getObject(request.hash as SHA256Hash);
        return {
          success: true,
          data: obj,
          hash: request.hash,
          versioned: false
        };
      }
    } catch (error: any) {
      throw {
        code: ErrorCode.NOT_FOUND,
        message: `Object not found: ${error.message}`
      };
    }
  }

  /**
   * Update a versioned object (creates new version)
   */
  async update(request: UpdateRequest): Promise<any> {
    try {
      // Get current version
      const current = await this.oneApi.data().getLatestVersion(request.idHash as SHA256IdHash);
      
      // Merge with new data
      const updated = {
        ...current,
        ...request.data,
        $type$: current.$type$ // Preserve type
      };

      // Store new version
      const result = await storeVersionedObject(updated as OneVersionedObjectTypes);
      
      return {
        success: true,
        idHash: result.idHash,
        hash: result.hash,
        versioned: true
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to update object: ${error.message}`
      };
    }
  }

  /**
   * Delete an object (mark as deleted in versioned objects)
   */
  async delete(request: DeleteRequest): Promise<any> {
    // Note: ONE.core doesn't have a direct delete function
    // For versioned objects, you would typically store a new version with a "deleted" flag
    // For unversioned objects, deletion is not supported by design
    
    throw {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Delete operation not implemented - ONE.core uses immutable storage'
    };
  }

  /**
   * Query objects by type and conditions
   */
  async query(request: QueryRequest): Promise<any> {
    try {
      // This would typically use reverse maps and queries
      // For now, return a placeholder
      return {
        success: true,
        results: [],
        message: 'Query functionality requires reverse maps setup'
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Query failed: ${error.message}`
      };
    }
  }
}