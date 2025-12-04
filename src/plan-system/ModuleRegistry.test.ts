// Note: Using regular imports for Jest compatibility
import { ModuleRegistry } from './ModuleRegistry.js';
import { Module, ModuleMetadata } from './types.js';

// Jest doesn't support describe/it/expect as imports, they're global
const { describe, it, expect, beforeEach } = global as any;

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  it('should register modules and collect their demands', () => {
    class TestModule implements Module {
      name = 'TestModule';
      static demands = [{ targetType: 'Dependency', required: true }];
      static supplies = [{ targetType: 'Service' }];

      async init() {}
      async shutdown() {}
      setDependency() {}
      emitSupplies() {}
    }

    const module = new TestModule();
    registry.register(module);

    const unsatisfied = registry.getUnsatisfiedDemands();
    expect(unsatisfied).toHaveLength(1);
    expect(unsatisfied[0].targetType).toBe('Dependency');
  });

  it('should initialize modules in dependency order', async () => {
    const initOrder: string[] = [];
    const depInjectionOrder: string[] = [];

    // Module A has no dependencies (root)
    class ModuleA implements Module {
      name = 'ModuleA';
      static demands = [];
      static supplies = [{ targetType: 'ServiceA' }];

      serviceA = { name: 'ServiceA' };

      async init() {
        initOrder.push('A');
      }
      async shutdown() {}
      setDependency() {}
      emitSupplies(reg: any) {
        reg.supply({ targetType: 'ServiceA', instance: this.serviceA });
      }
    }

    // Module B depends on ServiceA
    class ModuleB implements Module {
      name = 'ModuleB';
      static demands = [{ targetType: 'ServiceA', required: true }];
      static supplies = [{ targetType: 'ServiceB' }];

      deps: any = {};
      serviceB = { name: 'ServiceB' };

      async init() {
        // Verify dependency is available during init
        if (!this.deps.ServiceA) throw new Error('Missing ServiceA');
        initOrder.push('B');
      }
      async shutdown() {}
      setDependency(type: string, instance: any) {
        depInjectionOrder.push(type);
        this.deps[type] = instance;
      }
      emitSupplies(reg: any) {
        reg.supply({ targetType: 'ServiceB', instance: this.serviceB });
      }
    }

    const moduleA = new ModuleA();
    const moduleB = new ModuleB();

    registry.register(moduleB); // Register B first (depends on A)
    registry.register(moduleA); // Register A second (no deps)

    await registry.initAll();

    // A should init before B (dependency order)
    expect(initOrder).toEqual(['A', 'B']);
    // ModuleB should have received ServiceA before/during init
    expect(depInjectionOrder).toContain('ServiceA');
  });

  it('should shutdown modules in reverse order', async () => {
    const shutdownOrder: string[] = [];

    class ModuleA implements Module {
      name = 'ModuleA';
      static demands = [];
      static supplies = [];
      async init() {}
      async shutdown() { shutdownOrder.push('A'); }
      setDependency() {}
      emitSupplies() {}
    }

    class ModuleB implements Module {
      name = 'ModuleB';
      static demands = [];
      static supplies = [];
      async init() {}
      async shutdown() { shutdownOrder.push('B'); }
      setDependency() {}
      emitSupplies() {}
    }

    registry.register(new ModuleA());
    registry.register(new ModuleB());
    await registry.initAll();
    await registry.shutdownAll();

    // Reverse of init order
    expect(shutdownOrder).toEqual(['B', 'A']);
  });
});
