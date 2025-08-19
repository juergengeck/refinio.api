import { Recipe } from '@refinio/one.core';

/**
 * Profile Recipe for ONE platform
 * Profiles are stored as ONE objects in the instance
 */
export const ProfileRecipe: Recipe = {
  $type$: 'Profile',
  $recipe$: 'Recipe',
  description: 'User profile with access credentials',
  properties: {
    $type$: { 
      type: 'const', 
      value: 'Profile' 
    },
    alias: { 
      type: 'string', 
      required: true,
      unique: true,
      description: 'Unique profile alias for quick access'
    },
    personId: { 
      type: 'SHA256Hash', 
      required: true,
      description: 'Person ID this profile belongs to'
    },
    instanceUrl: {
      type: 'string',
      required: true,
      format: 'url',
      description: 'QUIC URL of the ONE instance'
    },
    instanceId: {
      type: 'SHA256Hash',
      required: false,
      description: 'Instance ID (discovered on first connect)'
    },
    displayName: { 
      type: 'string', 
      required: true,
      description: 'Display name for the profile'
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 500,
      description: 'Profile description'
    },
    permissions: {
      type: 'array',
      items: { type: 'string' },
      required: false,
      description: 'Granted permissions for this profile'
    },
    metadata: {
      type: 'object',
      required: false,
      properties: {
        createdAt: { type: 'number' },
        lastUsed: { type: 'number' },
        lastModified: { type: 'number' },
        tags: { 
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    settings: {
      type: 'object',
      required: false,
      description: 'Profile-specific settings',
      properties: {
        theme: { type: 'string' },
        language: { type: 'string' },
        timezone: { type: 'string' }
      }
    }
  }
};

/**
 * ProfileCredential Recipe - Encrypted credentials linked to a Profile
 * Stored separately for security
 */
export const ProfileCredentialRecipe: Recipe = {
  $type$: 'ProfileCredential',
  $recipe$: 'Recipe',
  description: 'Encrypted credentials for a Profile',
  properties: {
    $type$: { 
      type: 'const', 
      value: 'ProfileCredential' 
    },
    profileId: {
      type: 'SHA256Hash',
      required: true,
      description: 'Reference to the Profile'
    },
    encryptedKeys: {
      type: 'string',
      required: true,
      format: 'base64',
      description: 'Encrypted Person keys'
    },
    salt: {
      type: 'string',
      required: true,
      format: 'base64',
      description: 'Salt for key derivation'
    },
    algorithm: {
      type: 'string',
      required: true,
      default: 'xchacha20poly1305',
      description: 'Encryption algorithm used'
    }
  }
};