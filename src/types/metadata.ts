/**
 * Metadata types for plan registration and introspection
 */

/**
 * Plan metadata for operation registration
 *
 * Contains all information needed to register an operation in the plan registry,
 * including versioning and capability requirements.
 */
export interface PlanMetadata {
  /**
   * Domain/namespace for the operation
   *
   * Examples: 'chat', 'topicAnalysis', 'ai', 'conversation'
   */
  domain: string;

  /**
   * Method name within the domain
   *
   * Examples: 'sendMessage', 'getHistory', 'analyze'
   */
  method: string;

  /**
   * Plan instance (the actual plan object)
   *
   * Must have a method matching `method` property.
   */
  plan: any;

  /**
   * Semantic version for the operation
   *
   * Format: MAJOR.MINOR.PATCH (e.g., '1.0.0')
   */
  version: string;

  /**
   * Required capability to invoke this operation
   *
   * If specified, the plan registry will check that the request context
   * has this capability before invoking the plan.
   *
   * Examples: 'chat:send', 'admin:users:delete'
   */
  requiredCapability?: string;

  /**
   * Whether this operation returns AsyncIterableIterator (streaming)
   *
   * Streaming operations return AsyncIterableIterator for progressive
   * response delivery (e.g., AI generation, large data transfers).
   */
  streaming?: boolean;

  /**
   * Human-readable description of the operation
   *
   * Used for documentation, CLI help, and introspection.
   */
  description?: string;
}

/**
 * Operation metadata for introspection
 *
 * Subset of PlanMetadata exposed for runtime introspection,
 * excluding non-serializable parts (plan instance, schemas).
 */
export interface OperationMetadata {
  /**
   * Full operation name (domain:method)
   */
  operation: string;

  /**
   * Domain/namespace
   */
  domain: string;

  /**
   * Method name
   */
  method: string;

  /**
   * Semantic version
   */
  version: string;

  /**
   * Whether operation supports streaming
   */
  streaming: boolean;

  /**
   * Required capability (if any)
   */
  requiredCapability?: string;

  /**
   * Human-readable description
   */
  description?: string;
}

/**
 * Convert PlanMetadata to OperationMetadata (for introspection)
 */
export function toOperationMetadata(metadata: PlanMetadata): OperationMetadata {
  return {
    operation: `${metadata.domain}:${metadata.method}`,
    domain: metadata.domain,
    method: metadata.method,
    version: metadata.version,
    streaming: metadata.streaming ?? false,
    requiredCapability: metadata.requiredCapability,
    description: metadata.description
  };
}

/**
 * Validate operation name format (domain:method)
 */
export function isValidOperationName(name: string): boolean {
  return /^[a-z][a-zA-Z]*:[a-z][a-zA-Z]*$/.test(name);
}

/**
 * Parse operation name into domain and method
 */
export function parseOperationName(name: string): { domain: string; method: string } | null {
  if (!isValidOperationName(name)) {
    return null;
  }

  const [domain, method] = name.split(':');
  return { domain, method };
}
