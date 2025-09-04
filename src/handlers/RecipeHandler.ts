import '@refinio/one.core/lib/system/load-nodejs.js';
import { registerRecipes } from '@refinio/one.core/lib/instance.js';
import { getRecipe, hasRecipe, addRecipeToRuntime } from '@refinio/one.core/lib/object-recipes.js';
import type { Recipe } from '@refinio/one.core/lib/recipes.js';
import { ErrorCode } from '../types.js';

export interface RecipeRegisterRequest {
  recipe: Recipe;  // Recipe object
}

export interface RecipeGetRequest {
  name: string;
}

export class RecipeHandler {
  
  /**
   * Register a new recipe
   */
  async register(request: RecipeRegisterRequest): Promise<any> {
    try {
      const recipe = request.recipe;
      
      // Validate recipe structure
      if (!recipe.$type$ || recipe.$type$ !== 'Recipe') {
        throw {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid recipe: must have $type$ = "Recipe"'
        };
      }
      
      if (!recipe.name) {
        throw {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid recipe: missing name'
        };
      }
      
      // Add recipe to runtime (for immediate use)
      addRecipeToRuntime(recipe);
      
      // Register recipe with instance (for persistence)
      await registerRecipes([recipe]);
      
      return {
        success: true,
        message: `Recipe '${String(recipe.name)}' registered successfully`
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to register recipe: ${error.message}`
      };
    }
  }

  /**
   * Get a recipe by name
   */
  async get(request: RecipeGetRequest): Promise<any> {
    try {
      if (!hasRecipe(request.name)) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: `Recipe '${request.name}' not found`
        };
      }
      
      const recipe = getRecipe(request.name as any);
      
      return {
        success: true,
        recipe
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to get recipe: ${error.message}`
      };
    }
  }

  /**
   * List all available recipes
   */
  async list(): Promise<any> {
    try {
      // Note: one.core doesn't have a direct way to list all recipes
      // You would need to maintain your own registry or iterate through known types
      
      return {
        success: true,
        recipes: [],
        message: 'Recipe listing not fully implemented - requires registry'
      };
    } catch (error: any) {
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to list recipes: ${error.message}`
      };
    }
  }

  /**
   * Execute a recipe (create an object based on recipe)
   */
  async execute(request: { recipeName: string; data: any }): Promise<any> {
    try {
      if (!hasRecipe(request.recipeName)) {
        throw {
          code: ErrorCode.NOT_FOUND,
          message: `Recipe '${request.recipeName}' not found`
        };
      }
      
      const recipe = getRecipe(request.recipeName as any);
      
      // Create object based on recipe
      const obj = {
        $type$: request.recipeName,
        ...request.data
      };
      
      // Validate against recipe rules if needed
      // This would require implementing recipe validation logic
      
      return {
        success: true,
        object: obj,
        message: `Object created from recipe '${request.recipeName}'`
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to execute recipe: ${error.message}`
      };
    }
  }
}