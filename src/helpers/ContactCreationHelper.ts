/**
 * Contact creation helper using ONE.models APIs
 * Based on reference/lama.electron/main/core/contact-creation-proper.js
 */

import ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { ensureIdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { getObjectByIdHash, storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

export interface ProfileOptions {
    displayName?: string;
    descriptors?: Array<{
        $type$: string;
        [key: string]: any;
    }>;
}

/**
 * Creates a Profile and Someone object for an existing Person
 *
 * @param personId - The Person ID to create objects for
 * @param leuteModel - The initialized LeuteModel instance
 * @param profileOptions - Options for the profile (displayName, descriptors, etc.)
 * @returns The newly created Someone object
 */
export async function createProfileAndSomeoneForPerson(
    personId: string | SHA256IdHash<any>,
    leuteModel: LeuteModel,
    profileOptions: ProfileOptions = {}
): Promise<any> {
    console.log(`[ContactCreation] Creating new contact for Person ${personId.toString().substring(0, 8)}...`);

    try {
        // 1. Create Profile using proper ProfileModel API
        console.log('[ContactCreation]   ├─ Creating Profile object...');
        const profile = await ProfileModel.constructWithNewProfile(
            ensureIdHash(personId),
            await leuteModel.myMainIdentity(),
            'default',
            [], // communicationEndpoints - empty array
            []  // personDescriptions - will add after creation
        );

        // Add display name if provided
        if (profileOptions.displayName) {
            console.log(`[ContactCreation] Adding display name: ${profileOptions.displayName}`);
            (profile.personDescriptions as any).push({
                $type$: 'PersonName',
                name: profileOptions.displayName
            });
        }

        // Add any other descriptors if provided
        if (profileOptions.descriptors && Array.isArray(profileOptions.descriptors)) {
            profileOptions.descriptors.forEach(descriptor => {
                (profile.personDescriptions as any).push(descriptor);
            });
        }

        await profile.saveAndLoad();
        const profileHash = profile.idHash;
        console.log(`[ContactCreation]   ├─ Profile saved: ${profileHash.toString().substring(0, 8)}`);

        // 2. Create Someone object properly
        console.log('[ContactCreation]   ├─ Creating Someone object...');
        const newSomeone = {
            $type$: 'Someone' as const,
            someoneId: personId,
            mainProfile: profileHash,
            identities: new Map([[personId.toString(), new Set([profileHash])]])
        };

        const someoneResult = await storeVersionedObject(newSomeone as any);
        const someoneIdHash = someoneResult.idHash;
        console.log(`[ContactCreation]   ├─ Someone created: ${someoneIdHash.toString().substring(0, 8)}`);

        // 3. Add to contacts (idempotent)
        console.log('[ContactCreation]   ├─ Adding to contacts list...');
        await leuteModel.addSomeoneElse(someoneIdHash as any);
        console.log('[ContactCreation]   └─ ✅ Contact creation complete!');

        return newSomeone;
    } catch (error) {
        console.error('[ContactCreation] Error creating Profile/Someone:', error);
        throw error;
    }
}

/**
 * Ensures a contact (Person, Profile, Someone) exists for a given Person ID.
 * Retrieves the existing Someone or creates the full persona if needed.
 *
 * @param personId - The ID hash of the Person
 * @param leuteModel - The initialized LeuteModel instance
 * @param profileOptions - Options for creating the profile if needed
 * @returns The Someone object (existing or created)
 */
export async function ensureContactExists(
    personId: string | SHA256IdHash<any>,
    leuteModel: LeuteModel,
    profileOptions: ProfileOptions = {}
): Promise<any> {
    console.log(`[ContactCreation] Ensuring contact for Person ${personId.toString().substring(0, 8)}...`);

    // First check all existing contacts to see if any already use this Person ID
    try {
        const others = await leuteModel.others();
        if (others && Array.isArray(others) && others.length > 0) {
            // Find any existing Someone with the same personId (mainIdentity)
            for (const contact of others) {
                if (!contact) continue;

                let contactPersonId;
                try {
                    // Get the Person ID for this contact using mainIdentity if available
                    if (typeof contact.mainIdentity === 'function') {
                        contactPersonId = await contact.mainIdentity();
                    } else if ('personId' in contact) {
                        contactPersonId = contact.personId;
                    }

                    // If this contact has the same Person ID, return it
                    if (contactPersonId && contactPersonId.toString() === personId.toString()) {
                        console.log(`[ContactCreation] Found existing Someone ${contact.idHash} with matching Person ID in contacts`);
                        return contact;
                    }
                } catch (identityError) {
                    console.warn(`[ContactCreation] Error getting identity for contact:`, identityError);
                }
            }
        }
    } catch (othersError) {
        console.warn(`[ContactCreation] Error checking existing contacts:`, othersError);
    }

    // If no matching contact was found in the list, we need to create one
    console.log(`[ContactCreation] No existing Someone found for Person ${personId}. Creating Profile and Someone...`);
    try {
        const someone = await createProfileAndSomeoneForPerson(personId, leuteModel, profileOptions);
        console.log(`[ContactCreation] ✅ Successfully created and added contact for Person ${personId}`);
        return someone;
    } catch (creationError) {
        console.error(`[ContactCreation] Failed to create Profile/Someone for Person ${personId}:`, creationError);
        throw creationError;
    }
}

/**
 * Get display name from a Person object
 * @param personId - The Person ID
 * @returns Display name or default
 */
async function getPersonDisplayName(personId: string | SHA256IdHash<any>): Promise<string> {
    try {
        const personResult = await getObjectByIdHash(ensureIdHash(personId));
        const person = personResult?.obj;

        if (person) {
            // Try to get name or email
            if (person.name) return person.name;
            if (person.email) {
                // Extract name from email
                const emailName = person.email.split('@')[0];
                return emailName.replace(/[._-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
            }
        }
    } catch (error) {
        console.log(`[ContactCreation] Could not get Person object for display name:`, (error as Error).message);
    }

    return 'Remote Contact';
}

/**
 * Handle new contact when a connection is established
 * This is called when we receive a new connection from a remote instance
 *
 * @param remotePersonId - The remote person's ID
 * @param leuteModel - The LeuteModel instance
 * @returns The Someone object
 */
export async function handleNewConnection(
    remotePersonId: string | SHA256IdHash<any>,
    leuteModel: LeuteModel
): Promise<any> {
    console.log('[ContactCreation] 🤝 Handling new connection from:', remotePersonId.toString().substring(0, 8));
    console.log('[ContactCreation] Step 1/3: Getting display name for contact...');

    try {
        // Get a display name for the contact
        const displayName = await getPersonDisplayName(remotePersonId);
        console.log('[ContactCreation] Step 2/3: Creating/retrieving contact for:', displayName);

        // Ensure the contact exists with proper Profile and Someone
        const someone = await ensureContactExists(
            remotePersonId,
            leuteModel,
            { displayName }
        );

        console.log('[ContactCreation] Step 3/3: Contact setup complete!');
        console.log('[ContactCreation] ✅ Contact ready for:', displayName);
        return someone;
    } catch (error) {
        console.error('[ContactCreation] Error handling new connection:', error);
        throw error;
    }
}

/**
 * Update Someone when we receive Profile data via CHUM
 * @param personId - The person ID
 * @param profileData - The received profile data
 * @param leuteModel - The LeuteModel instance
 */
export async function handleReceivedProfile(
    personId: string | SHA256IdHash<any>,
    profileData: any,
    leuteModel: LeuteModel
): Promise<void> {
    console.log('[ContactCreation] 📦 Received Profile data for:', personId.toString().substring(0, 8));

    try {
        // First ensure the contact exists (creates if needed)
        const someone = await ensureContactExists(personId, leuteModel);

        if (someone) {
            // Update the profile with new data
            const profile = await someone.mainProfile();

            // Update profile descriptions if provided
            if (profileData.personDescriptions) {
                profile.personDescriptions = profileData.personDescriptions;
                await profile.saveAndLoad();
                console.log('[ContactCreation] ✅ Updated Profile with received data');
            }
        } else {
            console.log('[ContactCreation] Could not ensure contact exists for:', personId.toString().substring(0, 8));
        }
    } catch (error) {
        console.error('[ContactCreation] Error handling received Profile:', error);
    }
}
