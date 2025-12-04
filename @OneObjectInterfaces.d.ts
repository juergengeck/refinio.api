/**
 * TypeScript ambient module declaration for ONE object interfaces
 *
 * This extends ONE.core's type system following the pattern from
 * one.core/src/recipes.ts - using declaration merging for extensibility.
 *
 * Key types:
 * - Story: Audit trail for Plan execution (ID: id string)
 * - Plan: Learned patterns from execution (ID: id string)
 *
 * ID Object interfaces are used ONLY for calculating ID hashes.
 * They contain only the isId: true properties and should not be
 * used for general object processing.
 */

import type { Story, Plan } from './src/recipes/StoryRecipe.js';

/**
 * ID object types - contain only ID properties
 * Used for calculateIdHashOfObj() - never for storage or processing
 */
export interface StoryId {
    $type$: 'Story';
    id: string;
}

export interface PlanId {
    $type$: 'Plan';
    id: string;
}

declare module '@OneObjectInterfaces' {
    export interface OneCertificateInterfaces {}

    export interface OneLicenseInterfaces {}

    export interface OneUnversionedObjectInterfaces extends OneCertificateInterfaces {}

    /**
     * ID object interfaces - used for ID hash calculation only
     * These contain only the properties marked isId: true in recipes
     */
    export interface OneIdObjectInterfaces {
        Story: StoryId;
        Plan: PlanId;
    }

    /**
     * Versioned object interfaces - full objects with all properties
     */
    export interface OneVersionedObjectInterfaces {
        Story: Story;
        Plan: Plan;
    }
}