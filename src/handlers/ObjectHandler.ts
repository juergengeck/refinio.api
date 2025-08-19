import '@refinio/one.core/lib/system/load-nodejs.js';
import { Instance } from '@refinio/one.core';
import { ErrorCode } from '../types';

export interface CreateRequest {
  type: string;
  data: any;
}

export interface ReadRequest {
  id: string;
  version?: string;
}

export interface UpdateRequest {
  id: string;
  data: any;
}

export interface DeleteRequest {
  id: string;
}

export interface ListRequest {
  type: string;
  filter?: any;
  limit?: number;
  offset?: number;
}

export class ObjectHandler {
  private instance: Instance | null = null;

  async initialize(instance: Instance) {
    this.instance = instance;
  }

  async create(request: CreateRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Instance not initialized');
    }

    try {
      // Create object based on type
      const objectType = request.type;
      const objectData = request.data;

      // Use ONE platform to create the object
      const result = await this.instance.createObject(objectType, objectData);
      
      return {
        success: true,
        id: result.idHash,
        version: result.version,
        data: result
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  async read(request: ReadRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Instance not initialized');
    }

    try {
      // Read object from storage
      const object = await this.instance.getObject(request.id, request.version);
      
      if (!object) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Object not found'
        };
      }

      return {
        success: true,
        data: object
      };
    } catch (error: any) {
      if (error.code === ErrorCode.NOT_FOUND) {
        throw error;
      }
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  async update(request: UpdateRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Instance not initialized');
    }

    try {
      // Get existing object
      const existing = await this.instance.getObject(request.id);
      
      if (!existing) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Object not found'
        };
      }

      // Update object
      const updated = { ...existing, ...request.data };
      const result = await this.instance.updateObject(request.id, updated);
      
      return {
        success: true,
        id: result.idHash,
        version: result.version,
        data: result
      };
    } catch (error: any) {
      if (error.code === ErrorCode.NOT_FOUND) {
        throw error;
      }
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  async delete(request: DeleteRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Instance not initialized');
    }

    try {
      // Check if object exists
      const existing = await this.instance.getObject(request.id);
      
      if (!existing) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Object not found'
        };
      }

      // Delete object
      await this.instance.deleteObject(request.id);
      
      return {
        success: true,
        message: 'Object deleted successfully'
      };
    } catch (error: any) {
      if (error.code === ErrorCode.NOT_FOUND) {
        throw error;
      }
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  async list(request: ListRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Instance not initialized');
    }

    try {
      // Query objects by type
      const objects = await this.instance.queryObjects({
        type: request.type,
        filter: request.filter,
        limit: request.limit || 100,
        offset: request.offset || 0
      });
      
      return {
        success: true,
        count: objects.length,
        data: objects
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }
}