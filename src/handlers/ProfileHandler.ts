import '@refinio/one.core/lib/system/load-nodejs.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { storeVersionedObject, getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { getAllEntries } from '@refinio/one.core/lib/reverse-map-query.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import { ErrorCode } from '../types.js';
import { InstanceAuthManager, AuthSession } from '../auth/InstanceAuthManager.js';
import crypto from 'crypto';

export interface CreateProfileRequest {
  name: string;
  email: string;
  bio?: string;
  avatar?: string;
  publicKey?: string;
}

export interface GetProfileRequest {
  profileId?: SHA256IdHash;
  email?: string;
}

export interface UpdateProfileRequest {
  profileId: SHA256IdHash;
  updates: Partial<Profile>;
}

export interface CreateCredentialRequest {
  profileId: SHA256IdHash;
  credentialType: string;
  claims: any;
  expiresAt?: number;
}

export class ProfileHandler {
  private leuteModel: LeuteModel;
  private authManager: InstanceAuthManager;

  constructor(leuteModel: LeuteModel, authManager: InstanceAuthManager) {
    this.leuteModel = leuteModel;
    this.authManager = authManager;
  }

  /**
   * Create a new profile
   */
  async createProfile(request: CreateProfileRequest, session: AuthSession): Promise<any> {
    try {
      // Check permissions
      if (!this.authManager.hasPermission(session, 'write')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Insufficient permissions to create profile'
        };
      }

      // Create Profile object
      const profile: Partial<Profile> = {
        $type$: 'Profile',
        nickname: request.name,
        profileId: crypto.randomUUID(),
        personId: session.personId,
        owner: session.personId
      };

      // Store the profile
      const result = await storeVersionedObject(profile as any);

      return {
        success: true,
        profileId: result.idHash,
        hash: result.hash
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to create profile: ${error.message}`
      };
    }
  }

  /**
   * Get a profile by ID or email
   */
  async getProfile(request: GetProfileRequest, session: AuthSession): Promise<any> {
    try {
      // Check permissions
      if (!this.authManager.hasPermission(session, 'read')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Insufficient permissions to read profile'
        };
      }

      if (request.profileId) {
        // Get by ID
        const result = await getObjectByIdHash(request.profileId);
        const profile = result.obj;
        return {
          success: true,
          profile
        };
      } else if (request.email) {
        // Search by email would require reverse maps or indexing
        // For now, return an error
        throw {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Search by email not yet implemented'
        };
      } else {
        throw {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Must provide profileId or email'
        };
      }
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to get profile: ${error.message}`
      };
    }
  }

  /**
   * Update an existing profile
   */
  async updateProfile(request: UpdateProfileRequest, session: AuthSession): Promise<any> {
    try {
      // Check permissions
      if (!this.authManager.hasPermission(session, 'write')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Insufficient permissions to update profile'
        };
      }

      // Get current profile
      const currentProfileResult = await getObjectByIdHash(request.profileId);
      const currentProfile = currentProfileResult.obj;

      // Check ownership or admin permission
      if (!session.isOwner && !this.authManager.hasPermission(session, 'admin')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Can only update your own profile'
        };
      }

      // Merge updates
      const updatedProfile = {
        ...currentProfile,
        ...request.updates,
        $type$: 'Profile',
        updatedAt: new Date().toISOString()
      };

      // Store new version
      const result = await storeVersionedObject(updatedProfile as any);

      return {
        success: true,
        profileId: result.idHash,
        hash: result.hash
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to update profile: ${error.message}`
      };
    }
  }

  /**
   * Delete a profile (mark as deleted)
   */
  async deleteProfile(profileId: SHA256IdHash, session: AuthSession): Promise<any> {
    try {
      // Check permissions
      if (!this.authManager.hasPermission(session, 'admin')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Only admins can delete profiles'
        };
      }

      // Get current profile
      const deletedProfileResult = await getObjectByIdHash(profileId);
      const currentProfile = deletedProfileResult.obj;

      // Create deleted version
      const deletedProfile = {
        ...currentProfile,
        $type$: 'Profile',
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: session.personId
      };

      // Store deleted version
      const result = await storeVersionedObject(deletedProfile as any);

      return {
        success: true,
        profileId: result.idHash,
        hash: result.hash
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to delete profile: ${error.message}`
      };
    }
  }

  /**
   * List all profiles (requires admin)
   */
  async listProfiles(session: AuthSession): Promise<any> {
    try {
      // Check permissions
      if (!this.authManager.hasPermission(session, 'admin')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Only admins can list all profiles'
        };
      }

      // This would require proper reverse map setup
      // For now, return empty list
      return {
        success: true,
        profiles: [],
        message: 'Profile listing requires reverse map configuration'
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to list profiles: ${error.message}`
      };
    }
  }

  /**
   * Create a verifiable credential for a profile
   */
  async createCredential(request: CreateCredentialRequest, session: AuthSession): Promise<any> {
    try {
      // Check permissions
      if (!this.authManager.hasPermission(session, 'admin')) {
        throw {
          code: ErrorCode.FORBIDDEN,
          message: 'Only admins can issue credentials'
        };
      }

      const credential = {
        $type$: 'ProfileCredential',
        profileId: request.profileId,
        credentialType: request.credentialType,
        claims: request.claims,
        issuer: session.personId,
        issuedAt: new Date().toISOString(),
        expiresAt: request.expiresAt || Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year default
      };

      // Store credential
      const result = await storeVersionedObject(credential as any);

      return {
        success: true,
        credentialId: result.idHash,
        hash: result.hash
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to create credential: ${error.message}`
      };
    }
  }
}