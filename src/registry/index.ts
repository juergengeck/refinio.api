/**
 * Registry Initialization
 *
 * Creates and configures the Plan registry with all available Plans.
 * This is the central configuration for all transports (QUIC, MCP, REST, IPC).
 */

import { PlanRegistry, createPlanRegistry } from './PlanRegistry.js';
import { HandlerRegistry, createHandlerRegistry } from './HandlerRegistry.js';
import type { MemoryHandler } from '../../../lama.core/handlers/MemoryHandler.js';
import type { ChatMemoryHandler } from '../../../lama.core/handlers/ChatMemoryHandler.js';
import type { AIAssistantHandler } from '../../../lama.core/handlers/AIAssistantHandler.js';
import type { SubjectsHandler } from '../../../lama.core/handlers/SubjectsHandler.js';
import type { ProposalsHandler } from '../../../lama.core/handlers/ProposalsHandler.js';

export interface HandlerDependencies {
  nodeOneCore: any;
  channelManager: any;
  topicModel: any;
  leuteModel: any;
  aiAssistantModel: any;
  llmManager: any;
  chatMemoryHandler: any;
  memoryHandler: any;
  subjectsHandler: any;
  proposalsHandler: any;
  platform?: any;
}

/**
 * Initialize legacy handler registry with LAMA-specific handlers
 *
 * NOTE: This uses HandlerRegistry for backward compatibility with LAMA.
 * For new ONE platform code, use initializeOnePlans() which returns PlanRegistry.
 *
 * Call this during app initialization with platform-specific dependencies
 */
export function initializeRegistry(deps: HandlerDependencies): HandlerRegistry {
  const registry = createHandlerRegistry();

  // Memory operations
  if (deps.memoryHandler) {
    registry.register('memory', deps.memoryHandler, {
      description: 'Subject storage and retrieval operations',
      version: '1.0.0'
    });
  }

  // Chat-Memory integration
  if (deps.chatMemoryHandler) {
    registry.register('chatMemory', deps.chatMemoryHandler, {
      description: 'Chat conversation memory integration',
      version: '1.0.0'
    });
  }

  // Subject analysis
  if (deps.subjectsHandler) {
    registry.register('subjects', deps.subjectsHandler, {
      description: 'Subject extraction and analysis',
      version: '1.0.0'
    });
  }

  // Context-aware proposals
  if (deps.proposalsHandler) {
    registry.register('proposals', deps.proposalsHandler, {
      description: 'Context-aware knowledge sharing proposals',
      version: '1.0.0'
    });
  }

  // AI Assistant
  if (deps.aiAssistantModel) {
    registry.register('aiAssistant', deps.aiAssistantModel, {
      description: 'AI assistant operations and LLM interactions',
      version: '1.0.0'
    });
  }

  return registry;
}

// Export both PlanRegistry (new) and HandlerRegistry (legacy for LAMA-specific handlers)
export { PlanRegistry, createPlanRegistry } from './PlanRegistry.js';
export { HandlerRegistry, createHandlerRegistry } from './HandlerRegistry.js';
export type { Plan, PlanMetadata, ExecutionResult, PlanTransaction } from './PlanRegistry.js';
export type { Handler, HandlerMetadata, CallResult } from './HandlerRegistry.js';
export { initializeOnePlans } from './initialize-one-handlers.js';
