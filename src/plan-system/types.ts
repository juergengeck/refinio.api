import type { Supply, Demand } from '@refinio/one.discovery/lib/plans/index.js';

/**
 * Optional lifecycle interface for Plans that support init/shutdown
 * Use this for type assertions when calling init/shutdown on Plans
 */
export interface LifecycleAware {
  init?(): Promise<void>;
  shutdown?(): Promise<void>;
}

/**
 * Module interface - all modules must implement this
 */
export interface Module {
  /** Module name for logging/debugging */
  readonly name: string;

  /** Initialize the module with injected dependencies */
  init(): Promise<void>;

  /** Shutdown the module and cleanup resources */
  shutdown(): Promise<void>;

  /** Inject a dependency into the module */
  setDependency(targetType: string, instance: any): void;

  /** Emit supplies after initialization */
  emitSupplies(registry: any): void;
}

/**
 * Module constructor metadata
 */
export interface ModuleMetadata {
  /** Dependencies this module needs */
  demands: Demand[];

  /** Services this module provides */
  supplies: Array<{ targetType: string }>;
}
