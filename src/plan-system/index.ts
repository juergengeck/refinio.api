/**
 * Module System for refinio.api
 *
 * This module provides a dependency injection and initialization system
 * for modular application architecture.
 *
 * Core concepts:
 * - Modules declare demands (dependencies) and supplies (services)
 * - ModuleRegistry handles topological sorting and initialization
 * - Automatic dependency wiring via RegistryPlan/MatchingPlan
 */

export { ModuleRegistry } from './ModuleRegistry.js';
export type { Module, ModuleMetadata } from './types.js';
