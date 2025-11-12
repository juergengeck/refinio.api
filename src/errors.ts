/**
 * Error classes for the Unified Plan System
 *
 * These errors are thrown by plans and caught by transport plans for
 * appropriate formatting according to protocol conventions.
 */

/**
 * Base error class for all plan-related errors
 */
export class PlanError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'PlanError';

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PlanError);
    }
  }

  /**
   * Serialize error for transport
   *
   * @param includeStack - Include stack trace (development mode only)
   */
  toJSON(includeStack = false): Record<string, any> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      ...(includeStack && { stack: this.stack })
    };
  }
}

/**
 * Validation error - request failed schema validation
 */
export class ValidationError extends PlanError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Unknown operation error - operation not registered
 */
export class UnknownOperationError extends PlanError {
  constructor(operation: string) {
    super(`Unknown operation: ${operation}`, 'UNKNOWN_OPERATION', { operation });
    this.name = 'UnknownOperationError';
  }
}

/**
 * Unauthorized error - missing or invalid authentication
 */
export class UnauthorizedError extends PlanError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error - insufficient permissions
 */
export class ForbiddenError extends PlanError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'FORBIDDEN', details);
    this.name = 'ForbiddenError';
  }
}

/**
 * Not found error - resource not found
 */
export class NotFoundError extends PlanError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, `${resource.toUpperCase()}_NOT_FOUND`, { id });
    this.name = 'NotFoundError';
  }
}

/**
 * Internal error - unexpected error occurred
 */
export class InternalError extends PlanError {
  constructor(message: string, originalError?: Error) {
    super(message, 'INTERNAL_ERROR', {
      originalMessage: originalError?.message,
      originalName: originalError?.name
    });
    this.name = 'InternalError';

    // Preserve original stack if available
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}
