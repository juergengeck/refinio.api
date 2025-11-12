/**
 * CoordinationPlan - Base class for coordination plans
 *
 * Coordination plans orchestrate multiple atomic plans to implement
 * complex workflows. They use `api.invoke()` to delegate to atomic
 * plans and compose functionality without duplicating business logic.
 *
 * Examples:
 * - ConversationPlan: sendMessage + analyze + generateAI
 * - OnboardingPlan: createProfile + setupPreferences + sendWelcome
 * - SyncPlan: fetchUpdates + applyChanges + notifyPeers
 *
 * Benefits:
 * - Reduces UI complexity (orchestration moves to backend)
 * - Reusable workflows across platforms
 * - Testable independently of UI
 * - Clear separation of concerns
 */

import type { PlanRegistry } from './PlanRegistry.js';
import type { PlanContext } from './types/context.js';
import { EventEmitter } from 'events';

/**
 * Progress event for multi-step workflows
 */
export interface ProgressEvent {
  step: string;
  percent: number;
  message?: string;
}

/**
 * Base class for coordination plans
 *
 * Extends EventEmitter to support progress events during multi-step workflows.
 */
export abstract class CoordinationPlan extends EventEmitter {
  constructor(
    protected api: PlanRegistry,
    protected oneCore: any
  ) {
    super();
  }

  /**
   * Emit progress event
   *
   * Use this to report progress during long-running workflows:
   *
   * @example
   * ```typescript
   * this.emitProgress('sending', 0, 'Sending message...');
   * const chatResult = await this.api.invoke('chat:sendMessage', request, context);
   * this.emitProgress('analyzing', 33, 'Analyzing keywords...');
   * const analysis = await this.api.invoke('topicAnalysis:analyze', request, context);
   * this.emitProgress('generating', 66, 'Generating AI response...');
   * const aiResult = await this.api.invoke('ai:generateResponse', request, context);
   * this.emitProgress('complete', 100, 'Done!');
   * ```
   */
  protected emitProgress(step: string, percent: number, message?: string): void {
    this.emit('progress', { step, percent, message } as ProgressEvent);
  }

  /**
   * Invoke an atomic plan operation
   *
   * Helper method that wraps `api.invoke()` with error context.
   * Provides consistent error handling and logging across coordination plans.
   *
   * @param operation - Operation name
   * @param request - Request payload
   * @param context - Plan context
   * @returns Response from atomic plan
   */
  protected async invokeAtomicPlan<TRequest, TResponse>(
    operation: string,
    request: TRequest,
    context: PlanContext
  ): Promise<TResponse> {
    try {
      return await this.api.invoke<TRequest, TResponse>(operation, request, context);
    } catch (error) {
      // Add coordination context to error
      const err = error as Error;
      throw new Error(
        `Coordination plan failed at operation ${operation}: ${err.message}`
      );
    }
  }

  /**
   * Execute a rollback action on error
   *
   * Coordination plans can override this to implement rollback logic
   * when a workflow fails partway through.
   *
   * @example
   * ```typescript
   * protected async rollback(completedSteps: string[]): Promise<void> {
   *   if (completedSteps.includes('sendMessage')) {
   *     await this.api.invoke('chat:deleteMessage', { messageId }, context);
   *   }
   * }
   * ```
   */
  protected async rollback?(completedSteps: string[]): Promise<void>;
}

/**
 * Example coordination plan pattern
 *
 * @example
 * ```typescript
 * export class ConversationPlan extends CoordinationPlan {
 *   async sendWithAnalysis(
 *     request: ConversationRequest,
 *     context: PlanContext
 *   ): Promise<ConversationResponse> {
 *     const completedSteps: string[] = [];
 *
 *     try {
 *       // Step 1: Send message
 *       this.emitProgress('sending', 0);
 *       const chatResult = await this.invokeAtomicPlan('chat:sendMessage', {
 *         topicId: request.topicId,
 *         content: request.content
 *       }, context);
 *       completedSteps.push('sendMessage');
 *
 *       // Step 2: Analyze
 *       this.emitProgress('analyzing', 33);
 *       const analysis = await this.invokeAtomicPlan('topicAnalysis:analyze', {
 *         topicId: request.topicId,
 *         messageId: chatResult.messageId
 *       }, context);
 *       completedSteps.push('analyze');
 *
 *       // Step 3: Generate AI response (optional)
 *       if (request.triggerAI) {
 *         this.emitProgress('generating', 66);
 *         const aiResult = await this.invokeAtomicPlan('ai:generateResponse', {
 *           topicId: request.topicId,
 *           context: analysis
 *         }, context);
 *         completedSteps.push('generateAI');
 *       }
 *
 *       this.emitProgress('complete', 100);
 *       return { chatResult, analysis };
 *     } catch (error) {
 *       // Rollback completed steps
 *       if (this.rollback) {
 *         await this.rollback(completedSteps);
 *       }
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
