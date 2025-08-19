import '@refinio/one.core/lib/system/load-nodejs.js';
import { Instance, Recipes } from '@refinio/one.core';
import { ErrorCode } from '../types';

export interface RecipeRegisterRequest {
  recipe: any;  // Recipe object defining data structure
}

export interface RecipeGetRequest {
  name: string;
}

export interface RecipeListRequest {
  category?: string;
}

/**
 * Handler for Recipe operations.
 * Recipes are data structure definitions (schemas) for ONE objects,
 * not executable functions.
 */
export class RecipeHandler {
  private instance: Instance | null = null;

  async initialize(instance: Instance) {
    this.instance = instance;
  }

  /**
   * Register a new recipe (data structure definition)
   * Recipes define the schema for ONE objects
   */
  async register(request: RecipeRegisterRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Register the recipe with the Instance
      // This defines a new data structure that objects can use
      await this.instance.registerRecipe(request.recipe);
      
      return {
        success: true,
        message: 'Recipe registered successfully',
        recipeName: request.recipe.name
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * Get a recipe definition by name
   * Returns the data structure schema
   */
  async get(request: RecipeGetRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get recipe from Instance's registered recipes
      const recipe = await this.instance.getRecipe(request.name);
      
      if (!recipe) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: `Recipe '${request.name}' not found`
        };
      }

      return {
        success: true,
        recipe
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

  /**
   * List all registered recipes
   * Returns all available data structure definitions
   */
  async list(request: RecipeListRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get all recipes from Instance
      const allRecipes = await this.instance.getAllRecipes();
      
      // Filter by category if provided
      const filtered = request.category
        ? allRecipes.filter((r: any) => r.category === request.category)
        : allRecipes;
      
      return {
        success: true,
        count: filtered.length,
        recipes: filtered.map((r: any) => ({
          name: r.name,
          type: r.type,
          description: r.description,
          category: r.category,
          properties: r.properties  // The actual data structure definition
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
   * Get example recipes showing common data structures
   * These are examples of how recipes define object schemas
   */
  getExampleRecipes(): any[] {
    return [
      {
        name: 'Person',
        type: 'Person',
        category: 'identity',
        description: 'Data structure for a Person object',
        properties: {
          name: { type: 'string', required: true },
          email: { type: 'string', format: 'email' },
          publicKey: { type: 'string', required: true },
          birthDate: { type: 'date' }
        }
      },
      {
        name: 'Profile',
        type: 'Profile', 
        category: 'identity',
        description: 'Data structure for a user Profile',
        properties: {
          personId: { type: 'reference', refType: 'Person', required: true },
          displayName: { type: 'string', required: true },
          avatar: { type: 'string', format: 'dataUri' },
          bio: { type: 'string', maxLength: 500 }
        }
      },
      {
        name: 'Message',
        type: 'Message',
        category: 'communication',
        description: 'Data structure for a Message',
        properties: {
          channelId: { type: 'reference', refType: 'Channel', required: true },
          senderId: { type: 'reference', refType: 'Person', required: true },
          content: { type: 'string', required: true },
          timestamp: { type: 'timestamp', required: true },
          metadata: { type: 'object' }
        }
      },
      {
        name: 'Channel',
        type: 'Channel',
        category: 'communication',
        description: 'Data structure for a communication Channel',
        properties: {
          name: { type: 'string', required: true },
          channelType: { type: 'enum', values: ['direct', 'group'], required: true },
          participants: { type: 'array', items: { type: 'reference', refType: 'Person' } },
          createdAt: { type: 'timestamp', required: true }
        }
      }
    ];
  }
}