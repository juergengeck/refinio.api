/**
 * StoryFactory - Creates Story and Assembly objects for Plan execution tracking
 *
 * Integrates with assembly.core to provide:
 * - Story creation for audit trails
 * - Assembly creation for tracking execution
 * - recordExecution helper for Plans to track their operations
 *
 * This is the bridge between refinio.api Plans and assembly.core's
 * Story/Assembly system.
 */

import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Supply - What is offered/available
 * Matches cube.core Supply interface
 */
export interface Supply {
    domain: string;
    subjects: string[];
    keywords: string[];
    ownerId?: string;
    verifiableCredentials?: Array<{
        type: string;
        credentialHash: string;
        issuer: string;
        issued: number;
        expires?: number;
    }>;
}

/**
 * Demand - What is needed/requested
 * Matches cube.core Demand interface
 */
export interface Demand {
    domain: string;
    keywords: string[];
    trustLevel?: 'me' | 'trusted' | 'group' | 'public';
    groupHash?: string;
}

/**
 * Plan - Reference type for Story
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
    creator?: string;
    created: number;
    modified?: number;
    status?: string;
    domain?: string;
}

/**
 * Assembly - Meta-index tracking how computational results move through network
 * Matches assembly.core Assembly interface
 */
export interface Assembly {
    $type$: 'Assembly';
    storyRef: SHA256IdHash<Story>;
    supply: Supply;
    demand: Demand;
    instanceVersion: string;
    parent?: string;
    metadata?: Map<string, string>;
    matchScore?: number;
    planRef?: SHA256IdHash<Plan>;
    owner?: string;
    domain?: string;
    created?: number;
    modified?: number;
    status?: string;
}

/**
 * Story - Audit trail documenting what happened when a Plan was executed
 * Matches assembly.core Story interface
 */
export interface Story {
    $type$: 'Story';
    id: string;
    title: string;
    description: string;
    plan: SHA256IdHash<Plan>;
    product: SHA256IdHash<Assembly>;
    instanceVersion: string;
    outcome?: string;
    success: boolean;
    matchScore?: number;
    metadata?: Map<string, string>;
    actor?: string;
    created: number;
    duration?: number;
    owner?: string;
    domain?: string;
}

/**
 * Metadata for recording execution - passed by Plans
 */
export interface ExecutionMetadata {
    title: string;
    description: string;
    planId: SHA256IdHash<Plan> | string;
    owner: string;
    domain: string;
    instanceVersion: string;
    supply: Supply;
    demand: Demand;
    matchScore?: number;
}

/**
 * Result of recordExecution
 */
export interface ExecutionResult<T> {
    result: T;
    storyId: SHA256IdHash<Story>;
    assemblyId: SHA256IdHash<Assembly>;
}

/**
 * StoryFactory - Creates Stories and Assemblies for Plan execution
 *
 * Usage pattern:
 * ```typescript
 * const factory = new StoryFactory(storeVersionedObject);
 *
 * const result = await factory.recordExecution(
 *   {
 *     title: 'Add contact',
 *     description: 'Creating contact: Alice',
 *     planId: ContactsPlan.planId,
 *     owner: userId,
 *     domain: 'identity',
 *     instanceVersion: getCurrentInstanceVersion(),
 *     supply: {
 *       domain: 'identity',
 *       keywords: ['profile', 'contact', 'someone'],
 *       ownerId: userId,
 *       subjects: []
 *     },
 *     demand: {
 *       domain: 'identity',
 *       keywords: ['contact-management', 'identity-storage'],
 *       trustLevel: 'me'
 *     },
 *     matchScore: 1.0
 *   },
 *   async () => {
 *     return await addContactInternal(...);
 *   }
 * );
 * ```
 */
export class StoryFactory {
    private storyCreatedListeners = new Set<(story: Story) => void>();

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
    onStoryCreated(listener: (story: Story) => void): () => void {
        this.storyCreatedListeners.add(listener);
        return () => this.storyCreatedListeners.delete(listener);
    }

    /**
     * Notify all registered listeners that a Story was created.
     * Called internally whenever any Story is created.
     *
     * @param story - The Story object that was created
     */
    private notifyStoryCreated(story: Story): void {
        for (const listener of this.storyCreatedListeners) {
            listener(story);
        }
    }

