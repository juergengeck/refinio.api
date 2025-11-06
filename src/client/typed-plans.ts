/**
 * Typed Plan Interfaces
 *
 * TypeScript interfaces for type-safe client usage
 */

import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { OneVersionedObjectTypes } from '@refinio/one.core/lib/recipes.js';

/**
 * ONE Storage Plan Interface
 */
export interface IOneStoragePlan {
  storeVersionedObject(obj: OneVersionedObjectTypes): Promise<{
    hash: SHA256Hash<any>;
    idHash: SHA256IdHash<any>;
    versionHash: SHA256Hash<any>;
  }>;

  getObjectByIdHash(idHash: SHA256IdHash<any>): Promise<{
    obj: OneVersionedObjectTypes;
    idHash: SHA256IdHash<any>;
    hash: SHA256Hash<any>;
  }>;

  getVersionedObjectByHash(hash: SHA256Hash<any>): Promise<OneVersionedObjectTypes>;

  storeUnversionedObject(obj: any): Promise<{
    hash: SHA256Hash<any>;
  }>;

  getUnversionedObject(hash: SHA256Hash<any>): Promise<any>;

  storeBlob(arrayBuffer: ArrayBuffer): Promise<{
    hash: SHA256Hash<'BLOB'>;
    status: 'new' | 'exists';
  }>;

  readBlob(hash: SHA256Hash<'BLOB'>): Promise<ArrayBuffer>;
}

/**
 * ONE Leute Plan Interface
 */
export interface IOneLeutePlan {
  getOwnIdentity(): Promise<any>;
  getContacts(): Promise<any[]>;
  getContact(personIdHash: SHA256IdHash<any>): Promise<any>;
  createContact(params: {
    email?: string;
    name?: string;
    personIdHash?: SHA256IdHash<any>;
  }): Promise<any>;
  updateContact(
    personIdHash: SHA256IdHash<any>,
    updates: { name?: string; email?: string }
  ): Promise<any>;
  getGroups(): Promise<any[]>;
  createGroup(params: { name: string; members: SHA256IdHash<any>[] }): Promise<any>;
  addGroupMember(
    groupIdHash: SHA256IdHash<any>,
    personIdHash: SHA256IdHash<any>
  ): Promise<any>;
  removeGroupMember(
    groupIdHash: SHA256IdHash<any>,
    personIdHash: SHA256IdHash<any>
  ): Promise<any>;
}

/**
 * ONE Channels Plan Interface
 */
export interface IOneChannelsPlan {
  createChannel(params: {
    id: string;
    owner?: SHA256IdHash<any>;
    accessGroup?: SHA256IdHash<any>;
  }): Promise<any>;
  postToChannel(channelId: string, obj: OneVersionedObjectTypes): Promise<{
    success: boolean;
    channelId: string;
  }>;
  getChannel(channelId: string): Promise<any>;
  listChannels(): Promise<any[]>;
  getMatchingChannels(channelId: string): Promise<any[]>;
  deleteChannel(channelId: string, owner?: SHA256IdHash<any>): Promise<{
    success: boolean;
    channelId: string;
  }>;
}

/**
 * ONE Crypto Plan Interface
 */
export interface IOneCryptoPlan {
  sign(params: { data: string | Uint8Array; keyId: SHA256Hash<any> }): Promise<{
    signature: Uint8Array;
  }>;
  verify(params: {
    data: string | Uint8Array;
    signature: Uint8Array;
    publicKeyHash: SHA256Hash<any>;
  }): Promise<{ valid: boolean }>;
  encrypt(params: {
    data: string | Uint8Array;
    recipientKeys: SHA256Hash<any>[];
  }): Promise<{ encrypted: Uint8Array }>;
  decrypt(params: {
    encrypted: Uint8Array;
    keyId: SHA256Hash<any>;
  }): Promise<{ decrypted: Uint8Array }>;
  hash(data: string | Uint8Array): Promise<{ hash: SHA256Hash<any> }>;
}

/**
 * ONE Instance Plan Interface
 */
export interface IOneInstancePlan {
  getInstanceId(): Promise<{ idHash: SHA256IdHash<any> | null }>;
  getOwner(): Promise<{ owner: any }>;
  getInfo(): Promise<{
    idHash: SHA256IdHash<any> | null;
    owner: any;
    initialized: boolean;
  }>;
}

/**
 * LAMA Memory Plan Interface
 */
export interface ILamaMemoryPlan {
  createSubject(params: {
    id: string;
    name: string;
    description?: string;
    metadata?: Map<string, string>;
    sign?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  }): Promise<{
    hash: string;
    idHash: string;
    filePath: string;
  }>;

  getSubject(
    idHash: SHA256IdHash<any>,
    options?: { verifySignature?: boolean }
  ): Promise<any | null>;

  updateSubject(
    idHash: SHA256IdHash<any>,
    updates: {
      name?: string;
      description?: string;
      metadata?: Map<string, string>;
      sign?: boolean;
      theme?: 'light' | 'dark' | 'auto';
    }
  ): Promise<{
    hash: string;
    idHash: string;
    filePath: string;
  }>;

  deleteSubject(idHash: SHA256IdHash<any>): Promise<boolean>;

  listSubjects(): Promise<SHA256IdHash<any>[]>;

  getSubjectHtml(idHash: SHA256IdHash<any>): Promise<string | null>;
}

/**
 * LAMA Chat Memory Plan Interface
 */
export interface ILamaChatMemoryPlan {
  enableMemories(
    topicId: string,
    autoExtract?: boolean,
    keywords?: string[]
  ): Promise<any>;

  disableMemories(topicId: string): Promise<void>;

  toggleMemories(topicId: string): Promise<boolean>;

  extractSubjects(params: { topicId: string; limit?: number }): Promise<any>;

  findRelatedMemories(
    topicId: string,
    keywords: string[],
    limit?: number
  ): Promise<any>;

  getMemoryStatus(topicId: string): Promise<any>;
}
