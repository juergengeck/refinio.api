import '@refinio/one.core/lib/system/load-nodejs.js';
import { 
  Instance, 
  createObject,
  getObjectByHash,
  getObjectsByType,
  updateObject,
  deleteObject,
  SHA256Hash
} from '@refinio/one.core';
import { ErrorCode } from '../types';
import crypto from 'crypto';

export interface ProfileCreateRequest {
  alias: string;
  personId: string;
  instanceUrl: string;
  displayName: string;
  description?: string;
  settings?: any;
}

export interface ProfileUpdateRequest {
  profileId: string;
  updates: Partial<{
    alias: string;
    displayName: string;
    description: string;
    settings: any;
    metadata: any;
  }>;
}

export interface ProfileGetRequest {
  profileId?: string;
  alias?: string;
}

export interface ProfileListRequest {
  personId?: string;
  tags?: string[];
}

export class ProfileHandler {
  private instance: Instance | null = null;

  async initialize(instance: Instance) {
    this.instance = instance;
  }

  /**
   * Create a new Profile
   */
  async create(request: ProfileCreateRequest, personId: string): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Check if alias already exists
      const existingProfiles = await getObjectsByType('Profile');
      const aliasExists = existingProfiles.some((p: any) => p.alias === request.alias);
      
      if (aliasExists) {
        throw {
          code: ErrorCode.CONFLICT,
          message: `Profile with alias '${request.alias}' already exists`
        };
      }

      // Create the Profile object
      const profile = {
        $type$: 'Profile',
        alias: request.alias,
        personId: request.personId,
        instanceUrl: request.instanceUrl,
        instanceId: this.instance.id,
        displayName: request.displayName,
        description: request.description,
        metadata: {
          createdAt: Date.now(),
          lastModified: Date.now()
        },
        settings: request.settings || {}
      };

      const createdProfile = await createObject(profile);

      return {
        success: true,
        profile: {
          id: createdProfile.id,
          ...profile
        }
      };
    } catch (error: any) {
      if (error.code) throw error;
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * Get a Profile by ID or alias
   */
  async get(request: ProfileGetRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      let profile;

      if (request.profileId) {
        // Get by ID
        profile = await getObjectByHash(request.profileId as SHA256Hash);
      } else if (request.alias) {
        // Get by alias
        const profiles = await getObjectsByType('Profile');
        profile = profiles.find((p: any) => p.alias === request.alias);
      } else {
        throw {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Must provide either profileId or alias'
        };
      }

      if (!profile) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Profile not found'
        };
      }

      return {
        success: true,
        profile
      };
    } catch (error: any) {
      if (error.code) throw error;
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * Update a Profile
   */
  async update(request: ProfileUpdateRequest, personId: string): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get the existing profile
      const existingProfile = await getObjectByHash(request.profileId as SHA256Hash);
      
      if (!existingProfile) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Profile not found'
        };
      }

      // Check ownership
      if (existingProfile.personId !== personId && personId !== this.instance.owner.id) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Not authorized to update this profile'
        };
      }

      // Check if new alias conflicts
      if (request.updates.alias && request.updates.alias !== existingProfile.alias) {
        const profiles = await getObjectsByType('Profile');
        const aliasExists = profiles.some((p: any) => 
          p.alias === request.updates.alias && p.id !== request.profileId
        );
        
        if (aliasExists) {
          throw {
            code: ErrorCode.CONFLICT,
            message: `Profile with alias '${request.updates.alias}' already exists`
          };
        }
      }

      // Merge updates
      const updatedProfile = {
        ...existingProfile,
        ...request.updates,
        metadata: {
          ...existingProfile.metadata,
          lastModified: Date.now()
        }
      };

      await updateObject(request.profileId as SHA256Hash, updatedProfile);

      return {
        success: true,
        profile: updatedProfile
      };
    } catch (error: any) {
      if (error.code) throw error;
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * Delete a Profile
   */
  async delete(profileId: string, personId: string): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get the profile to check ownership
      const profile = await getObjectByHash(profileId as SHA256Hash);
      
      if (!profile) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Profile not found'
        };
      }

      // Check ownership
      if (profile.personId !== personId && personId !== this.instance.owner.id) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Not authorized to delete this profile'
        };
      }

      await deleteObject(profileId as SHA256Hash);

      // Also delete associated credentials if they exist
      try {
        const credentials = await getObjectsByType('ProfileCredential');
        const profileCred = credentials.find((c: any) => c.profileId === profileId);
        if (profileCred) {
          await deleteObject(profileCred.id);
        }
      } catch (error) {
        // Ignore credential deletion errors
      }

      return {
        success: true,
        message: 'Profile deleted successfully'
      };
    } catch (error: any) {
      if (error.code) throw error;
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * List Profiles
   */
  async list(request: ProfileListRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      let profiles = await getObjectsByType('Profile');

      // Filter by personId if provided
      if (request.personId) {
        profiles = profiles.filter((p: any) => p.personId === request.personId);
      }

      // Filter by tags if provided
      if (request.tags && request.tags.length > 0) {
        profiles = profiles.filter((p: any) => 
          p.metadata?.tags?.some((tag: string) => request.tags!.includes(tag))
        );
      }

      // Sort by last used, then created
      profiles.sort((a: any, b: any) => {
        const aTime = a.metadata?.lastUsed || a.metadata?.createdAt || 0;
        const bTime = b.metadata?.lastUsed || b.metadata?.createdAt || 0;
        return bTime - aTime;
      });

      return {
        success: true,
        count: profiles.length,
        profiles: profiles.map((p: any) => ({
          id: p.id,
          alias: p.alias,
          personId: p.personId,
          instanceUrl: p.instanceUrl,
          displayName: p.displayName,
          description: p.description,
          lastUsed: p.metadata?.lastUsed,
          createdAt: p.metadata?.createdAt
        }))
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * Update last used timestamp
   */
  async touchProfile(profileId: string): Promise<void> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      const profile = await getObjectByHash(profileId as SHA256Hash);
      
      if (profile) {
        const updated = {
          ...profile,
          metadata: {
            ...profile.metadata,
            lastUsed: Date.now()
          }
        };
        
        await updateObject(profileId as SHA256Hash, updated);
      }
    } catch (error) {
      // Silently ignore touch errors
    }
  }
}