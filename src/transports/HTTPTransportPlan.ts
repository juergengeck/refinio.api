/**
 * HTTP Transport Plan - Express/Fastify HTTP Server
 *
 * Exposes all registered operations as HTTP endpoints.
 * Routes requests to PlanRegistry for execution.
 *
 * Key features:
 * - RESTful API: POST /api/operations/:operation
 * - CORS support for browser clients
 * - Bearer token authentication
 * - OpenAPI introspection: GET /api/operations
 * - Request/response validation
 * - Structured error handling
 *
 * Usage:
 * ```typescript
 * const transport = new HTTPTransportPlan(registry);
 * await transport.start({ port: 3000, cors: true });
 * ```
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { TransportPlan } from '../TransportPlan.js';
import type { PlanRegistry } from '../PlanRegistry.js';
import type { AuthContext } from '../types/context.js';
import { OperationResponse } from '../types/responses.js';

/**
 * HTTP Transport Configuration
 */
export interface HTTPTransportConfig {
    /** Port to listen on (default: 3000) */
    port?: number;

    /** Host to bind to (default: 'localhost') */
    host?: string;

    /** Enable CORS (default: false) */
    cors?: boolean;

    /** Custom CORS configuration */
    corsOptions?: cors.CorsOptions;

    /** Request body size limit (default: '10mb') */
    bodyLimit?: string;

    /** Enable request logging (default: false) */
    logging?: boolean;

    /** Custom auth token validator */
    validateAuthToken?: (token: string) => Promise<AuthContext | null>;

    /** Development mode - allows requests without auth (default: false) */
    development?: boolean;

    /** API prefix (default: '/api') */
    apiPrefix?: string;
}

/**
 * HTTP Transport Plan
 *
 * Exposes PlanRegistry operations as HTTP REST API.
 */
export class HTTPTransportPlan extends TransportPlan {
    private app?: Express;
    private server?: Server;
    private config: Required<Omit<HTTPTransportConfig, 'corsOptions' | 'validateAuthToken'>> & {
        corsOptions?: cors.CorsOptions;
        validateAuthToken?: (token: string) => Promise<AuthContext | null>;
    };

    constructor(registry: PlanRegistry) {
        super(registry, 'http-transport');
        this.config = {
            port: 3000,
            host: 'localhost',
            cors: false,
            bodyLimit: '10mb',
            logging: false,
            development: false,
            apiPrefix: '/api'
        };
    }

