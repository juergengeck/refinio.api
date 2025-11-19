/**
 * TypeScript ambient module declaration for ONE object interfaces
 * This creates the ambient module that can be extended by other files
 */

import type { Story, Assembly, Plan } from './src/StoryFactory.js';

declare module '@OneObjectInterfaces' {
    export interface OneCertificateInterfaces {}

    export interface OneLicenseInterfaces {}

    export interface OneUnversionedObjectInterfaces extends OneCertificateInterfaces {}

    export interface OneIdObjectInterfaces {}

    export interface OneVersionedObjectInterfaces {
        Story: Story;
        Assembly: Assembly;
        Plan: Plan;
    }
}