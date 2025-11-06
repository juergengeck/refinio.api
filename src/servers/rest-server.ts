/**
 * REST Server
 *
 * Exposes handler registry through REST API.
 * Uses Express for HTTP handling.
 *
 * Usage:
 *   const server = new RestServer(registry, { port: 3000 });
 *   await server.start();
 */

import express from 'express';
import type { HandlerRegistry } from '../registry/HandlerRegistry.js';
import { RestTransport } from '../transports/RestTransport.js';

export interface RestServerConfig {
  port: number;
  host?: string;
  cors?: boolean;
}

/**
 * REST Server
 *
 * HTTP API server using Express
 */
export class RestServer {
  private app: express.Application;
  private restTransport: RestTransport;
  private server: any;

  constructor(
    private registry: HandlerRegistry,
    private config: RestServerConfig
  ) {
    this.app = express();
    this.restTransport = new RestTransport(registry);
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware() {
    // JSON body parser
    this.app.use(express.json());

    // CORS if enabled
    if (this.config.cors) {
      this.app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
      });
    }
  }

  /**
   * Setup Express routes
   */
  private setupRoutes() {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', handlers: this.registry.listHandlers() });
    });

    // OpenAPI schema
    this.app.get('/openapi.json', (_req, res) => {
      res.json(this.restTransport.getOpenApiSchema());
    });

    // List endpoints
    this.app.get('/api', (_req, res) => {
      res.json(this.restTransport.getEndpoints());
    });

    // Handler method endpoint
    this.app.post('/api/:handler/:method', async (req, res) => {
      const response = await this.restTransport.handleRequest({
        handler: req.params.handler,
        method: req.params.method,
        body: req.body,
        headers: req.headers as Record<string, string>
      });

      res.status(response.statusCode).json(response.body);
    });
  }

  /**
   * Start the REST server
   */
  async start(): Promise<void> {
    return new Promise(resolve => {
      this.server = this.app.listen(this.config.port, this.config.host || '0.0.0.0', () => {
        console.log(`REST Server listening on ${this.config.host || '0.0.0.0'}:${this.config.port}`);
        console.log(`OpenAPI schema: http://localhost:${this.config.port}/openapi.json`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: Error) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
