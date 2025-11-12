/**
 * PlanRegistry - Central orchestration point for the Unified Plan System
 *
 * The PlanRegistry maintains a map of operation names to plan implementations
 * and provides `invoke()` as the single entry point for all operations.
 *
 * Key responsibilities:
 * - Operation registration with metadata
 * - Capability-based authorization
 * - Performance metrics collection
 * - Operation introspection
 *
 * Type safety is enforced at compile time via TypeScript.
 * No runtime validation - transports are trusted and types are checked at compile time.
 */

import type { PlanMetadata, OperationMetadata } from './types/metadata.js';
import type { PlanContext } from './types/context.js';
import {
  PlanError,
  UnknownOperationError,
  ForbiddenError
} from './errors.js';
import { hasCapability } from './types/context.js';
import { toOperationMetadata } from './types/metadata.js';

/**
 * Operation performance metrics
 */
export interface OperationMetrics {
  operation: string;
  count: number;
  successCount: number;
  failureCount: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  lastInvocation: number;
}

/**
 * PlanRegistry configuration
 */
export interface PlanRegistryConfig {
  /**
   * Enable development mode features (detailed errors, stack traces)
   */
  devMode?: boolean;

  /**
   * Enable performance metrics collection
   */
  enableMetrics?: boolean;

  /**
   * Log slow operations (milliseconds threshold)
   */
  slowOperationThreshold?: number;
}

/**
 * Central plan registry
 */
export class PlanRegistry {
  private plans = new Map<string, PlanMetadata>();
  private planInstances = new Map<string, any>(); // Singleton instances
  private metrics = new Map<string, OperationMetrics>();
  private latencies = new Map<string, number[]>(); // For percentile calculation
  private config: Required<PlanRegistryConfig>;

  constructor(config: PlanRegistryConfig = {}) {
    this.config = {
      devMode: config.devMode ?? process.env.NODE_ENV === 'development',
      enableMetrics: config.enableMetrics ?? true,
      slowOperationThreshold: config.slowOperationThreshold ?? 100
    };
  }

  /**
   * Register an operation
   *
   * @throws PlanError if operation name is invalid or already registered
   */
  register(metadata: PlanMetadata): void {
    const operationName = `${metadata.domain}:${metadata.method}`;

    // Validate operation name format
    if (!/^[a-z][a-zA-Z]*:[a-z][a-zA-Z]*$/.test(operationName)) {
      throw new PlanError(
        `Invalid operation name: ${operationName}. Must match pattern: domain:method`,
        'INVALID_OPERATION_NAME',
        { operationName }
      );
    }

    // Check for collision
    if (this.plans.has(operationName)) {
      throw new PlanError(
        `Operation collision: ${operationName} already registered`,
        'OPERATION_COLLISION',
        { operationName }
      );
    }

    // Validate plan has the method
    if (typeof metadata.plan[metadata.method] !== 'function') {
      throw new PlanError(
        `Plan does not have method: ${metadata.method}`,
        'INVALID_PLAN',
        { domain: metadata.domain, method: metadata.method }
      );
    }

    // Store plan instance (singleton pattern)
    const planKey = metadata.plan.constructor.name;
    if (!this.planInstances.has(planKey)) {
      this.planInstances.set(planKey, metadata.plan);
    }

    // Store metadata with shared plan instance
    this.plans.set(operationName, {
      ...metadata,
      plan: this.planInstances.get(planKey)
    });

    // Initialize metrics
    if (this.config.enableMetrics) {
      this.metrics.set(operationName, {
        operation: operationName,
        count: 0,
        successCount: 0,
        failureCount: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        lastInvocation: 0
      });
      this.latencies.set(operationName, []);
    }
  }

