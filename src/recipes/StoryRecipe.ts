/**
 * Story Recipe - Minimal audit trail for Plan execution
 *
 * A Story documents: what Plan ran, what it produced, when, by whom.
 * The product hash IS the outcome - no redundant narrative fields needed.
 * Domain info is in the Plan - no need to duplicate here.
 *
 * Properties:
 * - id: unique identifier (isId)
 * - title: human-readable label
 * - plan: referenceToId<Plan> - which Plan was executed (has domain)
 * - product: referenceToObj<*> - what was created (REQUIRED)
 * - instanceVersion: Instance context
 * - created: timestamp
 * - duration: execution time (optional)
 * - owner: referenceToId<Person> - who created this (optional)
 */

import type { Recipe, Person, OneObjectTypes } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

// Import Plan interface from PlanRecipe
export type { default as PlanRecipe } from './PlanRecipe.js';

/**
 * Plan interface - matches PlanRecipe
 * Defined here to avoid circular imports while providing type safety
 */
export interface Plan {
    $type$: 'Plan';
    id: string;
    name: string;
    description?: string;
    demandPatterns: Array<{
        keywords: string[];
        urgency?: number;
        criteria?: Record<string, unknown>;
    }>;
    supplyPatterns: Array<{
        keywords: string[];
        minTrustScore?: number;
        contextLevel?: number;
    }>;
    matchingLogic?: string;
    minMatchScore?: number;
    metadata?: Map<string, string>;
    creator?: SHA256IdHash<Person>;
    created: number;
    modified?: number;
    status?: string;
    domain?: string;
}

export const StoryRecipe: Recipe = {
    $type$: 'Recipe' as const,
    name: 'Story',
    rule: [
        {
            // Unique identifier for this story
            itemprop: 'id',
            itemtype: { type: 'string' },
            isId: true
        },
        {
            // Human-readable title
            itemprop: 'title',
            itemtype: { type: 'string' }
        },
        {
            // Reference to the Plan that was executed
            itemprop: 'plan',
            itemtype: {
                type: 'referenceToId',
                allowedTypes: new Set(['Plan'])
            }
        },
        {
            // Reference to the product/result of execution
            // This is the actual object created by the Plan, can be ANY type
            // REQUIRED: No product = no Story
            itemprop: 'product',
            itemtype: {
                type: 'referenceToObj',
                allowedTypes: new Set(['*'])
            }
        },
        {
            // The Instance version at the time
            itemprop: 'instanceVersion',
            itemtype: { type: 'string' }
        },
        {
            // When this story was created
            itemprop: 'created',
            itemtype: { type: 'integer' }
        },
        {
            // Duration of execution (milliseconds)
            itemprop: 'duration',
            itemtype: { type: 'integer' },
            optional: true
        },
        {
            // Owner/creator of this Story (Person reference)
            itemprop: 'owner',
            itemtype: {
                type: 'referenceToId',
                allowedTypes: new Set(['Person'])
            },
            optional: true
        }
    ]
};

/**
 * Story interface - matches StoryRecipe
 *
 * A Story is a minimal audit record: what Plan was executed, what it produced, when, by whom.
 * The product hash IS the description/outcome - no need for redundant narrative fields.
 *
 * - plan: Reference to the Plan that was executed (ID hash - all versions)
 * - product: Reference to the actual result object created (object hash - specific version)
 *            REQUIRED: No product = no Story
 * - owner: Who created this Story (Person ID hash)
 */
export interface Story {
    $type$: 'Story';
    id: string;
    title: string;
    plan: SHA256IdHash<Plan>;
    product: SHA256Hash<OneObjectTypes>;  // REQUIRED: The actual result object
    instanceVersion: string;
    created: number;
    duration?: number;
    owner?: SHA256IdHash<Person>;
}

export default StoryRecipe;