    /**
     * Start HTTP server
     */
    async start(config?: HTTPTransportConfig): Promise<void> {
        if (this.server) {
            throw new Error('HTTP transport already started');
        }

        // Merge config
        this.config = { ...this.config, ...config };

        // Create Express app
        this.app = express();

        // Middleware
        if (this.config.cors) {
            this.app.use(cors(this.config.corsOptions));
        }

        this.app.use(express.json({ limit: this.config.bodyLimit }));
        this.app.use(express.urlencoded({ extended: true, limit: this.config.bodyLimit }));

        // Request logging
        if (this.config.logging) {
            this.app.use(this.loggingMiddleware.bind(this));
        }

        // Health check
        this.app.get(`${this.config.apiPrefix}/health`, (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Introspection endpoint - list all operations
        this.app.get(`${this.config.apiPrefix}/operations`, (req, res) => {
            const operations = this.registry.list();
            res.json({
                operations,
                count: operations.length
            });
        });

        // OpenAPI schema endpoint
        this.app.get(`${this.config.apiPrefix}/openapi.json`, (req, res) => {
            res.json(this.generateOpenAPISchema());
        });

        // Operation endpoint - POST /api/operations/:operation
        this.app.post(
            `${this.config.apiPrefix}/operations/:operation`,
            this.operationHandler.bind(this)
        );

        // Error handler
        this.app.use(this.errorHandler.bind(this));

        // Start server
        await new Promise<void>((resolve, reject) => {
            this.server = this.app!.listen(this.config.port, this.config.host, () => {
                console.log(
                    `[HTTPTransport] Server started on http://${this.config.host}:${this.config.port}${this.config.apiPrefix}`
                );
                resolve();
            });

            this.server.on('error', reject);
        });
    }

    /**
     * Stop HTTP server
     */
    async stop(): Promise<void> {
        if (!this.server) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            this.server!.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('[HTTPTransport] Server stopped');
                    this.server = undefined;
                    this.app = undefined;
                    resolve();
                }
            });
        });
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return !!this.server;
    }

    /**
     * Extract auth context from HTTP request
     */
    protected async extractAuthContext(request: Request): Promise<AuthContext | null> {
        // Extract Bearer token from Authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return this.config.development ? this.createDevAuthContext() : null;
        }

        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return null;
        }

        const token = match[1];

        // Use custom validator if provided
        if (this.config.validateAuthToken) {
            return await this.config.validateAuthToken(token);
        }

        // Development mode - accept any token
        if (this.config.development) {
            return {
                userId: token, // Use token as userId in dev mode
                sessionId: `dev-session-${Date.now()}`,
                capabilities: ['*'] // Admin capabilities in dev mode
            };
        }

        return null;
    }

    /**
     * Operation handler middleware
     */
    private async operationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const operation = req.params.operation;
            const request = req.body;

            // Extract auth context
            const authContext = await this.extractAuthContext(req);
            if (!authContext && !this.config.development) {
                res.status(401).json({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                        details: { hint: 'Provide Bearer token in Authorization header' }
                    }
                });
                return;
            }

            // Invoke operation
            const result = await this.invokeOperation(operation, request, authContext);

            // Send response
            const response = result as OperationResponse<any>;
            const statusCode = response.success ? 200 : this.getErrorStatusCode(response);
            res.status(statusCode).json(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Error handler middleware
     */
    private errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
        console.error('[HTTPTransport] Unhandled error:', err);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: this.config.development ? err.message : 'Internal server error',
                details: this.config.development ? { stack: err.stack } : undefined
            }
        });
    }

    /**
     * Logging middleware
     */
    private loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(
                `[HTTPTransport] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`
            );
        });

        next();
    }

    /**
     * Get HTTP status code from error response
     */
    private getErrorStatusCode(response: OperationResponse<any>): number {
        if (response.success) {
            return 200;
        }

        const errorCode = response.error?.code;

        switch (errorCode) {
            case 'VALIDATION_ERROR':
                return 400;
            case 'UNAUTHORIZED':
                return 401;
            case 'FORBIDDEN':
                return 403;
            case 'NOT_FOUND':
            case 'UNKNOWN_OPERATION':
                return 404;
            case 'INTERNAL_ERROR':
            default:
                return 500;
        }
    }

    /**
     * Generate OpenAPI schema for all operations
     */
    private generateOpenAPISchema(): any {
        const operations = this.registry.list();

        const paths: any = {};

        for (const op of operations) {
            const path = `${this.config.apiPrefix}/operations/${op.operation}`;
            paths[path] = {
                post: {
                    summary: `Execute ${op.operation}`,
                    description: op.description || `Invoke ${op.operation} operation`,
                    operationId: op.operation.replace(':', '_'),
                    tags: [op.operation.split(':')[0]], // Use domain as tag
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    description: 'Operation request parameters'
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: 'Success',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            result: { type: 'object' }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: 'Validation error' },
                        401: { description: 'Unauthorized' },
                        403: { description: 'Forbidden' },
                        404: { description: 'Operation not found' },
                        500: { description: 'Internal server error' }
                    },
                    security: [{ bearerAuth: [] }]
                }
            };
        }

        return {
            openapi: '3.0.0',
            info: {
                title: 'LAMA API',
                version: '1.0.0',
                description: 'Unified Plan System HTTP API'
            },
            servers: [
                {
                    url: `http://${this.config.host}:${this.config.port}`,
                    description: 'Local server'
                }
            ],
            paths,
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                }
            }
        };
    }

    /**
     * Create development auth context
     */
    private createDevAuthContext(): AuthContext {
        return {
            userId: 'dev-user',
            sessionId: `dev-session-${Date.now()}`,
            capabilities: ['*'] // Admin in dev mode
        };
    }
}
