/**
 * Standard response types for operations
 */

/**
 * Successful operation response
 */
export interface SuccessResponse<T> {
  success: true;
  result: T;
}

/**
 * Error operation response
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    stack?: string; // Only in development mode
  };
}

/**
 * Union type for operation responses
 *
 * All transport plans should return this format.
 */
export type OperationResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Create a success response
 */
export function success<T>(result: T): SuccessResponse<T> {
  return {
    success: true,
    result
  };
}

/**
 * Create an error response
 */
export function error(
  code: string,
  message: string,
  details?: Record<string, any>,
  stack?: string
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      stack
    }
  };
}

/**
 * Create error response from Error object
 */
export function errorFromException(
  err: Error,
  defaultCode = 'INTERNAL_ERROR',
  includeStack = false
): ErrorResponse {
  const code = (err as any).code || defaultCode;
  const details = (err as any).details;

  return error(
    code,
    err.message,
    details,
    includeStack ? err.stack : undefined
  );
}
