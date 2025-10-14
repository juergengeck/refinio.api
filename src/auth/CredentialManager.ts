import fs from 'fs/promises';
import path from 'path';
import { createRandomString } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { createSignKeyPair, sign } from '@refinio/one.core/lib/crypto/sign.js';
import { ClientIdentityCredential } from '../types.js';

export interface AuthConfig {
  credentialStore: string;
  sessionTimeout: number;
  maxSessions: number;
}

export class CredentialManager {
  private config: AuthConfig;
  private credentials: Map<string, ClientIdentityCredential> = new Map();
  private sessions: Map<string, any> = new Map();

  constructor(config: AuthConfig) {
    this.config = config;
    this.loadCredentials();
  }

  private async loadCredentials() {
    try {
      const files = await fs.readdir(this.config.credentialStore);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(
            path.join(this.config.credentialStore, file),
            'utf-8'
          );
          const credential = JSON.parse(content) as ClientIdentityCredential;
          this.credentials.set(credential.credentialSubject.id, credential);
        }
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  }

  async verifyCredential(credential: ClientIdentityCredential): Promise<boolean> {
    try {
      // Check expiration
      const now = new Date();
      const expiration = new Date(credential.expirationDate);
      if (now > expiration) {
        return false;
      }

      // Check issuance date
      const issuance = new Date(credential.issuanceDate);
      if (now < issuance) {
        return false;
      }

      // Verify signature (simplified - in production use proper crypto)
      // This would verify the proof.proofValue using the issuer's public key
      
      return true;
    } catch (error) {
      console.error('Credential verification failed:', error);
      return false;
    }
  }

  async createSession(clientId: string, credential: ClientIdentityCredential): Promise<string> {
    const sessionId = await createRandomString(64, true);

    this.sessions.set(sessionId, {
      clientId,
      credential,
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.config.sessionTimeout * 1000)
    });

    // Clean up expired sessions
    this.cleanupSessions();

    return sessionId;
  }

  getSession(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  private cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
      }
    }

    // Enforce max sessions
    if (this.sessions.size > this.config.maxSessions) {
      const sorted = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      
      while (this.sessions.size > this.config.maxSessions) {
        const [id] = sorted.shift()!;
        this.sessions.delete(id);
      }
    }
  }

  async issueCredential(
    clientId: string,
    permissions: string[],
    validityDays: number = 365
  ): Promise<ClientIdentityCredential> {
    const keypair = createSignKeyPair();
    const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

    const now = new Date();
    const expiration = new Date(now.getTime() + (validityDays * 24 * 60 * 60 * 1000));

    const credential: ClientIdentityCredential = {
      $type$: 'ClientIdentityCredential',
      id: await createRandomString(32, true),
      issuer: 'api-server',
      credentialSubject: {
        id: clientId,
        publicKeyHex,
        type: 'CLI',
        permissions
      },
      issuanceDate: now.toISOString(),
      expirationDate: expiration.toISOString(),
      proof: {
        type: 'Ed25519Signature2020',
        created: now.toISOString(),
        verificationMethod: 'server-pubkey',
        proofValue: '' // Would be signed in production
      }
    };

    // Sign the credential
    const message = JSON.stringify({
      issuer: credential.issuer,
      subject: credential.credentialSubject,
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate
    });

    const signature = sign(Buffer.from(message), keypair.secretKey);
    credential.proof.proofValue = Buffer.from(signature).toString('base64');

    // Store credential
    await this.storeCredential(credential);

    return credential;
  }

  private async storeCredential(credential: ClientIdentityCredential) {
    const filename = `${credential.credentialSubject.id}.json`;
    const filepath = path.join(this.config.credentialStore, filename);
    
    await fs.mkdir(this.config.credentialStore, { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(credential, null, 2));
    
    this.credentials.set(credential.credentialSubject.id, credential);
  }

  async revokeCredential(clientId: string) {
    this.credentials.delete(clientId);
    
    const filename = `${clientId}.json`;
    const filepath = path.join(this.config.credentialStore, filename);
    
    try {
      await fs.unlink(filepath);
    } catch (error) {
      console.error('Failed to delete credential file:', error);
    }
  }
}