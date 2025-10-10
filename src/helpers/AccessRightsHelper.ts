/**
 * Access Rights Helper - Grant access to objects and channels after pairing
 * Based on one.leute.replicant/src/AccessRightsManager.ts
 */

import { createAccess } from '@refinio/one.core/lib/access.js';
import { SET_ACCESS_MODE } from '@refinio/one.core/lib/storage-base-common.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Grant access rights to a remote person after pairing
 * This creates data to share which triggers CHUM connections
 *
 * @param targetPersonId - The person ID to grant access to
 * @param leuteModel - LeuteModel instance
 * @param channelManager - ChannelManager instance (optional)
 */
export async function grantAccessRightsAfterPairing(
    targetPersonId: SHA256IdHash<any>,
    leuteModel: LeuteModel,
    channelManager?: ChannelManager
): Promise<void> {
    console.log(`[AccessRights] Granting access rights to: ${targetPersonId.toString().substring(0, 8)}...`);

    // 1. Create and grant access to a contacts channel (CRITICAL for CHUM)
    if (channelManager) {
        try {
            const me = await leuteModel.me();
            const mainId = await me.mainIdentity();

            // Create the contacts channel if it doesn't exist
            await channelManager.createChannel('contacts');
            console.log('[AccessRights] Created/verified contacts channel');

            // Grant access to the ChannelInfo object
            const channelInfoId = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: 'contacts',
                owner: mainId
            });

            await createAccess([{
                id: channelInfoId,
                person: [targetPersonId],
                group: [],
                mode: SET_ACCESS_MODE.ADD
            }]);

            console.log('[AccessRights] ✅ Granted access to contacts channel');
        } catch (error) {
            console.warn('[AccessRights] Failed to grant channel access:', (error as Error).message);
        }
    }

    // 2. Grant access to all Someone objects (contacts)
    try {
        const others = await leuteModel.others();
        console.log(`[AccessRights] Granting access to ${others.length} Someone objects...`);

        for (const someone of others) {
            if (someone && someone.idHash) {
                await createAccess([{
                    object: someone.idHash as unknown as SHA256Hash,
                    person: [targetPersonId],
                    group: [],
                    mode: SET_ACCESS_MODE.ADD
                }]);
            }
        }

        console.log('[AccessRights] ✅ Granted access to Someone objects');
    } catch (error) {
        console.warn('[AccessRights] Failed to grant Someone access:', (error as Error).message);
    }

    // 3. Grant access to our MAIN profile only (not all profiles!)
    try {
        const me = await leuteModel.me();
        const mainProfile = await me.mainProfile();

        if (mainProfile && mainProfile.idHash) {
            await createAccess([{
                object: mainProfile.idHash as unknown as SHA256Hash,
                person: [targetPersonId],
                group: [],
                mode: SET_ACCESS_MODE.ADD
            }]);
            console.log('[AccessRights] ✅ Granted access to main Profile object');
        }
    } catch (error) {
        console.warn('[AccessRights] Failed to grant Profile access:', (error as Error).message);
    }

    console.log('[AccessRights] ✅ Access rights granted - data available for CHUM sync');
}
