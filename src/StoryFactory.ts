/**
 * StoryFactory - Creates Story objects for Plan execution tracking
 *
 * Provides:
 * - Story creation for audit trails
 * - Notification system for listeners (AssemblyListener creates Assemblies)
 * - wrapExecution helper for Plans to track their operations
 *
 * IMPORTANT: StoryFactory ONLY creates Stories.
 * AssemblyListener (assembly.core) creates Assemblies when notified.
 * Story.id = productHash (content-addressed identity).
 */

import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { OneObjectTypes } from '@refinio/one.core/lib/recipes.js';

// Import types from assembly.core - single source of truth
import type { Assembly, Story, Plan, DemandPattern, SupplyPattern } from '@assembly/core';

// Re-export for consumers
export type { Assembly, Story, Plan, DemandPattern, SupplyPattern };

/**
 * Metadata for recording execution - passed by Plans
 */
export interface ExecutionMetadata {
    /** Title for the Story */
    title: string;
    /** Plan idHash that was executed */
    planId: SHA256IdHash<Plan>;
    /** Plan type name for logging */
    planTypeName: string;
    /** Owner person idHash */
    owner: SHA256IdHash<any>;
    /** Instance version for tracking */
    instanceVersion: string;
}

/**
 * Result returned by operation function in wrapExecution
 */
export interface OperationResult<T> {
    /** The operation result data */
    result: T;
    /** The product/entity hash - THIS becomes Assembly.entity */
    productHash: SHA256Hash<OneObjectTypes>;
}

/**
 * Result of wrapExecution
 */
export interface ExecutionResult<T> {
    /** The operation result */
    result: T;
    /** Story idHash (may be undefined if no story created) */
    storyId?: SHA256IdHash<Story>;
    /** Assembly idHash (may be undefined if no assembly created) */
    assemblyId?: SHA256IdHash<Assembly>;
}

/**
 * Parameters for registering a Plan
 */
export interface RegisterPlanParams {
    id: string;
    name: string;
    description?: string;
    domain?: string;
    demandPatterns?: DemandPattern[];
    supplyPatterns?: SupplyPattern[];
}

/**
 * Method metadata for auto-wrapping
 */
export interface MethodMetadata {
    /** Property name in result that contains the product hash (entity) */
    product?: string;
    /** Title for the Story */
    title?: string;
    /** Whether this method should be tracked (default: true) */
    tracked?: boolean;
}

/**
 * Parameters for registerPlanInstance
 */
export interface RegisterPlanInstanceParams<T> {
    /** The instance to wrap */
    instance: T;
    /** Plan metadata */
    plan: RegisterPlanParams;
    /** Method configurations - key is method name */
    methods: Record<string, MethodMetadata>;
    /** Owner person idHash */
    owner: SHA256IdHash<any>;
    /** Instance version */
    instanceVersion: string;
}

/**
 * StoryFactory - Creates Stories and Assemblies for Plan execution
 *
 * Usage pattern:
 * ```typescript
 * const factory = new StoryFactory(storeVersionedObject);
 *
 * // Register a Plan (once per plan type)
 * const planIdHash = await factory.registerPlan({
 *     id: 'SomeonePlan',
 *     name: 'Someone Plan',
 *     description: 'Manages Someone objects',
 *     domain: 'identity'
 * });
 *
 * // Wrap execution to create Story + Assembly
 * const result = await factory.wrapExecution(
 *   { title: 'Create owner', planId: planIdHash, ... },
 *   async () => {
 *     const someone = await createSomeone(...);
 *     return {
 *       result: { success: true },
 *       productHash: someone.idHash  // This becomes Assembly.entity!
 *     };
 *   }
 * );
 * ```
 */
export class StoryFactory {
    private storyCreatedListeners = new Set<(story: Story, storyIdHash: SHA256IdHash<Story>) => void>();

    constructor(
        private storeVersionedObject: <T>(obj: T) => Promise<{ idHash: SHA256IdHash<T>; hash: SHA256Hash<T> }>
    ) {}

    /**
     * Register a listener that will be called whenever a Story is created.
     *
     * This allows external packages (like assembly.core) to react to Story creation.
     *
     * @param listener - Function to call with the Story object when it's created
     * @returns Unsubscribe function to remove the listener
     */
    onStoryCreated(listener: (story: Story, storyIdHash: SHA256IdHash<Story>) => void): () => void {
        this.storyCreatedListeners.add(listener);
        return () => this.storyCreatedListeners.delete(listener);
    }

    /**
     * Notify all registered listeners that a Story was created.
     */
    private notifyStoryCreated(story: Story, storyIdHash: SHA256IdHash<Story>): void {
        for (const listener of this.storyCreatedListeners) {
            listener(story, storyIdHash);
        }
    }

