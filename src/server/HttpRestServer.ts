import http from 'http';
import { ConnectionHandler } from '../handlers/ConnectionHandler.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';

/**
 * HTTP REST API Server for refinio.api
 * Provides REST endpoints for connection management, contacts, etc.
 * Later will be wrapped with QUICVC for secure transport
 */
export class HttpRestServer {
  private server: http.Server | null = null;
  private connectionHandler: ConnectionHandler;
  private leuteModel: LeuteModel;
  private port: number;

  constructor(connectionHandler: ConnectionHandler, leuteModel: LeuteModel, port: number) {
    this.connectionHandler = connectionHandler;
    this.leuteModel = leuteModel;
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        try {
          await this.handleRequest(req, res);
        } catch (error: any) {
          console.error('Request handling error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      this.server.listen(this.port, () => {
        console.log(`HTTP REST API listening on port ${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('HTTP REST API stopped');
          resolve();
        });
      });
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    console.log(`${method} ${url}`);

    // Health check
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // POST /api/connections/invite - Accept invitation and establish connection
    if (url === '/api/connections/invite' && method === 'POST') {
      console.log('[HttpRestServer] Received POST /api/connections/invite');
      const body = await this.readBody(req);
      console.log('[HttpRestServer] Request body:', body);
      const data = JSON.parse(body);
      console.log('[HttpRestServer] Parsed JSON:', JSON.stringify(data, null, 2));

      // Parse invitation from URL or direct data
      let inviteData;
      if (data.inviteUrl) {
        const hashPart = data.inviteUrl.split('#')[1];
        const decoded = decodeURIComponent(hashPart);
        inviteData = JSON.parse(decoded);
        console.log('[HttpRestServer] Parsed invite from URL:', JSON.stringify(inviteData, null, 2));
      } else if (data.invitation) {
        inviteData = data.invitation;
        console.log('[HttpRestServer] Using direct invitation data:', JSON.stringify(inviteData, null, 2));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing inviteUrl or invitation' }));
        return;
      }

      console.log('[HttpRestServer] Calling connectionHandler.connectWithInvite...');
      const result = await this.connectionHandler.connectWithInvite(inviteData);
      console.log('[HttpRestServer] Result:', JSON.stringify(result, null, 2));

      if (result.success && result.connectionInfo) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          personId: result.connectionInfo.personId,
          instanceId: result.connectionInfo.remoteInstanceId,
          connectionId: result.connectionInfo.remoteInstanceId,
          contactCreated: result.connectionInfo.contactCreated
        }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.error || 'Connection failed' }));
      }
      return;
    }

    // GET /api/connections - List active connections
    if (url === '/api/connections' && method === 'GET') {
      const result = await this.connectionHandler.listConnections();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.connections || []));
      return;
    }

    // GET /api/contacts - List contacts
    if (url === '/api/contacts' && method === 'GET') {
      const contacts = await this.leuteModel.others();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contacts.map((c: any) => ({
        someoneId: c.someoneId,
        mainProfile: c.mainProfile,
        identities: c.identities ? (c.identities instanceof Map ? Array.from(c.identities.entries()) : c.identities) : []
      }))));
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }
}
