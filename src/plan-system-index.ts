/**
 * Unified Plan System - Public API
 *
 * This module exports all public interfaces for the plan system.
 * Import from '@refinio/api/plan-system' to access these components.
 */

// Core registry
export { PlanRegistry } from './PlanRegistry.js';
export type { OperationMetrics, PlanRegistryConfig } from './PlanRegistry.js';

// Base classes
export { TransportPlan } from './TransportPlan.js';
export type { TransportConfig } from './TransportPlan.js';

export { CoordinationPlan } from './CoordinationPlan.js';
export type { ProgressEvent } from './CoordinationPlan.js';

// Errors
export {
  PlanError,
  ValidationError,
  UnknownOperationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InternalError
} from './errors.js';

// Types - Context
export type {
  AuthContext,
  PlanContext
} from './types/context.js';

export {
  createAuthContext,
  createPlanContext,
  hasCapability
} from './types/context.js';

// Types - Metadata
export type {
  PlanMetadata,
  OperationMetadata
} from './types/metadata.js';

export {
  toOperationMetadata,
  isValidOperationName,
  parseOperationName
} from './types/metadata.js';

// Types - Responses
export type {
  SuccessResponse,
  ErrorResponse,
  OperationResponse
} from './types/responses.js';

export {
  success,
  error,
  errorFromException
} from './types/responses.js';

// Story tracking
export { StoryFactory } from './StoryFactory.js';
export type {
  ExecutionMetadata,
  ExecutionResult,
  OperationResult,
  RegisterPlanParams,
  MethodMetadata,
  RegisterPlanInstanceParams,
  // Re-exported from assembly.core via StoryFactory
  Assembly,
  Story,
  Plan,
  DemandPattern,
  SupplyPattern
} from './StoryFactory.js';

// Plan object management
export {
  PlanObjectManager,
  globalPlanObjectManager,
  initializePlanObjectManager,
  registerStandardPlans
} from './PlanObjectManager.js';
export type { PlanObjectManagerDependencies } from './PlanObjectManager.js';

// Module System
export { ModuleRegistry } from './plan-system/ModuleRegistry.js';
export type { Module, ModuleMetadata, LifecycleAware } from './plan-system/types.js';

// Recipes - ONE.core object definitions
// Note: Story type is exported from StoryFactory (re-exported from assembly.core)
export { StoryRecipe, PlanRecipe, RefinioApiRecipes } from './recipes/index.js';

// Transports
// NOTE: IPCTransportPlan is electron-only, import directly from './transports/IPCTransportPlan.js'
// export { IPCTransportPlan } from './transports/IPCTransportPlan.js';
// export type { IPCTransportConfig } from './transports/IPCTransportPlan.js';
