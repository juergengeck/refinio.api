/**
 * Stdio Transport Plan - Standard Input/Output Transport
 *
 * Reads operations from stdin, writes results to stdout.
 * Enables Unix-style command-line usage with pipes.
 *
 * Protocol: Line-delimited JSON (JSONL)
 * - Input: {"operation":"chat:exportHistory","request":{...}}
 * - Output: {"success":true,"result":{...}}
 *
 * Key features:
 * - Unix pipe-friendly (one operation per line)
 * - Batch processing support (multiple lines)
 * - Streaming mode for continuous input
 * - JSON error responses
 * - Works with any ONE.core operations
 *
 * Usage:
 * ```bash
 * # Single operation
 * echo '{"operation":"chat:exportHistory","request":{"topicId":"123","format":"json"}}' | node cli.js
 *
 * # Batch operations
 * cat operations.jsonl | node cli.js
 *
 * # Interactive mode
 * node cli.js --interactive
 * ```
 */

import * as readline from 'readline';
import { TransportPlan } from '../TransportPlan.js';
import type { PlanRegistry } from '../PlanRegistry.js';
import type { AuthContext } from '../types/context.js';
import { OperationResponse } from '../types/responses.js';

/**
 * Stdio Transport Configuration
 */
export interface StdioTransportConfig {
    /** Development mode - allows operations without auth (default: false) */
    development?: boolean;

    /** Auth token for all operations (optional) */
    authToken?: string;

    /** Custom auth context provider */
    getAuthContext?: () => Promise<AuthContext | null>;

    /** Exit after processing all input (default: true) */
    exitOnEnd?: boolean;

    /** Interactive mode - show prompts (default: false) */
    interactive?: boolean;

    /** Enable verbose logging to stderr (default: false) */
    verbose?: boolean;

    /** Input stream (default: process.stdin) */
    inputStream?: NodeJS.ReadableStream;

    /** Output stream (default: process.stdout) */
    outputStream?: NodeJS.WritableStream;

    /** Error stream (default: process.stderr) */
    errorStream?: NodeJS.WritableStream;
}

/**
 * Stdio Request Format
 */
interface StdioRequest {
    /** Operation name (e.g., "chat:exportHistory") */
    operation: string;

    /** Request parameters */
    request: any;

    /** Optional request ID for tracking */
    requestId?: string;

    /** Optional auth token (overrides config) */
    authToken?: string;
}

/**
 * Stdio Transport Plan
 *
 * Exposes PlanRegistry operations via stdin/stdout.
 */
export class StdioTransportPlan extends TransportPlan {
    private config: Required<Omit<StdioTransportConfig, 'authToken' | 'getAuthContext'>> & {
        authToken?: string;
        getAuthContext?: () => Promise<AuthContext | null>;
    };

    private rl?: readline.Interface;
    private isRunning = false;
    private processedCount = 0;
    private errorCount = 0;

    constructor(registry: PlanRegistry) {
        super(registry, 'stdio-transport');
        this.config = {
            development: false,
            exitOnEnd: true,
            interactive: false,
            verbose: false,
            inputStream: process.stdin,
            outputStream: process.stdout,
            errorStream: process.stderr
        };
    }

    /**
     * Start stdio transport
     */
    async start(config?: StdioTransportConfig): Promise<void> {
        if (this.isRunning) {
            throw new Error('Stdio transport already started');
        }

        // Merge config
        this.config = { ...this.config, ...config };

        this.isRunning = true;
        this.processedCount = 0;
        this.errorCount = 0;

        // Log startup to stderr (don't pollute stdout)
        if (this.config.verbose) {
            this.log('[StdioTransport] Starting...');
        }

        // Show welcome message in interactive mode
        if (this.config.interactive) {
            this.log('LAMA CLI - Enter operations as JSON (one per line)');
            this.log('Format: {"operation":"name","request":{...}}');
            this.log('Type Ctrl+D to exit\n');
        }

        // Create readline interface
        this.rl = readline.createInterface({
            input: this.config.inputStream,
            output: this.config.interactive ? this.config.errorStream : undefined,
            terminal: this.config.interactive
        });

        // Process each line
        this.rl.on('line', async (line) => {
            await this.processLine(line);
        });

        // Handle end of input
        this.rl.on('close', () => {
            if (this.config.verbose) {
                this.log(
                    `[StdioTransport] Processed ${this.processedCount} operations (${this.errorCount} errors)`
                );
            }

            if (this.config.exitOnEnd) {
                process.exit(this.errorCount > 0 ? 1 : 0);
            }
        });
    }

