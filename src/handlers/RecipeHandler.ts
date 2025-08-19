import '@refinio/one.core/lib/system/load-nodejs.js';
import { Instance, registerRecipes, getRecipe, getRecipes } from '@refinio/one.core';
import { ErrorCode } from '../types';

export interface RecipeRegisterRequest {
  recipe: any;  // Recipe object (which is itself structured by a Recipe recipe)
}

export interface RecipeGetRequest {
  name: string;
}

export interface RecipeListRequest {
  recipeType?: string;  // Filter by the recipe's $type$ (what Recipe defines this recipe)
}

/**
 * Handler for Recipe operations in ONE platform.
 * 
 * In ONE, recipes are self-describing:
 * - Recipes define the structure of ONE objects
 * - Recipes themselves are ONE objects
 * - Therefore, recipes are defined by Recipe recipes
 * - The "Recipe" recipe defines what a recipe looks like
 */
export class RecipeHandler {
  private instance: Instance | null = null;

  async initialize(instance: Instance) {
    this.instance = instance;
  }

  /**
   * Register a new recipe with the Instance
   * The recipe itself must conform to a Recipe recipe structure
   */
  async register(request: RecipeRegisterRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Register the recipe with the Instance
      // The recipe being registered is itself a ONE object that follows a Recipe recipe
      await registerRecipes([request.recipe]);
      
      return {
        success: true,
        message: 'Recipe registered successfully',
        recipeName: request.recipe.$type$,
        recipeType: request.recipe.$recipe$ || 'Recipe'  // What Recipe recipe defines this
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }
  }

  /**
   * Get a recipe by its type name
   */
  async get(request: RecipeGetRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get the recipe from registered recipes
      const recipe = getRecipe(request.name);
      
      if (!recipe) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: `Recipe '${request.name}' not found`
        };
      }

      return {
        success: true,
        recipe: {
          $type$: recipe.$type$,
          $recipe$: recipe.$recipe$ || 'Recipe',
          ...recipe
        }
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
   * List all registered recipes, optionally filtered by their recipe type
   * 
   * @param recipeType - Filter by what Recipe recipe defines these recipes
   *                     For example, "MessageRecipe" to get all recipes defined by MessageRecipe
   */
  async list(request: RecipeListRequest): Promise<any> {
    if (!this.instance) {
      throw new Error('Handler not initialized');
    }

    try {
      // Get all registered recipes
      const allRecipes = getRecipes();
      
      // Filter by recipe type if provided
      // This filters by what Recipe recipe defines each recipe
      const filtered = request.recipeType
        ? allRecipes.filter((r: any) => {
            // Check if this recipe is defined by the specified recipe type
            return r.$recipe$ === request.recipeType;
          })
        : allRecipes;
      
      return {
        success: true,
        count: filtered.length,
        recipes: filtered.map((r: any) => ({
          $type$: r.$type$,           // The name/type of this recipe
          $recipe$: r.$recipe$ || 'Recipe',  // What Recipe recipe defines this recipe
          description: r.description,
          properties: r.properties
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
   * Get the standard ONE platform recipes
   * These show the hierarchical nature of recipes
   */
  getStandardRecipes(): any[] {
    return [
      {
        $type$: 'Recipe',
        $recipe$: 'Recipe',  // Recipe is defined by itself
        description: 'The meta-recipe that defines what a recipe is',
        properties: {
          $type$: { type: 'string', required: true },
          $recipe$: { type: 'string', required: false },
          properties: { type: 'object', required: true }
        }
      },
      {
        $type$: 'Person',
        $recipe$: 'Recipe',  // Person is defined by the Recipe recipe
        description: 'A person in the ONE system',
        properties: {
          $type$: { type: 'const', value: 'Person' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          publicKey: { type: 'string', required: true }
        }
      },
      {
        $type$: 'Profile',
        $recipe$: 'Recipe',  // Profile is defined by the Recipe recipe
        description: 'A user profile',
        properties: {
          $type$: { type: 'const', value: 'Profile' },
          personId: { type: 'SHA256Hash', required: true },
          displayName: { type: 'string', required: true },
          avatar: { type: 'string', format: 'dataUri' }
        }
      },
      {
        $type$: 'MessageRecipe',
        $recipe$: 'Recipe',  // MessageRecipe is itself a Recipe
        description: 'Recipe for defining message types',
        properties: {
          $type$: { type: 'string', required: true },
          $recipe$: { type: 'const', value: 'MessageRecipe' },
          contentType: { type: 'string', required: true },
          maxLength: { type: 'number' }
        }
      },
      {
        $type$: 'TextMessage',
        $recipe$: 'MessageRecipe',  // TextMessage is defined by MessageRecipe
        description: 'A text message',
        properties: {
          $type$: { type: 'const', value: 'TextMessage' },
          content: { type: 'string', required: true },
          timestamp: { type: 'number', required: true }
        },
        contentType: 'text/plain',
        maxLength: 1000
      }
    ];
  }
}