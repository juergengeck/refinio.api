/**
 * REST Transport Adapter
 *
 * Exposes handler registry through REST API.
 * Auto-generates endpoints for all handlers and methods.
 *
 * Endpoint format:
 * POST /api/:handler/:method
 *
 * Examples:
 * POST /api/memory/createSubject
 * POST /api/chatMemory/enableMemories
 * POST /api/subjects/extractSubjects
 *
 * Request body: JSON with method parameters
 * Response: JSON with result
 */

import type { HandlerRegistry } from '../registry/HandlerRegistry.js';

export interface RestRequest {
  handler: string;
  method: string;
  body: any;
  headers?: Record<string, string>;
}

export interface RestResponse {
  statusCode: number;
  body: {
    success: boolean;
    data?: any;
    error?: {
      code: string;
      message: string;
    };
  };
}

/**
 * REST Transport
 *
 * Routes HTTP requests to handler registry
 */
export class RestTransport {
  constructor(private registry: HandlerRegistry) {}

  /**
   * Handle REST API request
   */
  async handleRequest(req: RestRequest): Promise<RestResponse> {
    const { handler, method, body } = req;

    // Validate
    if (!handler || !method) {
      return {
        statusCode: 400,
        body: {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing handler or method in URL'
          }
        }
      };
    }

    // Check if handler exists
    if (!this.registry.hasHandler(handler)) {
      return {
        statusCode: 404,
        body: {
          success: false,
          error: {
            code: 'HANDLER_NOT_FOUND',
            message: `Handler '${handler}' not found`
          }
        }
      };
    }

    // Call registry
    const result = await this.registry.call(handler, method, body);

    return {
      statusCode: result.success ? 200 : 500,
      body: {
        success: result.success,
        data: result.data,
        error: result.error
      }
    };
  }

  /**
   * Get OpenAPI schema (for documentation)
   */
  getOpenApiSchema() {
    const metadata = this.registry.getAllMetadata();
    const paths: Record<string, any> = {};

    for (const handler of metadata) {
      for (const method of handler.methods) {
        const path = `/api/${handler.name}/${method.name}`;
        paths[path] = {
          post: {
            summary: method.description || `${handler.name}.${method.name}`,
            operationId: `${handler.name}_${method.name}`,
            tags: [handler.name],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: this.buildSchemaProperties(method.params)
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' }
                      }
                    }
                  }
                }
              },
              '500': {
                description: 'Error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        error: {
                          type: 'object',
                          properties: {
                            code: { type: 'string' },
                            message: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };
      }
    }

    return {
      openapi: '3.0.0',
      info: {
        title: 'LAMA API',
        version: '1.0.0',
        description: 'Auto-generated API from handler registry'
      },
      paths
    };
  }

  /**
   * Build OpenAPI schema properties from method params
   */
  private buildSchemaProperties(params?: any[]): Record<string, any> {
    if (!params) return {};

    const properties: Record<string, any> = {};
    for (const param of params) {
      properties[param.name] = {
        type: param.type || 'string',
        description: param.description
      };
    }
    return properties;
  }

  /**
   * List all available endpoints (for discovery)
   */
  getEndpoints() {
    const metadata = this.registry.getAllMetadata();
    const endpoints: Array<{
      path: string;
      handler: string;
      method: string;
      description?: string;
    }> = [];

    for (const handler of metadata) {
      for (const method of handler.methods) {
        endpoints.push({
          path: `/api/${handler.name}/${method.name}`,
          handler: handler.name,
          method: method.name,
          description: method.description
        });
      }
    }

    return endpoints;
  }
}
