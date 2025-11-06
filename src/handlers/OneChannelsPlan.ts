/**
 * ONE Channels Plan
 *
 * Platform-agnostic handler for ONE.models Channel operations.
 * Exposes channel management and communication.
 */

import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { OneVersionedObjectTypes } from '@refinio/one.core/lib/recipes.js';

/**
 * ONE Channels Plan
 *
 * Universal channel operations
 */
export class OneChannelsPlan {
  constructor(private channelManager: ChannelManager) {}

  /**
   * Create a channel
   */
  async createChannel(params: {
    id: string;
    owner?: SHA256IdHash<any>;
    accessGroup?: SHA256IdHash<any>;
  }) {
    return await this.channelManager.createChannel(
      params.id,
      params.owner,
      params.accessGroup
    );
  }

  /**
   * Post object to channel
   */
  async postToChannel(channelId: string, obj: OneVersionedObjectTypes) {
    await this.channelManager.postToChannel(channelId, obj);
    return { success: true, channelId };
  }

  /**
   * Get channel info
   */
  async getChannel(channelId: string) {
    return await this.channelManager.getChannelInfo(channelId);
  }

  /**
   * List all channels
   */
  async listChannels() {
    return await this.channelManager.getAllChannelInfos();
  }

  /**
   * Get matching channel infos
   */
  async getMatchingChannels(channelId: string) {
    return await this.channelManager.getMatchingChannelInfos(channelId);
  }

  /**
   * Delete channel
   */
  async deleteChannel(channelId: string, owner?: SHA256IdHash<any>) {
    await this.channelManager.deleteChannel(channelId, owner);
    return { success: true, channelId };
  }
}
