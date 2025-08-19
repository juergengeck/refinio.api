import { Instance, Person } from '@refinio/one.core';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import crypto from 'crypto';

export interface AuthSession {
  personId: SHA256IdHash;
  person: Person;
  isOwner: boolean;
  permissions: string[];
  createdAt: number;
  expiresAt: number;
  nonce?: string;
}

/**
 * Authentication manager that uses Instance ownership model.
 * The Instance owner is the admin and has full permissions.
 * Other users authenticate with their Person credentials.
 */
export class InstanceAuthManager {
  private instance: Instance;
  private sessions: Map<string, AuthSession> = new Map();
  private pendingChallenges: Map<string, string> = new Map();

  constructor(instance: Instance) {
    this.instance = instance;
  }

  /**
   * Generate a challenge for authentication
   */
  async generateChallenge(clientId: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');
    this.pendingChallenges.set(clientId, challenge);
    
    // Clean up old challenge after 5 minutes
    setTimeout(() => {
      this.pendingChallenges.delete(clientId);
    }, 5 * 60 * 1000);
    
    return challenge;
  }

  /**
   * Verify authentication using Person's signature
   * The Person who created the Instance is the owner/admin
   */
  async verifyAuthentication(
    clientId: string,
    personId: SHA256IdHash,
    signedChallenge: string,
    publicKey: string
  ): Promise<AuthSession | null> {
    const challenge = this.pendingChallenges.get(clientId);
    
    if (!challenge) {
      console.error('No pending challenge for client:', clientId);
      return null;
    }

    try {
      // Get the Person object
      const person = await this.instance.getObject(personId) as Person;
      
      if (!person || person.$type$ !== 'Person') {
        console.error('Invalid Person object');
        return null;
      }

      // Verify the signature using the Person's public key
      // In production, use proper crypto verification
      const isValid = this.verifySignature(challenge, signedChallenge, publicKey);
      
      if (!isValid) {
        console.error('Invalid signature');
        return null;
      }

      // Check if this Person is the Instance owner
      const isOwner = person.id === this.instance.owner.id;

      // Create session
      const session: AuthSession = {
        personId: person.id,
        person,
        isOwner,
        permissions: isOwner 
          ? ['read', 'write', 'delete', 'admin'] 
          : ['read'], // Non-owners get read-only by default
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };

      // Store session
      const sessionId = crypto.randomBytes(32).toString('hex');
      this.sessions.set(sessionId, session);

      // Clean up challenge
      this.pendingChallenges.delete(clientId);

      return session;
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  /**
   * Verify a signature (simplified - use proper crypto in production)
   */
  private verifySignature(
    message: string,
    signature: string,
    publicKey: string
  ): boolean {
    // In production, use proper Ed25519 signature verification
    // For now, simplified check
    const expectedSignature = crypto
      .createHash('sha256')
      .update(message + publicKey)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AuthSession | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Check if a Person has permission for an operation
   */
  hasPermission(
    session: AuthSession,
    operation: 'read' | 'write' | 'delete' | 'admin'
  ): boolean {
    return session.permissions.includes(operation);
  }

  /**
   * Grant permissions to a Person (only Instance owner can do this)
   */
  async grantPermissions(
    grantorSession: AuthSession,
    targetPersonId: SHA256IdHash,
    permissions: string[]
  ): Promise<boolean> {
    if (!grantorSession.isOwner) {
      console.error('Only Instance owner can grant permissions');
      return false;
    }

    // In a real implementation, store these permissions persistently
    // For now, find any active sessions for this person and update them
    for (const [id, session] of this.sessions.entries()) {
      if (session.personId === targetPersonId) {
        session.permissions = [...new Set([...session.permissions, ...permissions])];
      }
    }

    return true;
  }

  /**
   * Revoke permissions from a Person (only Instance owner can do this)
   */
  async revokePermissions(
    revokerSession: AuthSession,
    targetPersonId: SHA256IdHash,
    permissions: string[]
  ): Promise<boolean> {
    if (!revokerSession.isOwner) {
      console.error('Only Instance owner can revoke permissions');
      return false;
    }

    // Update active sessions
    for (const [id, session] of this.sessions.entries()) {
      if (session.personId === targetPersonId) {
        session.permissions = session.permissions.filter(
          p => !permissions.includes(p)
        );
      }
    }

    return true;
  }

  /**
   * Clean up expired sessions
   */
  cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
      }
    }
  }
}