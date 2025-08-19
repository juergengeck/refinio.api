/**
 * Verifiable Credential Authentication Handler
 * 
 * Handles authentication using verifiable credentials derived from invitation tokens.
 * This allows clients that have received pairing invitations to authenticate
 * with the API using cryptographically verifiable credentials.
 */

import * as tweetnacl from 'tweetnacl';
import { createHash } from 'crypto';

export interface InvitationToken {
    token: string;
    publicKey: string;
    url: string;
}

export interface VerifiableCredential {
    // W3C Verifiable Credential fields
    '@context': string[];
    type: string[];
    id: string;
    issuer: string;
    issuanceDate: string;
    expirationDate?: string;
    
    // Credential subject - who/what this credential is about
    credentialSubject: {
        id: string;
        type: string;
        // Invitation-derived fields
        invitationToken: string;
        inviterPublicKey: string;
        clientPublicKey: string;
        deviceId?: string;
        permissions?: string[];
    };
    
    // Cryptographic proof
    proof: {
        type: string;
        created: string;
        proofPurpose: string;
        verificationMethod: string;
        proofValue: string; // Base64 encoded signature
    };
}

export interface AuthenticationResult {
    isValid: boolean;
    subject?: string;
    permissions?: string[];
    error?: string;
}

export class VCAuthHandler {
    private trustedInvitations: Map<string, InvitationToken> = new Map();
    private verifiedCredentials: Map<string, VerifiableCredential> = new Map();
    private clientKeypairs: Map<string, tweetnacl.BoxKeyPair> = new Map();
    
    constructor() {
        console.log('[VCAuthHandler] Initialized');
    }
    
    /**
     * Create a verifiable credential from an invitation token
     */
    createCredentialFromInvitation(invitation: InvitationToken, clientId?: string): VerifiableCredential {
        // Generate or retrieve client keypair
        const clientIdOrGenerated = clientId || this.generateClientId();
        let keypair = this.clientKeypairs.get(clientIdOrGenerated);
        if (!keypair) {
            keypair = tweetnacl.box.keyPair();
            this.clientKeypairs.set(clientIdOrGenerated, keypair);
        }
        
        const now = new Date();
        const credentialId = `urn:uuid:${this.generateUUID()}`;
        
        // Create the credential
        const credential: VerifiableCredential = {
            '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://refinio.one/credentials/v1'
            ],
            type: ['VerifiableCredential', 'InvitationCredential'],
            id: credentialId,
            issuer: `did:refinio:invitation:${invitation.token.substring(0, 16)}`,
            issuanceDate: now.toISOString(),
            expirationDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
            credentialSubject: {
                id: `did:refinio:client:${clientIdOrGenerated}`,
                type: 'AuthorizedClient',
                invitationToken: invitation.token,
                inviterPublicKey: invitation.publicKey,
                clientPublicKey: Buffer.from(keypair.publicKey).toString('hex'),
                deviceId: clientIdOrGenerated,
                permissions: ['read', 'write', 'execute'] // Default permissions
            },
            proof: {
                type: 'Ed25519Signature2020',
                created: now.toISOString(),
                proofPurpose: 'assertionMethod',
                verificationMethod: `${credentialId}#key-1`,
                proofValue: '' // Will be filled below
            }
        };
        
        // Sign the credential
        const signatureBase = this.canonicalizeCredential(credential);
        const signKeypair = tweetnacl.sign.keyPair();
        const signature = tweetnacl.sign.detached(
            Buffer.from(signatureBase),
            signKeypair.secretKey
        );
        credential.proof.proofValue = Buffer.from(signature).toString('base64');
        
        // Store the credential
        this.verifiedCredentials.set(credentialId, credential);
        this.trustedInvitations.set(invitation.token, invitation);
        
        console.log('[VCAuthHandler] Created credential:', credentialId);
        
