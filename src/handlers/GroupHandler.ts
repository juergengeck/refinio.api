import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Group Handler for refinio.api
 *
 * Handles Group creation with AffirmationCertificates and validation
 */
export class GroupHandler {
  private leuteModel: LeuteModel;

  constructor(leuteModel: LeuteModel) {
    this.leuteModel = leuteModel;
  }

  /**
   * Create a Group with AffirmationCertificate
   */
  async createGroupWithCertificate(params: {
    members: string[];
  }) {
    try {
      console.log('GroupHandler: Creating group with certificate...');

      // @ts-expect-error - Dynamic import for runtime loading
      const { createGroup } = await import('@refinio/one.models/lib/recipes/GroupAccess.js');
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      // @ts-expect-error - Dynamic import for runtime loading
      const { grantAccess } = await import('@refinio/one.core/lib/access-control.js');

      const trust: any = this.leuteModel.trust;
      const myPersonId = await this.leuteModel.myMainIdentity();

      // Create Group
      const groupIdHash = await createGroup(params.members as any);
      const group = await getObject(groupIdHash);

      console.log(`  Group created: ${groupIdHash.substring(0, 8)}`);

      // Create AffirmationCertificate for the Group
      const certificate: any = await trust.certify('AffirmationCertificate', { data: groupIdHash });
      console.log(`  Certificate created: ${certificate.certificateIdHash.substring(0, 8)}`);

      // Grant access to all members for Group and certificate components
      await grantAccess(params.members as any, [groupIdHash]);
      await grantAccess(params.members as any, [
        certificate.certificateIdHash,
        certificate.signatureIdHash,
        certificate.licenseIdHash
      ]);

      console.log(`  Access granted to ${params.members.length} members`);

      return {
        success: true,
        groupId: groupIdHash,
        memberCount: (group as any).owner?.length || params.members.length,
        certificate: {
          certificateId: certificate.certificateIdHash,
          signatureId: certificate.signatureIdHash,
          licenseId: certificate.licenseIdHash,
          issuer: myPersonId
        }
      };
    } catch (error: any) {
      console.error('GroupHandler: Failed to create group:', error);

      return {
        success: false,
        error: error.message,
        details: {
          code: error.code || 'GROUP_CREATION_FAILED',
          stack: error.stack
        }
      };
    }
  }

  /**
   * Validate a Group using objectFilter logic
   *
   * Checks if the Group has a valid AffirmationCertificate from a trusted person
   */
  async validateGroup(params: {
    groupId: string;
  }) {
    try {
      console.log(`GroupHandler: Validating group ${params.groupId.substring(0, 8)}...`);

      const trust: any = this.leuteModel.trust;
      const myId = await this.leuteModel.myMainIdentity();

      // Get list of people we trust (ourselves + people we've paired with)
      const knownPeople = await this.leuteModel.others();
      const trustedPeople = [myId, ...knownPeople];

      // Get all affirmation certificates for this Group
      const affirmedBy = await trust.affirmedBy(params.groupId);

      if (affirmedBy.length === 0) {
        console.log(`  No AffirmationCertificate found for Group`);
        return {
          success: true,
          valid: false,
          reason: 'NO_CERTIFICATE',
          affirmedBy: []
        };
      }

      // Check if any of the affirmers are trusted
      let validCertificateFound = false;
      const trustedAffirmers: string[] = [];

      for (const affirmerId of affirmedBy) {
        if (trustedPeople.includes(affirmerId)) {
          // Verify the certificate is actually valid (signature checks, etc)
          const isAffirmed = await trust.isAffirmedBy(params.groupId, affirmerId);
          if (isAffirmed) {
            console.log(`  Valid certificate from trusted person ${affirmerId.substring(0, 8)}`);
            validCertificateFound = true;
            trustedAffirmers.push(affirmerId);
          }
        } else {
          console.log(`  Certificate from unknown person ${affirmerId.substring(0, 8)}`);
        }
      }

      if (!validCertificateFound) {
        return {
          success: true,
          valid: false,
          reason: 'NO_TRUSTED_CERTIFICATE',
          affirmedBy,
          trustedAffirmers: []
        };
      }

      return {
        success: true,
        valid: true,
        affirmedBy,
        trustedAffirmers
      };
    } catch (error: any) {
      console.error('GroupHandler: Validation failed:', error);

      return {
        success: false,
        error: error.message,
        details: {
          code: error.code || 'VALIDATION_FAILED',
          stack: error.stack
        }
      };
    }
  }

  /**
   * Check certificate status for an object
   */
  async checkCertificate(params: {
    objectId: string;
  }) {
    try {
      console.log(`GroupHandler: Checking certificate for ${params.objectId.substring(0, 8)}...`);

      const trust: any = this.leuteModel.trust;
      const myPersonId = await this.leuteModel.myMainIdentity();

      // Get all affirmation certificates
      const affirmedBy = await trust.affirmedBy(params.objectId);

      // Check if we affirmed it
      const isAffirmedByMe = await trust.isAffirmedBy(params.objectId, myPersonId);

      console.log(`  Found ${affirmedBy.length} affirmer(s), isAffirmedByMe: ${isAffirmedByMe}`);

      return {
        success: true,
        objectId: params.objectId,
        affirmedBy,
        isAffirmedByMe,
        certificateCount: affirmedBy.length
      };
    } catch (error: any) {
      console.error('GroupHandler: Certificate check failed:', error);

      return {
        success: false,
        error: error.message,
        details: {
          code: error.code || 'CERTIFICATE_CHECK_FAILED',
          stack: error.stack
        }
      };
    }
  }

  /**
   * Get contacts (people we've paired with)
   */
  async getContacts() {
    try {
      const contacts = await this.leuteModel.others();

      return {
        success: true,
        contacts
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get my identity
   */
  async getMyIdentity() {
    try {
      const myId = await this.leuteModel.myMainIdentity();

      return {
        success: true,
        myId
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
