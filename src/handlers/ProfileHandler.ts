import '@refinio/one.core/lib/system/load-nodejs.js';
import { 
  Instance, 
  createObject,
  getObjectByHash,
  getObjectsByType,
  updateObject,
  deleteObject
} from '@refinio/one.core';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Profile } from '@refinio/one.models/src/recipes/Leute/Profile.js';
import { ErrorCode } from '../types';
import crypto from 'crypto';

export interface ProfileCreateRequest {
  nickname: string;  // Using the official Profile nickname field
  personId: SHA256IdHash<Person>;
  owner: SHA256IdHash<Person>;
  profileId?: string;  // Auto-generated if not provided
  communicationEndpoint?: SHA256Hash<any>[];
  personDescription?: SHA256Hash<any>[];
}

export interface ProfileUpdateRequest {
  profileId: string;
  updates: Partial<{
    nickname: string;
    communicationEndpoint: SHA256Hash<any>[];
    personDescription: SHA256Hash<any>[];
  }>;
}

export interface ProfileGetRequest {
  profileId?: string;
  nickname?: string;  // Search by nickname instead of alias
}

export interface ProfileListRequest {
  personId?: SHA256IdHash<Person>;
  owner?: SHA256IdHash<Person>;
}

export class ProfileHandler {
  private instance: Instance | null = null;

  async initialize(instance: Instance) {
    this.instance = instance;
  }

  /**
   * Create a new Profile using the official one.models Profile structure
   */
  async create(request: ProfileCreateRequest, authPersonId: SHA256IdHash<Person>): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Check if nickname already exists
      const existingProfiles = await getObjectsByType('Profile');
      const nicknameExists = existingProfiles.some((p: any) => p.nickname === request.nickname);
      
      if (nicknameExists) {
        throw {
          code: ErrorCode.CONFLICT,
          message: `Profile with nickname '${request.nickname}' already exists`
        };
      }

      // Generate profileId if not provided
      const profileId = request.profileId || crypto.randomBytes(16).toString('hex');

      // Create the Profile object using official one.models structure
      const profile: Profile = {
        $type$: 'Profile',
        profileId,
        personId: request.personId,
        owner: request.owner,
        nickname: request.nickname,
        communicationEndpoint: request.communicationEndpoint || [],
        personDescription: request.personDescription || []
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
   * Get a Profile by ID or nickname
   */
  async get(request: ProfileGetRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      let profile;

      if (request.profileId) {
        // Get by profileId (find Profile with matching profileId field)
        const profiles = await getObjectsByType('Profile');
        profile = profiles.find((p: any) => p.profileId === request.profileId);
      } else if (request.nickname) {
        // Get by nickname
        const profiles = await getObjectsByType('Profile');
        profile = profiles.find((p: any) => p.nickname === request.nickname);
      } else {
        throw {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Must provide either profileId or nickname'
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
  async update(request: ProfileUpdateRequest, authPersonId: SHA256IdHash<Person>): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Find the existing profile by profileId
      const profiles = await getObjectsByType('Profile');
      const existingProfile = profiles.find((p: any) => p.profileId === request.profileId);
      
      if (!existingProfile) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Profile not found'
        };
      }

      // Check ownership (can update if you're the owner or the personId)
      if (existingProfile.personId !== authPersonId && existingProfile.owner !== authPersonId) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Not authorized to update this profile'
        };
      }

      // Check if new nickname conflicts
      if (request.updates.nickname && request.updates.nickname !== existingProfile.nickname) {
        const nicknameExists = profiles.some((p: any) => 
          p.nickname === request.updates.nickname && p.profileId !== request.profileId
        );
        
        if (nicknameExists) {
          throw {
            code: ErrorCode.CONFLICT,
            message: `Profile with nickname '${request.updates.nickname}' already exists`
          };
        }
      }

      // Merge updates with existing profile
      const updatedProfile: Profile = {
        ...existingProfile,
        ...request.updates
      };

      // Update the object (need to get the ONE object hash)
      const objectHash = existingProfile._hash || existingProfile.id; // Assuming the hash is available
      await updateObject(objectHash as SHA256Hash, updatedProfile);

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
  async delete(profileId: string, authPersonId: SHA256IdHash<Person>): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Find the profile to check ownership
      const profiles = await getObjectsByType('Profile');
      const profile = profiles.find((p: any) => p.profileId === profileId);
      
      if (!profile) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: 'Profile not found'
        };
      }

      // Check ownership (can delete if you're the owner or the personId)
      if (profile.personId !== authPersonId && profile.owner !== authPersonId) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Not authorized to delete this profile'
        };
      }

      // Delete the Profile object
      const objectHash = profile._hash || profile.id;
      await deleteObject(objectHash as SHA256Hash);

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

      // Filter by owner if provided
      if (request.owner) {
        profiles = profiles.filter((p: any) => p.owner === request.owner);
      }

      // Sort by nickname for consistent ordering
      profiles.sort((a: any, b: any) => {
        const aName = a.nickname || a.profileId;
        const bName = b.nickname || b.profileId;
        return aName.localeCompare(bName);
      });

      return {
        success: true,
        count: profiles.length,
        profiles: profiles.map((p: any) => ({
          id: p.id || p._hash,  // ONE object hash
          profileId: p.profileId,
          nickname: p.nickname,
          personId: p.personId,
          owner: p.owner,
          communicationEndpoint: p.communicationEndpoint,
          personDescription: p.personDescription
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
   * Get Profile by nickname (convenience method)
   */
  async getByNickname(nickname: string): Promise<Profile | null> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      const profiles = await getObjectsByType('Profile');
      return profiles.find((p: any) => p.nickname === nickname) || null;
    } catch (error) {
      return null;
    }
  }
}