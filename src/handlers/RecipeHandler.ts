import '@refinio/one.core/lib/system/load-nodejs.js';
import { Instance, Recipes } from '@refinio/one.core';
import { ErrorCode } from '../types';

export interface RecipeExecuteRequest {
  name: string;
  params: any;
}

export interface RecipeListRequest {
  category?: string;
}

export interface RecipeSchemaRequest {
  name: string;
}

export class RecipeHandler {
  private instance: Instance | null = null;
  private recipes: typeof Recipes | null = null;

  async initialize(instance: Instance) {
    this.instance = instance;
    this.recipes = Recipes;
  }

  async execute(request: RecipeExecuteRequest): Promise<any> {
    if (!this.instance || !this.recipes) {
      throw new Error('Handler not initialized');
    }

    try {
      // Find recipe by name
      const recipe = this.getRecipe(request.name);
      
      if (!recipe) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: `Recipe '${request.name}' not found`
        };
      }

      // Execute recipe with parameters
      const result = await recipe.execute(this.instance, request.params);
      
      return {
        success: true,
        recipeName: request.name,
        result
      };
    } catch (error: any) {
      if (error.code) {
        throw error;
      }
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  async list(request: RecipeListRequest): Promise<any> {
    if (!this.recipes) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get all available recipes
      const recipeList = this.getAllRecipes();
      
      // Filter by category if provided
      const filtered = request.category
        ? recipeList.filter(r => r.category === request.category)
        : recipeList;
      
      return {
        success: true,
        count: filtered.length,
        recipes: filtered.map(r => ({
          name: r.name,
          category: r.category,
          description: r.description,
          parameters: r.parameters
        }))
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  async getSchema(request: RecipeSchemaRequest): Promise<any> {
    if (!this.recipes) {
      throw new Error('Handler not initialized');
    }

    try {
      const recipe = this.getRecipe(request.name);
      
      if (!recipe) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: `Recipe '${request.name}' not found`
        };
      }

      return {
        success: true,
        name: recipe.name,
        description: recipe.description,
        category: recipe.category,
        parameters: recipe.parameters,
        returns: recipe.returns,
        examples: recipe.examples
      };
    } catch (error: any) {
      if (error.code) {
        throw error;
      }
      
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  private getRecipe(name: string): any {
    // Common ONE platform recipes
    const recipeMap: any = {
      // Person recipes
      'CreatePerson': {
        name: 'CreatePerson',
        category: 'identity',
        description: 'Create a new Person object',
        parameters: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: false },
          publicKey: { type: 'string', required: true }
        },
        returns: { type: 'Person' },
        execute: async (instance: Instance, params: any) => {
          // Implementation would use ONE platform Person.create
          return { id: 'person-id', ...params };
        }
      },
      
      // Profile recipes
      'CreateProfile': {
        name: 'CreateProfile',
        category: 'identity',
        description: 'Create a new Profile for a Person',
        parameters: {
          personId: { type: 'string', required: true },
          displayName: { type: 'string', required: true },
          avatar: { type: 'string', required: false }
        },
        returns: { type: 'Profile' },
        execute: async (instance: Instance, params: any) => {
          // Implementation would use ONE platform Profile creation
          return { id: 'profile-id', ...params };
        }
      },
      
      // Channel recipes
      'CreateChannel': {
        name: 'CreateChannel',
        category: 'communication',
        description: 'Create a new communication channel',
        parameters: {
          name: { type: 'string', required: true },
          type: { type: 'string', enum: ['direct', 'group'], required: true },
          participants: { type: 'array', items: 'string', required: true }
        },
        returns: { type: 'Channel' },
        execute: async (instance: Instance, params: any) => {
          // Implementation would use ONE platform Channel creation
          return { id: 'channel-id', ...params };
        }
      },
      
      // Message recipes
      'SendMessage': {
        name: 'SendMessage',
        category: 'communication',
        description: 'Send a message to a channel',
        parameters: {
          channelId: { type: 'string', required: true },
          content: { type: 'string', required: true },
          metadata: { type: 'object', required: false }
        },
        returns: { type: 'Message' },
        execute: async (instance: Instance, params: any) => {
          // Implementation would use ONE platform messaging
          return { id: 'message-id', timestamp: Date.now(), ...params };
        }
      },
      
      // Group recipes
      'CreateGroup': {
        name: 'CreateGroup',
        category: 'organization',
        description: 'Create a new group',
        parameters: {
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          members: { type: 'array', items: 'string', required: false }
        },
        returns: { type: 'Group' },
        execute: async (instance: Instance, params: any) => {
          // Implementation would use ONE platform Group creation
          return { id: 'group-id', ...params };
        }
      }
    };

    return recipeMap[name];
  }

  private getAllRecipes(): any[] {
    const recipes = [
      'CreatePerson',
      'CreateProfile',
      'CreateChannel',
      'SendMessage',
      'CreateGroup'
    ];

    return recipes.map(name => this.getRecipe(name)).filter(r => r);
  }
}