import { SettingsStore } from '@refinio/one.core/lib/system/settings-store.js';
import { setBaseDirOrName } from '@refinio/one.core/lib/system/storage-base.js';
import { isString } from '../utils/typeChecks.js';
import { convertIdentityToInstanceOptions } from '@refinio/one.models/lib/misc/IdentityExchange.js';
export async function initOneCoreInstance(secret, directory, identity) {
    setBaseDirOrName(directory);
    const storedInstanceName = await SettingsStore.getItem('instance');
    const storedEmail = await SettingsStore.getItem('email');
    let instanceOptions;
    if (identity) {
        if (isString(storedInstanceName) && isString(storedEmail)) {
            console.log('Error: An instance already exists. You cannot pass an identity file to initOneCoreInstance.');
            process.exit(1);
        }
        else {
            instanceOptions = convertIdentityToInstanceOptions(identity, secret);
        }
    }
    else if (isString(storedInstanceName) && isString(storedEmail)) {
        instanceOptions = {
            name: storedInstanceName,
            email: storedEmail,
            secret
        };
    }
    else {
        const randomString = Math.random().toString(36).substring(2, 15);
        instanceOptions = {
            name: `rnd-${randomString}`,
            email: `rnd.generated@${randomString}.com`,
            secret
        };
    }
    try {
        const [instanceModule, coreModule, stableModule, experimentalModule, stableReverseMaps, experimentalReverseMaps] = await Promise.all([
            import('@refinio/one.core/lib/instance.js'),
            import('@refinio/one.core/lib/recipes.js'),
            import('@refinio/one.models/lib/recipes/recipes-stable.js'),
            import('@refinio/one.models/lib/recipes/recipes-experimental.js'),
            import('@refinio/one.models/lib/recipes/reversemaps-stable.js'),
            import('@refinio/one.models/lib/recipes/reversemaps-experimental.js')
        ]);
        const { initInstance } = instanceModule;
        const CORE_RECIPES = coreModule.CORE_RECIPES || coreModule.default || [];
        const RecipesStable = stableModule.default || [];
        const RecipesExperimental = experimentalModule.default || [];
        const ReverseMapsStable = stableReverseMaps.ReverseMapsStable || new Map();
        const ReverseMapsExperimental = experimentalReverseMaps.ReverseMapsExperimental || new Map();
        const ReverseMapsForIdObjectsStable = stableReverseMaps.ReverseMapsForIdObjectsStable || new Map();
        const ReverseMapsForIdObjectsExperimental = experimentalReverseMaps.ReverseMapsForIdObjectsExperimental || new Map();
        const reverseMaps = new Map([
            ...ReverseMapsStable,
            ...ReverseMapsExperimental
        ]);
        const reverseMapsForIdObjects = new Map([
            ...ReverseMapsForIdObjectsStable,
            ...ReverseMapsForIdObjectsExperimental
        ]);
        await initInstance({
            ...instanceOptions,
            directory: directory,
            initialRecipes: [...CORE_RECIPES, ...RecipesStable, ...RecipesExperimental],
            initiallyEnabledReverseMapTypes: reverseMaps,
            initiallyEnabledReverseMapTypesForIdObjects: reverseMapsForIdObjects,
            wipeStorage: false,
            encryptStorage: false
        });
        if (!isString(storedInstanceName) || !isString(storedEmail)) {
            await SettingsStore.setItem('instance', instanceOptions.name);
            await SettingsStore.setItem('email', instanceOptions.email);
        }
    }
    catch (e) {
        if (e.code === 'CYENC-SYMDEC') {
            console.log('Error: invalid password');
            process.exit(1);
        }
        else {
            throw new Error(e.message);
        }
    }
}
export async function shutdownOneCoreInstance() {
    const { closeInstance } = await import('@refinio/one.core/lib/instance.js');
    closeInstance();
}
export async function oneCoreInstanceExists(directory) {
    setBaseDirOrName(directory);
    const storedInstanceName = await SettingsStore.getItem('instance');
    const storedEmail = await SettingsStore.getItem('email');
    return isString(storedInstanceName) && isString(storedEmail);
}
export async function oneCoreInstanceInformation(directory) {
    setBaseDirOrName(directory);
    const instanceName = await SettingsStore.getItem('instance');
    const personEmail = await SettingsStore.getItem('email');
    if (!isString(personEmail) || !isString(instanceName)) {
        throw new Error('No one.core instance exists.');
    }
    return {
        personEmail,
        instanceName
    };
}
//# sourceMappingURL=OneCoreInit.js.map