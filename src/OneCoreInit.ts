import { SettingsStore } from '@refinio/one.core/lib/system/settings-store.js';
import { setBaseDirOrName } from '@refinio/one.core/lib/system/storage-base.js';
import { convertIdentityToInstanceOptions } from '@refinio/one.models/lib/misc/IdentityExchange.js';

function isString(value: any): value is string {
  return typeof value === 'string';
}

export async function initOneCoreInstance(secret: string, directory: string, identity?: any) {
  setBaseDirOrName(directory);

  const storedInstanceName = await SettingsStore.getItem('instance');
  const storedEmail = await SettingsStore.getItem('email');

  let instanceOptions: any;

  if (identity) {
    if (isString(storedInstanceName) && isString(storedEmail)) {
      console.log('Error: An instance already exists. You cannot pass an identity file to initOneCoreInstance.');
      process.exit(1);
    } else {
      instanceOptions = convertIdentityToInstanceOptions(identity, secret);
    }
  } else if (isString(storedInstanceName) && isString(storedEmail)) {
    instanceOptions = {
      name: storedInstanceName,
      email: storedEmail,
      secret
    };
  } else {
    const randomString = Math.random().toString(36).substring(2, 15);
    instanceOptions = {
      name: `rnd-${randomString}`,
      email: `rnd.generated@${randomString}.com`,
      secret
    };
  }

  try {
    const [
      instanceModule,
      coreModule,
      stableModule,
      experimentalModule,
      stableReverseMaps,
      experimentalReverseMaps
    ] = await Promise.all([
      import('@refinio/one.core/lib/instance.js'),
      import('@refinio/one.core/lib/recipes.js'),
      import('@refinio/one.models/lib/recipes/recipes-stable.js'),
      import('@refinio/one.models/lib/recipes/recipes-experimental.js'),
      import('@refinio/one.models/lib/recipes/reversemaps-stable.js'),
      import('@refinio/one.models/lib/recipes/reversemaps-experimental.js')
    ]);

    const { initInstance } = instanceModule;
    const CORE_RECIPES = (coreModule as any).CORE_RECIPES || (coreModule as any).default || [];
    const RecipesStable = (stableModule as any).default || [];
    const RecipesExperimental = (experimentalModule as any).default || [];
    const ReverseMapsStable = (stableReverseMaps as any).ReverseMapsStable || new Map();
    const ReverseMapsExperimental = (experimentalReverseMaps as any).ReverseMapsExperimental || new Map();
    const ReverseMapsForIdObjectsStable = (stableReverseMaps as any).ReverseMapsForIdObjectsStable || new Map();
    const ReverseMapsForIdObjectsExperimental = (experimentalReverseMaps as any).ReverseMapsForIdObjectsExperimental || new Map();

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
  } catch (e: any) {
    if (e.code === 'CYENC-SYMDEC') {
      console.log('Error: invalid password');
      process.exit(1);
    } else {
      throw new Error(e.message);
    }
  }
}