    /**
     * Stop stdio transport
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        if (this.rl) {
            this.rl.close();
            this.rl = undefined;
        }

        this.isRunning = false;

        if (this.config.verbose) {
            this.log('[StdioTransport] Stopped');
        }
    }

    /**
     * Check if transport is running
     */
    isRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Extract auth context from stdio request
     */
    protected async extractAuthContext(request: StdioRequest): Promise<AuthContext | null> {
        // Use custom provider if provided
        if (this.config.getAuthContext) {
            return await this.config.getAuthContext();
        }

        // Use request-specific token if provided
        if (request.authToken) {
            return {
                userId: request.authToken, // Use token as userId in basic mode
                sessionId: `stdio-session-${Date.now()}`,
                capabilities: ['*']
            };
        }

        // Use config token if provided
        if (this.config.authToken) {
            return {
                userId: this.config.authToken,
                sessionId: `stdio-session-${Date.now()}`,
                capabilities: ['*']
            };
        }

        // Development mode - allow without auth
        if (this.config.development) {
            return {
                userId: 'cli-user',
                sessionId: `cli-session-${Date.now()}`,
                capabilities: ['*']
            };
        }

        return null;
    }

    /**
     * Process a single line of input
     */
    private async processLine(line: string): Promise<void> {
        // Skip empty lines
        if (!line.trim()) {
            return;
        }

        let stdioRequest: StdioRequest;

        // Parse JSON
        try {
            stdioRequest = JSON.parse(line);
        } catch (error) {
            this.writeError({
                success: false,
                error: {
                    code: 'INVALID_JSON',
                    message: 'Failed to parse JSON input',
                    details: {
                        input: line.substring(0, 100),
                        error: (error as Error).message
                    }
                }
            });
            this.errorCount++;
            return;
        }

        // Validate request format
        if (!stdioRequest.operation || typeof stdioRequest.operation !== 'string') {
            this.writeError({
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Missing or invalid "operation" field',
                    details: { received: stdioRequest }
                }
            });
            this.errorCount++;
            return;
        }

        if (!stdioRequest.request || typeof stdioRequest.request !== 'object') {
            this.writeError({
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Missing or invalid "request" field',
                    details: { received: stdioRequest }
                }
            });
            this.errorCount++;
            return;
        }

        // Extract auth context
        const authContext = await this.extractAuthContext(stdioRequest);
        if (!authContext && !this.config.development) {
            this.writeError({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                    details: { hint: 'Provide authToken in request or use --development flag' }
                },
                requestId: stdioRequest.requestId
            });
            this.errorCount++;
            return;
        }

        // Invoke operation
        try {
            const result = await this.invokeOperation(
                stdioRequest.operation,
                stdioRequest.request,
                authContext
            );

            // Write response
            this.writeResponse(result as OperationResponse<any>, stdioRequest.requestId);
            this.processedCount++;
        } catch (error) {
            this.writeError({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: (error as Error).message,
                    details: this.config.development
                        ? { stack: (error as Error).stack }
                        : undefined
                },
                requestId: stdioRequest.requestId
            });
            this.errorCount++;
        }
    }

    /**
     * Write response to stdout
     */
    private writeResponse(response: OperationResponse<any>, requestId?: string): void {
        const output = requestId ? { ...response, requestId } : response;
        this.config.outputStream.write(JSON.stringify(output) + '\n');
    }

    /**
     * Write error to stdout
     */
    private writeError(error: any): void {
        this.config.outputStream.write(JSON.stringify(error) + '\n');
    }

    /**
     * Log message to stderr
     */
    private log(message: string): void {
        this.config.errorStream.write(message + '\n');
    }

    /**
     * Get statistics
     */
    getStats(): { processed: number; errors: number } {
        return {
            processed: this.processedCount,
            errors: this.errorCount
        };
    }
}