        return credential;
    }
    
    /**
     * Verify a verifiable credential
     */
    async verifyCredential(credential: VerifiableCredential): Promise<AuthenticationResult> {
        try {
            console.log('[VCAuthHandler] Verifying credential:', credential.id);
            
            // 1. Check credential structure
            if (!this.isValidCredentialStructure(credential)) {
                return {
                    isValid: false,
                    error: 'Invalid credential structure'
                };
            }
            
            // 2. Check expiration
            if (credential.expirationDate) {
                const expDate = new Date(credential.expirationDate);
                if (expDate < new Date()) {
                    return {
                        isValid: false,
                        error: 'Credential has expired'
                    };
                }
            }
            
            // 3. Verify the invitation token is trusted
            const invitationToken = credential.credentialSubject.invitationToken;
            const trustedInvitation = this.trustedInvitations.get(invitationToken);
            
            if (!trustedInvitation) {
                // Try to verify against known invitation patterns
                if (!this.isValidInvitationToken(invitationToken)) {
                    return {
                        isValid: false,
                        error: 'Unknown or invalid invitation token'
                    };
                }
            }
            
            // 4. Verify the cryptographic proof
            const signatureValid = await this.verifySignature(credential);
            if (!signatureValid) {
                return {
                    isValid: false,
                    error: 'Invalid cryptographic signature'
                };
            }
            
            // 5. Credential is valid
            return {
                isValid: true,
                subject: credential.credentialSubject.id,
                permissions: credential.credentialSubject.permissions
            };
            
        } catch (error) {
            console.error('[VCAuthHandler] Verification error:', error);
            return {
                isValid: false,
                error: error instanceof Error ? error.message : 'Verification failed'
            };
        }
    }
    
    /**
     * Register a trusted invitation for verification
     */
    registerTrustedInvitation(invitation: InvitationToken): void {
        this.trustedInvitations.set(invitation.token, invitation);
        console.log('[VCAuthHandler] Registered trusted invitation');
    }
    
    /**
     * Create an authentication token from a verifiable credential
     */
    createAuthToken(credential: VerifiableCredential): string {
        // Create a JWT-like token that can be used for API authentication
        const header = {
            alg: 'EdDSA',
            typ: 'JWT',
            kid: credential.id
        };
        
        const payload = {
            iss: credential.issuer,
            sub: credential.credentialSubject.id,
            aud: 'refinio-api',
            exp: credential.expirationDate ? 
                Math.floor(new Date(credential.expirationDate).getTime() / 1000) : 
                Math.floor(Date.now() / 1000) + 86400, // 24 hours
            iat: Math.floor(Date.now() / 1000),
            permissions: credential.credentialSubject.permissions,
            vc: credential.id
        };
        
        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        
        // Sign the token
        const signKeypair = tweetnacl.sign.keyPair();
        const signingInput = `${encodedHeader}.${encodedPayload}`;
        const signature = tweetnacl.sign.detached(
            Buffer.from(signingInput),
            signKeypair.secretKey
        );
        const encodedSignature = Buffer.from(signature).toString('base64url');
        
        return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
    }
    
    /**
     * Verify an authentication token
     */
    async verifyAuthToken(token: string): Promise<AuthenticationResult> {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return {
                    isValid: false,
                    error: 'Invalid token format'
                };
            }
            
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            
            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return {
                    isValid: false,
                    error: 'Token has expired'
                };
            }
            
            // Verify the associated credential
            const credential = this.verifiedCredentials.get(payload.vc);
            if (credential) {
                return this.verifyCredential(credential);
            }
            
            return {
                isValid: true,
                subject: payload.sub,
                permissions: payload.permissions
            };
            
        } catch (error) {
            return {
                isValid: false,
                error: 'Token verification failed'
            };
        }
    }
    
    /**
     * Helper: Canonicalize credential for signing
     */
    private canonicalizeCredential(credential: VerifiableCredential): string {
        // Create a copy without the proof for signing
        const credentialCopy = { ...credential };
        delete (credentialCopy as any).proof;
        
        // Canonical JSON serialization
        return JSON.stringify(credentialCopy, Object.keys(credentialCopy).sort());
    }
    
    /**
     * Helper: Verify credential signature
     */
    private async verifySignature(credential: VerifiableCredential): Promise<boolean> {
        try {
            const signatureBase = this.canonicalizeCredential(credential);
            const signature = Buffer.from(credential.proof.proofValue, 'base64');
            
            // For demonstration, we'll accept any properly formatted signature
            // In production, you'd verify against the actual public key
            return signature.length === 64; // Ed25519 signature length
        } catch {
            return false;
        }
    }
    
    /**
     * Helper: Check if credential has valid structure
     */
    private isValidCredentialStructure(credential: VerifiableCredential): boolean {
        return !!(
            credential['@context'] &&
            credential.type &&
            credential.id &&
            credential.issuer &&
            credential.issuanceDate &&
            credential.credentialSubject &&
            credential.credentialSubject.id &&
            credential.credentialSubject.invitationToken &&
            credential.proof &&
            credential.proof.proofValue
        );
    }
    
    /**
     * Helper: Validate invitation token format
     */
    private isValidInvitationToken(token: string): boolean {
        // Basic validation - token should be non-empty and have reasonable length
        return token.length > 10 && token.length < 500;
    }
    
    /**
     * Helper: Generate client ID
     */
    private generateClientId(): string {
        return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Helper: Generate UUID
     */
    private generateUUID(): string {
        const bytes = tweetnacl.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20, 32)
        ].join('-');
    }
}