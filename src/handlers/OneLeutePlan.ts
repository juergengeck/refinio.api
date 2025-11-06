/**
 * ONE Leute Plan
 *
 * Platform-agnostic Plan for ONE.models Leute operations.
 * Exposes identity, contact, and group management.
 */

import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * ONE Leute Plan
 *
 * Universal identity and contact operations
 */
export class OneLeutePlan {
  constructor(private leuteModel: LeuteModel) {}

  /**
   * Get own identity
   */
  async getOwnIdentity() {
    return await this.leuteModel.getMe();
  }

  /**
   * Get all contacts
   */
  async getContacts() {
    return await this.leuteModel.getContacts();
  }

  /**
   * Get contact by person ID
   */
  async getContact(personIdHash: SHA256IdHash<any>) {
    return await this.leuteModel.getContact(personIdHash);
  }

  /**
   * Create a new contact (Someone)
   */
  async createContact(params: {
    email?: string;
    name?: string;
    personIdHash?: SHA256IdHash<any>;
  }) {
    return await this.leuteModel.createSomeone(params);
  }

  /**
   * Update contact
   */
  async updateContact(
    personIdHash: SHA256IdHash<any>,
    updates: { name?: string; email?: string }
  ) {
    return await this.leuteModel.updateSomeone(personIdHash, updates);
  }

  /**
   * Get all groups
   */
  async getGroups() {
    return await this.leuteModel.getGroups();
  }

  /**
   * Create a group
   */
  async createGroup(params: { name: string; members: SHA256IdHash<any>[] }) {
    return await this.leuteModel.createGroup(params.name, params.members);
  }

  /**
   * Add member to group
   */
  async addGroupMember(
    groupIdHash: SHA256IdHash<any>,
    personIdHash: SHA256IdHash<any>
  ) {
    return await this.leuteModel.addGroupMember(groupIdHash, personIdHash);
  }

  /**
   * Remove member from group
   */
  async removeGroupMember(
    groupIdHash: SHA256IdHash<any>,
    personIdHash: SHA256IdHash<any>
  ) {
    return await this.leuteModel.removeGroupMember(groupIdHash, personIdHash);
  }
}
