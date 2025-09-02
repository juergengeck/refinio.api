/**
 * TypeScript ambient module declaration for ONE object interfaces
 * This extends the core ONE object type system with custom Profile types
 */

declare module '@OneObjectInterfaces' {
    // Custom Profile interface
    interface Profile {
        $type$: 'Profile';
        profileId: string;
        personId: import('@refinio/one.core/lib/util/type-checks.js').SHA256IdHash;
        owner: import('@refinio/one.core/lib/util/type-checks.js').SHA256IdHash;
        nickname?: string;
        communicationEndpoint?: import('@refinio/one.core/lib/util/type-checks.js').SHA256Hash[];
        personDescription?: import('@refinio/one.core/lib/util/type-checks.js').SHA256Hash[];
    }

    // ProfileCredential interface
    interface ProfileCredential {
        $type$: 'ProfileCredential';
        profileId: import('@refinio/one.core/lib/util/type-checks.js').SHA256IdHash;
        credentialType: string;
        claims: any;
        issuer: import('@refinio/one.core/lib/util/type-checks.js').SHA256IdHash;
        issuedAt: string;
        expiresAt?: number;
        signature?: string;
    }

    // Extend the existing interfaces with our custom types
    export interface OneVersionedObjectInterfaces {
        Profile: Profile;
        ProfileCredential: ProfileCredential;
    }

    // No unversioned objects for now
    export interface OneUnversionedObjectInterfaces {}

    // ID object interfaces
    export interface OneIdObjectInterfaces {
        ProfileId: Pick<Profile, '$type$' | 'profileId' | 'personId' | 'owner'>;
        ProfileCredentialId: Pick<ProfileCredential, '$type$' | 'profileId' | 'credentialType'>;
    }
}