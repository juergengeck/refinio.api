/**
 * ONE Instance Plan
 *
 * Platform-agnostic handler for ONE.core instance management.
 * Exposes instance lifecycle and configuration.
 */

import {
  getInstanceIdHash,
  getInstanceOwner
} from '@refinio/one.core/lib/instance.js';

/**
 * ONE Instance Plan
 *
 * Universal instance operations
 */
export class OneInstancePlan {
  /**
   * Get instance ID hash
   */
  async getInstanceId() {
    const idHash = getInstanceIdHash();
    return { idHash };
  }

  /**
   * Get instance owner
   */
  async getOwner() {
    const owner = await getInstanceOwner();
    return { owner };
  }

  /**
   * Get instance info
   */
  async getInfo() {
    const idHash = getInstanceIdHash();
    const owner = await getInstanceOwner();
    return {
      idHash,
      owner,
      initialized: idHash !== null
    };
  }
}
