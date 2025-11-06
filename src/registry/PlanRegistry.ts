/**
 * Plan Registry
 *
 * Aligns with ONE first principles where:
 * - Plan objects contain method and parameters
 * - Plans reference immutable functions
 * - Plans are evaluated and results stored in Story objects
 *
 * From ONE first principles:
 * "Transactions in ONE are defined in ONE objects called Plan.
 *  Plan objects reference immutable functions and their parameters.
 *  After a Plan object has been evaluated, the Plan object and
 *  the result are referenced in a Story object."
 *
 * This registry manages Plans (collections of executable methods)
 * that can be invoked through various transports.
 */

export interface Plan {
  // Plans are classes with async methods
  // Methods must return promises - enforced at registration time
}

export interface PlanMetadata {
  name: string;
  description?: string;
  version?: string;
  methods: MethodMetadata[];
}

export interface MethodMetadata {
  name: string;
  description?: string;
  params?: ParameterMetadata[];
  returns?: string;
}

export interface ParameterMetadata {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

/**
 * Transaction Definition (ONE Plan object)
 *
 * Captures method + parameters before execution
 */
export interface PlanTransaction {
  plan: string; // Plan name (e.g., 'one.storage')
  method: string; // Method name (e.g., 'storeVersionedObject')
  params: any; // Method parameters
}

/**
 * Transaction Result (ONE Story object)
 *
 * Captures Plan + Result after execution
 */
export interface StoryResult<T = any> {
  success: boolean;
  plan: PlanTransaction; // The executed plan
  data?: T; // Result data
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: number;
  executionTime?: number;
}

/**
 * Plan Registry
 *
 * Manages all Plans and provides unified invocation interface
 * following ONE's transaction pattern: Plan → Evaluate → Story
 */
export class PlanRegistry {
  private plans = new Map<string, Plan>();
  private metadata = new Map<string, PlanMetadata>();

  /**
   * Register a Plan
   *
   * @param name - Plan name (e.g., 'one.storage', 'one.leute')
   * @param plan - Plan instance with executable methods
   * @param metadata - Optional metadata for documentation/discovery
   */
  register(name: string, plan: any, metadata?: Partial<PlanMetadata>) {
    if (this.plans.has(name)) {
      throw new Error(`Plan '${name}' is already registered`);
    }

    this.plans.set(name, plan);

    // Extract method names from plan
    const methods = this.extractMethods(plan);

    this.metadata.set(name, {
      name,
      description: metadata?.description,
      version: metadata?.version,
      methods: methods.map(methodName => ({
        name: methodName,
        description: metadata?.methods?.find(m => m.name === methodName)?.description
      }))
    });
  }

  /**
   * Unregister a Plan
   */
  unregister(name: string): boolean {
    this.metadata.delete(name);
    return this.plans.delete(name);
  }

  /**
   * Execute a Plan (ONE transaction pattern)
   *
   * 1. Create Plan object (method + params)
   * 2. Evaluate Plan
   * 3. Create Story object (Plan + Result)
   *
   * @returns Story object with Plan and Result
   */
  async execute<T = any>(
    planName: string,
    methodName: string,
    params?: any
  ): Promise<StoryResult<T>> {
    const startTime = Date.now();

    // Create Plan transaction
    const planTransaction: PlanTransaction = {
      plan: planName,
      method: methodName,
      params
    };

    try {
      const plan = this.plans.get(planName);

      if (!plan) {
        return {
          success: false,
          plan: planTransaction,
          error: {
            code: 'PLAN_NOT_FOUND',
            message: `Plan '${planName}' not found`
          },
          timestamp: Date.now(),
          executionTime: Date.now() - startTime
        };
      }

      const method = (plan as any)[methodName];

      if (typeof method !== 'function') {
        return {
          success: false,
          plan: planTransaction,
          error: {
            code: 'METHOD_NOT_FOUND',
            message: `Method '${methodName}' not found on plan '${planName}'`
          },
          timestamp: Date.now(),
          executionTime: Date.now() - startTime
        };
      }

      // Evaluate Plan - invoke method
      const result = Array.isArray(params)
        ? await method.apply(plan, params)
        : await method.call(plan, params);

      // Create Story object - Plan + Result
      return {
        success: true,
        plan: planTransaction,
        data: result,
        timestamp: Date.now(),
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      // Create Story object with error
      return {
        success: false,
        plan: planTransaction,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: error
        },
        timestamp: Date.now(),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get a Plan instance
   */
  getPlan<T extends Plan = Plan>(name: string): T | undefined {
    return this.plans.get(name) as T | undefined;
  }

  /**
   * Check if Plan exists
   */
  hasPlan(name: string): boolean {
    return this.plans.has(name);
  }

  /**
   * Get Plan metadata
   */
  getMetadata(name: string): PlanMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * List all registered Plans
   */
  listPlans(): string[] {
    return Array.from(this.plans.keys());
  }

  /**
   * Get all Plan metadata
   */
  getAllMetadata(): PlanMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Extract method names from Plan
   * (skips constructor and private methods starting with _)
   */
  private extractMethods(plan: Plan): string[] {
    const methods: string[] = [];
    const proto = Object.getPrototypeOf(plan);

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (
        name !== 'constructor' &&
        !name.startsWith('_') &&
        typeof proto[name] === 'function'
      ) {
        methods.push(name);
      }
    }

    return methods;
  }

  /**
   * Create a proxy for type-safe Plan invocation
   *
   * Usage:
   * const storage = registry.proxy<OneStoragePlan>('one.storage');
   * const result = await storage.storeVersionedObject(obj);
   */
  proxy<T extends Plan>(planName: string): T {
    const registry = this;

    return new Proxy({} as T, {
      get(_target, methodName: string) {
        return async (...args: any[]) => {
          const story = await registry.execute(planName, methodName, args);
          if (!story.success) {
            throw new Error(story.error?.message || 'Unknown error');
          }
          return story.data;
        };
      }
    });
  }
}

/**
 * Create a new Plan registry
 */
export function createPlanRegistry(): PlanRegistry {
  return new PlanRegistry();
}
