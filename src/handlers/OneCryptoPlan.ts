/**
 * ONE Crypto Plan
 *
 * Platform-agnostic handler for ONE.core cryptographic operations.
 * Exposes signing, verification, encryption, decryption.
 */

import {
  sign,
  verify,
  encrypt,
  decrypt
} from '@refinio/one.core/lib/crypto.js';
import { hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * ONE Crypto Plan
 *
 * Universal cryptographic operations
 */
export class OneCryptoPlan {
  /**
   * Sign data
   */
  async sign(params: { data: string | Uint8Array; keyId: SHA256Hash<any> }) {
    const signature = await sign(params.data, params.keyId);
    return { signature };
  }

  /**
   * Verify signature
   */
  async verify(params: {
    data: string | Uint8Array;
    signature: Uint8Array;
    publicKeyHash: SHA256Hash<any>;
  }) {
    const valid = await verify(
      params.data,
      params.signature,
      params.publicKeyHash
    );
    return { valid };
  }

  /**
   * Encrypt data
   */
  async encrypt(params: {
    data: string | Uint8Array;
    recipientKeys: SHA256Hash<any>[];
  }) {
    const encrypted = await encrypt(params.data, params.recipientKeys);
    return { encrypted };
  }

  /**
   * Decrypt data
   */
  async decrypt(params: {
    encrypted: Uint8Array;
    keyId: SHA256Hash<any>;
  }) {
    const decrypted = await decrypt(params.encrypted, params.keyId);
    return { decrypted };
  }

  /**
   * Calculate hash
   */
  async hash(data: string | Uint8Array) {
    const hashValue = await hash(data);
    return { hash: hashValue };
  }
}
