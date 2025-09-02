import type { Person } from '@refinio/one.core/lib/recipes.js';
import { getInstanceIdHash, getInstanceOwnerIdHash, getInstanceOwnerEmail } from '@refinio/one.core/lib/instance.js';
import { getIdObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import crypto from 'crypto';

export interface AuthSession {
  personId: SHA256IdHash<Person>;
  person: Person;
  isOwner: boolean;
  permissions: string[];
  createdAt: number;
  sessionToken: string;
}

export interface AuthRequest {
  email?: string;
  challenge?: string;
  response?: string;
  sessionToken?: string;
}

export interface AuthChallenge {
  challenge: string;
  createdAt: number;
}

export class InstanceAuthManager {
  private sessions: Map<string, AuthSession> = new Map();
  private challenges: Map<string, AuthChallenge> = new Map();
  private readonly sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
  private readonly challengeTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clean up expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Generate a new authentication challenge
   */
  async generateChallenge(clientId: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');
    
    this.challenges.set(clientId, {
      challenge,
      createdAt: Date.now()
    });
    
    // Auto-cleanup after timeout
    setTimeout(() => {
      this.challenges.delete(clientId);
    }, this.challengeTimeout);
    
    return challenge;
  }

  /**
   * Verify a challenge response and create session
   */
  async verifyChallenge(clientId: string, response: string): Promise<AuthSession | null> {
    const challengeData = this.challenges.get(clientId);
    
    if (!challengeData) {
      return null;
    }
    
    // Check if challenge expired
    if (Date.now() - challengeData.createdAt > this.challengeTimeout) {
      this.challenges.delete(clientId);
      return null;
    }
    
    // For now, accept the instance owner as authenticated
    // In production, you would verify cryptographic signatures
    const ownerIdHash = getInstanceOwnerIdHash();
    const ownerEmail = getInstanceOwnerEmail();
    
    if (!ownerIdHash) {
      return null;
    }
    
    try {
      // Get the Person object for the instance owner
      const person = await getIdObject(ownerIdHash) as Person;
      
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      const session: AuthSession = {
        personId: ownerIdHash,
        person,
        isOwner: true,
        permissions: ['read', 'write', 'admin'],
        createdAt: Date.now(),
        sessionToken
      };
      
      this.sessions.set(sessionToken, session);
      this.challenges.delete(clientId);
      
      return session;
    } catch (error) {
      console.error('Failed to get person object:', error);
      return null;
    }
  }

  /**
   * Validate an existing session token
   */
  async validateSession(sessionToken: string): Promise<AuthSession | null> {
    const session = this.sessions.get(sessionToken);
    
    if (!session) {
      return null;
    }
    
    // Check if session expired
    if (Date.now() - session.createdAt > this.sessionTimeout) {
      this.sessions.delete(sessionToken);
      return null;
    }
    
    return session;
  }

  /**
   * Check if a person has specific permission
   */
  hasPermission(session: AuthSession, permission: string): boolean {
    return session.permissions.includes(permission) || session.permissions.includes('admin');
  }

  /**
   * Check if a person is the instance owner
   */
  isInstanceOwner(session: AuthSession): boolean {
    return session.isOwner;
  }

  /**
   * Revoke a session
   */
  revokeSession(sessionToken: string): void {
    this.sessions.delete(sessionToken);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    
    for (const [token, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.sessionTimeout) {
        this.sessions.delete(token);
      }
    }
  }

  /**
   * Get all active sessions (for admin purposes)
   */
  getActiveSessions(): AuthSession[] {
    return Array.from(this.sessions.values());
  }
}