    /**
     * Register a Plan and return its idHash
     *
     * Plans are versioned objects - calling with same id returns same idHash
     * (content-addressed deduplication)
     */
    async registerPlan(params: RegisterPlanParams): Promise<SHA256IdHash<Plan>> {
        const plan: Plan = {
            $type$: 'Plan',
            id: params.id,
            name: params.name,
            description: params.description,
            demandPatterns: params.demandPatterns || [],
            supplyPatterns: params.supplyPatterns || [],
            created: Date.now(),
            domain: params.domain
        };

        const result = await this.storeVersionedObject(plan);
        return result.idHash;
    }

    /**
     * Wrap execution of a Plan operation, creating Story and Assembly
     *
     * IMPORTANT: The operation must return productHash - this becomes Assembly.entity!
     * Assembly identity is determined by entity (content-addressed).
     * Same entity = same Assembly idHash = version chain (updates).
     * Different entity = different Assembly = separate version chain.
     *
     * @param metadata - Execution metadata (title, planId, owner, etc)
     * @param operation - Function that performs the work and returns productHash
     * @returns Result + Story/Assembly IDs
     */
    async wrapExecution<T>(
        metadata: ExecutionMetadata,
        operation: () => Promise<OperationResult<T>>
    ): Promise<ExecutionResult<T>> {
        const startTime = Date.now();

        // Execute the operation
        const opResult = await operation();
        const duration = Date.now() - startTime;

        // Create Story (audit trail of what happened)
        // Story id is the product hash - same product = same Story (content-addressed)
        const story: Story = {
            $type$: 'Story',
            id: opResult.productHash as unknown as string,
            title: metadata.title,
            plan: metadata.planId,
            product: opResult.productHash,
            instanceVersion: metadata.instanceVersion,
            created: startTime,
            duration,
            owner: metadata.owner
        };

        const storyResult = await this.storeVersionedObject(story);
        const storyIdHash = storyResult.idHash;

        // Notify listeners - AssemblyListener creates Assembly
        // Assembly.entity = productHash, so assemblyId is deterministic
        this.notifyStoryCreated(story, storyIdHash);

        return {
            result: opResult.result,
            storyId: storyIdHash,
            // assemblyId is derived from productHash (Assembly.entity = productHash)
            // Callers can compute it or listen to AssemblyListener
            assemblyId: undefined
        };
    }

    /**
     * Register a Plan instance and wrap its methods for auto Story/Assembly creation
     *
     * Creates a Proxy that intercepts method calls and automatically creates
     * Story + Assembly records when tracked methods are called.
     *
     * @param params - Configuration for the instance wrapping
     * @returns The wrapped instance (Proxy)
     */
    async registerPlanInstance<T extends object>(params: RegisterPlanInstanceParams<T>): Promise<T> {
        // Register the Plan first
        const planIdHash = await this.registerPlan(params.plan);

        const factory = this;

        // Create a Proxy that wraps tracked methods
        return new Proxy(params.instance, {
            get(target: T, prop: string | symbol, receiver: any): any {
                const value = Reflect.get(target, prop, receiver);

                // Only wrap functions
                if (typeof value !== 'function') {
                    return value;
                }

                const methodName = String(prop);
                const methodConfig = params.methods[methodName];

                // If method is not configured or explicitly not tracked, return original
                if (!methodConfig || methodConfig.tracked === false) {
                    return value.bind(target);
                }

                // Wrap the method to create Story + Assembly
                return async function(...args: any[]) {
                    const startTime = Date.now();

                    // Call the original method
                    const result = await value.apply(target, args);
                    const duration = Date.now() - startTime;

                    // Check if result indicates a cache hit (no new work done)
                    // Methods can set _cached: true to skip Story/Assembly creation
                    if (result && typeof result === 'object' && result._cached === true) {
                        // Return the actual result without _cached flag
                        const { _cached, ...cleanResult } = result;
                        // If result only had productHash + _cached, return just the productHash
                        const keys = Object.keys(cleanResult);
                        return keys.length === 1 ? cleanResult[keys[0]] : cleanResult;
                    }

                    // Extract product hash from result if configured
                    let productHash: SHA256Hash<any> | undefined;
                    if (methodConfig.product && result && typeof result === 'object') {
                        productHash = result[methodConfig.product];
                    }

                    // Only create Story/Assembly if we have a product hash
                    if (productHash) {
                        const title = methodConfig.title || `${params.plan.name}: ${methodName}`;

                        // Create Story - id IS the product (content-addressed)
                        const story: Story = {
                            $type$: 'Story',
                            id: productHash as unknown as string,
                            title,
                            plan: planIdHash,
                            product: productHash,
                            instanceVersion: params.instanceVersion,
                            created: startTime,
                            duration,
                            owner: params.owner
                        };

                        const storyResult = await factory.storeVersionedObject(story);

                        // Notify listeners - AssemblyListener creates Assembly
                        factory.notifyStoryCreated(story, storyResult.idHash);
                    }

                    return result;
                };
            }
        });
    }
}