  /**
   * Invoke an operation
   *
   * @param operation - Operation name in domain:method format
   * @param request - Request payload (will be validated)
   * @param context - Optional execution context with auth/tracking
   * @returns Promise resolving to validated response
   * @throws PlanError for validation, authorization, or execution errors
   */
  async invoke<TRequest, TResponse>(
    operation: string,
    request: TRequest,
    context?: PlanContext
  ): Promise<TResponse> {
    const startTime = performance.now();
    const metadata = this.plans.get(operation);

    if (!metadata) {
      throw new UnknownOperationError(operation);
    }

    try {
      // Check capabilities
      if (context && metadata.requiredCapability) {
        if (!hasCapability(context.auth, metadata.requiredCapability)) {
          throw new ForbiddenError(
            `Insufficient permissions for ${operation}`,
            {
              required: metadata.requiredCapability,
              actual: context.auth.capabilities
            }
          );
        }
      }

      // Invoke plan method (TypeScript ensures type safety at compile time)
      const result = await metadata.plan[metadata.method](request, context);

      // Update metrics (success)
      const duration = performance.now() - startTime;
      this.updateMetrics(operation, duration, true);

      // Log slow operations
      if (duration > this.config.slowOperationThreshold) {
        console.warn(
          `Slow operation: ${operation} took ${duration.toFixed(2)}ms`
        );
      }

      return result as TResponse;
    } catch (error) {
      // Update metrics (failure)
      const duration = performance.now() - startTime;
      this.updateMetrics(operation, duration, false);

      // Re-throw for transport plan to handle
      throw error;
    }
  }

  /**
   * List all registered operations
   */
  list(): OperationMetadata[] {
    return Array.from(this.plans.values()).map(toOperationMetadata);
  }

  /**
   * Get metadata for a specific operation
   */
  describe(operation: string): OperationMetadata | null {
    const metadata = this.plans.get(operation);
    if (!metadata) {
      return null;
    }
    return toOperationMetadata(metadata);
  }

  /**
   * Get performance metrics for operation(s)
   *
   * @param operation - Optional operation name (returns all if omitted)
   */
  getMetrics(operation?: string): OperationMetrics | Map<string, OperationMetrics> {
    if (operation) {
      const metrics = this.metrics.get(operation);
      if (!metrics) {
        throw new UnknownOperationError(operation);
      }
      return metrics;
    }
    return this.metrics;
  }

  /**
   * Reset metrics for operation(s)
   */
  resetMetrics(operation?: string): void {
    if (operation) {
      const metadata = this.plans.get(operation);
      if (!metadata) {
        throw new UnknownOperationError(operation);
      }
      this.metrics.set(operation, {
        operation,
        count: 0,
        successCount: 0,
        failureCount: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        lastInvocation: 0
      });
      this.latencies.set(operation, []);
    } else {
      // Reset all
      for (const op of this.plans.keys()) {
        this.resetMetrics(op);
      }
    }
  }

  /**
   * Check if an operation is registered
   */
  has(operation: string): boolean {
    return this.plans.has(operation);
  }

  /**
   * Get number of registered operations
   */
  get size(): number {
    return this.plans.size;
  }

  /**
   * Update performance metrics after invocation
   */
  private updateMetrics(operation: string, duration: number, success: boolean): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const metrics = this.metrics.get(operation);
    const latencies = this.latencies.get(operation);

    if (!metrics || !latencies) {
      return;
    }

    // Update counts
    metrics.count++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }

    // Update timing
    metrics.totalTime += duration;
    metrics.avgTime = metrics.totalTime / metrics.count;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);
    metrics.lastInvocation = Date.now();

    // Store latency for percentile calculation
    latencies.push(duration);

    // Keep only last 1000 latencies for memory efficiency
    if (latencies.length > 1000) {
      latencies.shift();
    }

    // Calculate percentiles
    const sorted = [...latencies].sort((a, b) => a - b);
    metrics.p50 = this.percentile(sorted, 0.5);
    metrics.p95 = this.percentile(sorted, 0.95);
    metrics.p99 = this.percentile(sorted, 0.99);
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}
