import type { Recipe } from '@refinio/one.core/lib/recipes.js';

/**
 * Profile Recipe for ONE platform
 * Profiles are stored as ONE objects in the instance
 */
export const ProfileRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'Profile',
  rule: [
    {
      itemprop: 'profileId',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'personId',
      itemtype: { 
        type: 'referenceToId', 
        allowedTypes: new Set(['Person']) 
      },
      isId: true
    },
    {
      itemprop: 'owner',
      itemtype: { 
        type: 'referenceToId', 
        allowedTypes: new Set(['Person']) 
      },
      isId: true
    },
    {
      itemprop: 'nickname',
      itemtype: { type: 'string' },
      optional: true
    },
    {
      itemprop: 'communicationEndpoint',
      itemtype: {
        type: 'bag',
        item: {
          type: 'referenceToObj',
          allowedTypes: new Set(['*'])
        }
      },
      optional: true
    },
    {
      itemprop: 'personDescription',
      itemtype: {
        type: 'bag',
        item: {
          type: 'referenceToObj',
          allowedTypes: new Set(['*'])
        }
      },
      optional: true
    }
  ]
};

/**
 * ProfileCredential Recipe
 * Verifiable credentials for profiles
 */
export const ProfileCredentialRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'ProfileCredential',
  rule: [
    {
      itemprop: 'profileId',
      itemtype: { 
        type: 'referenceToId', 
        allowedTypes: new Set(['Profile']) 
      },
      isId: true
    },
    {
      itemprop: 'credentialType',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'claims',
      itemtype: { type: 'stringifiable' }
    },
    {
      itemprop: 'issuer',
      itemtype: { 
        type: 'referenceToId', 
        allowedTypes: new Set(['Person']) 
      }
    },
    {
      itemprop: 'issuedAt',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'expiresAt',
      itemtype: { type: 'number' },
      optional: true
    },
    {
      itemprop: 'signature',
      itemtype: { type: 'string' },
      optional: true
    }
  ]
};