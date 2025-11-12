/**
 * Context types for plan invocation
 *
 * These types are passed through transport layers to business logic plans,
 * providing authentication, authorization, and request tracking information.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Authentication context
 *
 * Contains information about the authenticated user/session.
 */
export interface AuthContext {
  /**
   * User ID (SHA256IdHash<Person>)
   */
  userId: SHA256IdHash<Person>;

  /**
   * Session ID for tracking
   */
  sessionId: string;

  /**
   * List of capabilities granted to this user/session
   *
   * Examples:
   * - 'chat:send' - Can send messages
   * - 'chat:read' - Can read messages
   * - 'admin:*' - All admin capabilities
   */
  capabilities: string[];
}

/**
 * Plan execution context
 *
 * Passed to every plan method invocation, providing authentication,
 * request tracking, and optional transport-specific metadata.
 */
export interface PlanContext {
  /**
   * Authentication/authorization context
   */
  auth: AuthContext;

  /**
   * Unique request identifier for tracing/logging
   */
  requestId: string;

  /**
   * Unix timestamp (milliseconds) when request was received
   */
  timestamp: number;

  /**
   * Optional transport-specific metadata
   *
   * Examples:
   * - HTTP headers
   * - IPC event information
   * - WebWorker message metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Create a minimal auth context (for testing/internal use)
 */
export function createAuthContext(
  userId: SHA256IdHash<Person>,
  sessionId: string,
  capabilities: string[] = []
): AuthContext {
  return {
    userId,
    sessionId,
    capabilities
  };
}

/**
 * Create a plan context with current timestamp
 */
export function createPlanContext(
  auth: AuthContext,
  requestId: string,
  metadata?: Record<string, any>
): PlanContext {
  return {
    auth,
    requestId,
    timestamp: Date.now(),
    metadata
  };
}

/**
 * Check if user has a specific capability
 */
export function hasCapability(auth: AuthContext, capability: string): boolean {
  // Check for exact match
  if (auth.capabilities.includes(capability)) {
    return true;
  }

  // Check for wildcard match (e.g., 'admin:*' grants 'admin:users:delete')
  const parts = capability.split(':');
  for (let i = parts.length; i > 0; i--) {
    const wildcard = parts.slice(0, i).join(':') + ':*';
    if (auth.capabilities.includes(wildcard)) {
      return true;
    }
  }

  return false;
}
