import type { Module } from './types';

/**
 * Simple internal registry for module dependency management
 * Uses targetType-based matching (simpler than domain/keyword matching)
 */
interface SimpleSupply {
  targetType: string;
  instance: any;
}

interface SimpleDemand {
  targetType: string;
  required: boolean;
  consumer: Module;
}

class SimpleRegistry {
  private supplies: SimpleSupply[] = [];
  private demands: SimpleDemand[] = [];

  registerSupply(supply: SimpleSupply): void {
    this.supplies.push(supply);
  }

  registerDemand(demand: SimpleDemand): void {
    this.demands.push(demand);
  }

  getSuppliesByType(targetType: string): SimpleSupply[] {
    return this.supplies.filter(s => s.targetType === targetType);
  }

  getUnsatisfiedDemands(): SimpleDemand[] {
    return this.demands.filter(d => {
      const hasSupply = this.supplies.some(s => s.targetType === d.targetType);
      return d.required && !hasSupply;
    });
  }

  clear(): void {
    this.supplies = [];
    this.demands = [];
  }
}

/**
 * ModuleRegistry - Coordinates module registration and initialization
 *
 * Handles:
 * - Collecting demands/supplies from modules
 * - Topological sort for dependency-ordered initialization
 * - Automatic dependency wiring
 * - Cleanup/shutdown coordination
 */
export class ModuleRegistry {
  private registry = new SimpleRegistry();
  private modules: Module[] = [];
  private initOrder: Module[] = [];

  /**
   * Register a module with its demands and supplies
   */
  register(module: Module): void {
    this.modules.push(module);

    // Register module's demands
    const constructor = module.constructor as any;
    const demands = constructor.demands || [];
    for (const demand of demands) {
      this.registry.registerDemand({
        targetType: demand.targetType,
        required: demand.required,
        consumer: module
      });
    }
  }

  /**
   * Manually supply a dependency (for non-module dependencies like Model instance)
   */
  supply(targetType: string, instance: any): void {
    this.registry.registerSupply({ targetType, instance });
  }

  /**
   * Initialize all modules in dependency order
   */
  async initAll(): Promise<void> {
    // Topologically sort modules
    this.initOrder = this.topologicalSort();

    // Initialize in order
    for (const module of this.initOrder) {
      console.log(`[ModuleRegistry] Initializing ${module.name}...`);

      // Inject dependencies before initialization
      const constructor = module.constructor as any;
      const demands = constructor.demands || [];
      for (const demand of demands) {
        // Get the instance from registry
        const supplies = this.registry.getSuppliesByType(demand.targetType);
        if (supplies.length > 0) {
          // Use the first matching supply
          module.setDependency(demand.targetType, supplies[0].instance);
        }
      }

      // Initialize module with dependencies injected
      await module.init();

      // Then emit supplies so dependent modules can receive initialized services
      module.emitSupplies(this.registry);
    }

    console.log('[ModuleRegistry] All modules initialized');
  }

  /**
   * Shutdown all modules in reverse order
   */
  async shutdownAll(): Promise<void> {
    // Shutdown in reverse order
    for (let i = this.initOrder.length - 1; i >= 0; i--) {
      const module = this.initOrder[i];
      console.log(`[ModuleRegistry] Shutting down ${module.name}...`);
      await module.shutdown();
    }

    this.registry.clear();
    console.log('[ModuleRegistry] All modules shut down');
  }

  /**
   * Get unsatisfied demands (for debugging)
   */
  getUnsatisfiedDemands() {
    return this.registry.getUnsatisfiedDemands();
  }

  /**
   * Topological sort modules by dependency graph
   */
  private topologicalSort(): Module[] {
    const sorted: Module[] = [];
    const visited = new Set<Module>();
    const visiting = new Set<Module>();

    const visit = (module: Module) => {
      if (visited.has(module)) return;
      if (visiting.has(module)) {
        throw new Error(`Circular dependency detected involving ${module.name}`);
      }

      visiting.add(module);

      // Visit dependencies first
      const constructor = module.constructor as any;
      const demands = constructor.demands || [];

      for (const demand of demands) {
        // Check if dependency is manually supplied (e.g., Model instance as 'OneCore')
        const manuallySupplied = this.registry.getSuppliesByType(demand.targetType).length > 0;

        if (manuallySupplied) {
          // Dependency is manually supplied, no module dependency needed
          continue;
        }

        // Find module that provides this demand
        const provider = this.modules.find(m => {
          const ctor = m.constructor as any;
          const supplies = ctor.supplies || [];
          return supplies.some((s: any) => s.targetType === demand.targetType);
        });

        if (provider) {
          visit(provider);
        } else if (demand.required) {
          throw new Error(`Required dependency ${demand.targetType} not found for ${module.name}`);
        }
      }

      visiting.delete(module);
      visited.add(module);
      sorted.push(module);
    };

    // Visit all modules
    for (const module of this.modules) {
      visit(module);
    }

    return sorted;
  }
}
