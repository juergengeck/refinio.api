/**
 * PlanObjectManager - Creates and manages Plan objects as ONE.core versioned objects
 *
 * Responsibility: Bridge the gap between Plan classes (which use string identifiers)
 * and the Story/Assembly system (which expects SHA256IdHash references).
 *
 * This manager:
 * - Creates simple Plan objects with id, name, description
 * - Stores them as ONE.core versioned objects
 * - Returns SHA256IdHash<Plan> for use in Stories
 * - Caches results to avoid recreating Plans
 */

import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Plan } from '@assembly/core';

export interface PlanObjectManagerDependencies {
    storeVersionedObject: <T>(obj: T) => Promise<{
        idHash: SHA256IdHash<T>;
        hash: SHA256Hash<T>;
    }>;
}

/**
 * Manages Plan object creation and storage
 */
export class PlanObjectManager {
    private planCache = new Map<string, SHA256IdHash<Plan>>();
    private storeVersionedObject: PlanObjectManagerDependencies['storeVersionedObject'] | null = null;
    private initialized = false;

    constructor(deps?: PlanObjectManagerDependencies) {
        if (deps) {
            this.storeVersionedObject = deps.storeVersionedObject;
            this.initialized = true;
        }
    }

    /**
     * Initialize the manager with storage function
     * Must be called before registerPlan()
     */
    initialize(deps: PlanObjectManagerDependencies): void {
        this.storeVersionedObject = deps.storeVersionedObject;
        this.initialized = true;
    }

    /**
     * Check if manager is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Register a Plan and get its idHash
     *
     * Creates a minimal Plan object and stores it as a ONE.core versioned object.
     * Results are cached - subsequent calls with the same id return the cached idHash.
     *
     * @param id - Unique plan identifier (e.g., 'group', 'contacts')
     * @param name - Human-readable name (e.g., 'Group', 'Contacts')
     * @param description - What this plan does
     * @param domain - Optional domain for organization (e.g., 'conversation', 'identity')
     * @returns SHA256IdHash<Plan> to use in Story objects
     */
    async registerPlan(
        id: string,
        name: string,
        description: string,
        domain?: string
    ): Promise<SHA256IdHash<Plan>> {
        if (!this.initialized || !this.storeVersionedObject) {
            throw new Error('PlanObjectManager not initialized. Call initialize() first.');
        }

        // Check cache first
        const cached = this.planCache.get(id);
        if (cached) {
            return cached;
        }

        // Create minimal Plan object
        // Note: demandPatterns and supplyPatterns are empty for now
        // Future: These could be populated from learned patterns
        const plan: Plan = {
            $type$: 'Plan',
            id,
            name,
            description,
            demandPatterns: [],
            supplyPatterns: [],
            created: Date.now(),
            status: 'active',
            domain
        };

        // Store as ONE.core versioned object
        const result = await this.storeVersionedObject(plan);

        // Cache the idHash
        this.planCache.set(id, result.idHash);

        return result.idHash;
    }

    /**
     * Get a cached Plan idHash without creating it
     *
     * @param id - Plan identifier
     * @returns Cached idHash or undefined
     */
    getCachedPlanIdHash(id: string): SHA256IdHash<Plan> | undefined {
        return this.planCache.get(id);
    }

    /**
     * Clear the cache (useful for testing)
     */
    clearCache(): void {
        this.planCache.clear();
    }
}

/**
 * Global PlanObjectManager instance
 * Initialize this at app startup with initializePlanObjectManager()
 */
export const globalPlanObjectManager = new PlanObjectManager();

/**
 * Initialize the global PlanObjectManager
 * Call this once during app initialization, after ONE.core is loaded
 *
 * @param deps - Dependencies including storeVersionedObject
 */
export function initializePlanObjectManager(deps: PlanObjectManagerDependencies): void {
    globalPlanObjectManager.initialize(deps);
}

/**
 * Register all standard Plans
 * Call this after initializePlanObjectManager()
 */
export async function registerStandardPlans(): Promise<void> {
    // Register plans that are used across the system
    await globalPlanObjectManager.registerPlan(
        'group',
        'Group',
        'Manages conversation groups with Story/Assembly tracking',
        'conversation'
    );

    await globalPlanObjectManager.registerPlan(
        'contacts',
        'Contacts',
        'Manages contacts, groups, and trust relationships',
        'identity'
    );

    // Add more standard plans here as needed
}
