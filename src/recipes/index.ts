/**
 * refinio.api Recipes
 *
 * Core ONE.core recipes for the Plan/Story system.
 * All modules should import these recipes from refinio.api.
 */

export { StoryRecipe, type Story } from './StoryRecipe.js';
export { PlanRecipe } from './PlanRecipe.js';

import { StoryRecipe } from './StoryRecipe.js';
import { PlanRecipe } from './PlanRecipe.js';

/**
 * All refinio.api recipes for easy registration
 */
export const RefinioApiRecipes = [
    StoryRecipe,
    PlanRecipe
];

export default RefinioApiRecipes;