    /**
     * Record execution of a Plan operation, creating Story and Assembly
     *
     * This wraps the operation execution with Story/Assembly creation:
     * 1. Execute the operation
     * 2. Create Story documenting the execution
     * 3. Create Assembly linking Demand + Supply
     * 4. Return result + IDs
     *
     * @param metadata - Execution metadata (title, description, planId, etc)
     * @param fn - The operation to execute
     * @returns Result + Story/Assembly IDs
     */
    async recordExecution<T>(
        metadata: ExecutionMetadata,
        fn: () => Promise<T>
    ): Promise<ExecutionResult<T>> {
        const startTime = Date.now();

        try {
            // Execute the operation
            const result = await fn();
            const duration = Date.now() - startTime;

            // Create Story (immutable audit trail)
            const story: Story = {
                $type$: 'Story',
                id: `story-${metadata.planId}-${startTime}`,
                title: metadata.title,
                description: metadata.description,
                plan: metadata.planId as SHA256IdHash<Plan>,
                product: '' as SHA256IdHash<Assembly>, // Will be filled after Assembly creation
                instanceVersion: metadata.instanceVersion,
                outcome: 'success',
                success: true,
                matchScore: metadata.matchScore,
                metadata: new Map([
                    ['domain', metadata.domain],
                    ['owner', metadata.owner]
                ]),
                actor: metadata.owner,
                created: startTime,
                duration,
                owner: metadata.owner,
                domain: metadata.domain
            };

            const storyResult = await this.storeVersionedObject(story);
            const storyId = storyResult.idHash;

            // Create Assembly (Product) linking Demand + Supply
            const assembly: Assembly = {
                $type$: 'Assembly',
                storyRef: storyId,
                supply: metadata.supply,
                demand: metadata.demand,
                instanceVersion: metadata.instanceVersion,
                metadata: new Map([
                    ['title', metadata.title],
                    ['description', metadata.description]
                ]),
                matchScore: metadata.matchScore,
                planRef: metadata.planId as SHA256IdHash<Plan>,
                owner: metadata.owner,
                domain: metadata.domain,
                created: startTime,
                status: 'completed'
            };

            const assemblyResult = await this.storeVersionedObject(assembly);
            const assemblyId = assemblyResult.idHash;

            // Update Story with Assembly reference
            story.product = assemblyId;
            await this.storeVersionedObject(story);

            // Notify listeners that a Story was created (after Assembly exists)
            this.notifyStoryCreated(story);

            return {
                result,
                storyId,
                assemblyId
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            // Create failure Story
            const failureStory: Story = {
                $type$: 'Story',
                id: `story-${metadata.planId}-${startTime}`,
                title: metadata.title,
                description: metadata.description,
                plan: metadata.planId as SHA256IdHash<Plan>,
                product: '' as SHA256IdHash<Assembly>,
                instanceVersion: metadata.instanceVersion,
                outcome: `failure: ${(error as Error).message}`,
                success: false,
                matchScore: 0,
                metadata: new Map([
                    ['domain', metadata.domain],
                    ['owner', metadata.owner],
                    ['error', (error as Error).message]
                ]),
                actor: metadata.owner,
                created: startTime,
                duration,
                owner: metadata.owner,
                domain: metadata.domain
            };

            await this.storeVersionedObject(failureStory);

            // Notify listeners that a failure Story was created
            this.notifyStoryCreated(failureStory);

            throw error;
        }
    }

    /**
     * Create a Story documenting an event (without Assembly)
     *
     * Use this for logging/auditing events that don't need Assembly tracking.
     */
    async createStory(
        planId: SHA256IdHash<Plan> | string,
        title: string,
        description: string,
        instanceVersion: string,
        success: boolean = true,
        outcome?: string
    ): Promise<SHA256IdHash<Story>> {
        const now = Date.now();

        const story: Story = {
            $type$: 'Story',
            id: `story-${planId}-${now}`,
            title,
            description,
            plan: planId as SHA256IdHash<Plan>,
            product: '' as SHA256IdHash<Assembly>, // No Assembly for simple stories
            instanceVersion,
            outcome: outcome || (success ? 'success' : 'failure'),
            success,
            created: now
        };

        const result = await this.storeVersionedObject(story);

        // Notify listeners that a Story was created
        this.notifyStoryCreated(story);

        return result.idHash;
    }
}
