/**
 * Plan Recipe - LEARNED patterns from executed Assemblies
 *
 * CRITICAL: Plans are NOT templates created before execution.
 * Plans are GENERATED after Assemblies are evaluated.
 *
 * A Plan captures learned knowledge from Assembly execution:
 * - What Demand+Supply patterns were successful
 * - What matching criteria worked
 * - What should be replicated in future matching
 *
 * Plans are created in the Instance lifecycle:
 * 1. After all Instance Demands are satisfied
 * 2. After Assemblies are evaluated/analyzed
 * 3. Before Cube is updated with new Assemblies + Plans
 * 4. Before new Instance version is created
 *
 * This enables feed-forward learning where each Instance version
 * learns from the previous one.
 */

import type { Recipe } from '@refinio/one.core/lib/recipes.js';

export const PlanRecipe: Recipe = {
    $type$: 'Recipe' as const,
    name: 'Plan',
    rule: [
        {
            // Unique identifier for this plan
            itemprop: 'id',
            itemtype: { type: 'string' },
            isId: true
        },
        {
            // Human-readable name
            itemprop: 'name',
            itemtype: { type: 'string' }
        },
        {
            // Description of what this plan achieves
            itemprop: 'description',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            // Demand patterns - what needs to be satisfied
            itemprop: 'demandPatterns',
            itemtype: {
                type: 'array',
                item: {
                    type: 'object',
                    rules: [
                        {
                            itemprop: 'keywords',
                            itemtype: {
                                type: 'array',
                                item: { type: 'string' }
                            }
                        },
                        {
                            itemprop: 'urgency',
                            itemtype: { type: 'integer' },
                            optional: true
                        },
                        {
                            itemprop: 'criteria',
                            itemtype: { type: 'stringifiable' },
                            optional: true
                        }
                    ]
                }
            }
        },
        {
            // Supply patterns - what to look for
            itemprop: 'supplyPatterns',
            itemtype: {
                type: 'array',
                item: {
                    type: 'object',
                    rules: [
                        {
                            itemprop: 'keywords',
                            itemtype: {
                                type: 'array',
                                item: { type: 'string' }
                            }
                        },
                        {
                            itemprop: 'minTrustScore',
                            itemtype: { type: 'number' },
                            optional: true
                        },
                        {
                            itemprop: 'contextLevel',
                            itemtype: { type: 'integer' },
                            optional: true
                        }
                    ]
                }
            }
        },
        {
            // Matching logic/algorithm
            itemprop: 'matchingLogic',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            // Minimum match score required (0.0-1.0)
            itemprop: 'minMatchScore',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            // Metadata about the plan
            itemprop: 'metadata',
            itemtype: {
                type: 'map',
                key: { type: 'string' },
                value: { type: 'string' }
            },
            optional: true
        },
        {
            // Creator of this plan (Person reference)
            itemprop: 'creator',
            itemtype: {
                type: 'referenceToId',
                allowedTypes: new Set(['Person'])
            },
            optional: true
        },
        {
            // When this plan was created
            itemprop: 'created',
            itemtype: { type: 'integer' }
        },
        {
            // When this plan was last modified
            itemprop: 'modified',
            itemtype: { type: 'integer' },
            optional: true
        },
        {
            // Status: 'active', 'inactive', 'archived'
            itemprop: 'status',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            // Domain this plan applies to (cube.core indexing)
            itemprop: 'domain',
            itemtype: { type: 'string' },
            optional: true
        }
    ]
};

export default PlanRecipe;
