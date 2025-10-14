/**
 * Helper to create complete Filer filesystem structure
 *
 * Creates a root filesystem with all subdirectories like Replicant does.
 */

import type { IFileSystem } from '@refinio/one.models/lib/fileSystems/IFileSystem.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import type JournalModel from '@refinio/one.models/lib/models/JournalModel.js';
import type QuestionnaireModel from '@refinio/one.models/lib/models/QuestionnaireModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type IoMManager from '@refinio/one.models/lib/models/IoM/IoMManager.js';
import type Notifications from '@refinio/one.models/lib/models/Notifications.js';

export interface FilerModels {
    leuteModel: LeuteModel;
    topicModel: TopicModel;
    channelManager: ChannelManager;
    connectionsModel: ConnectionsModel;
    notifications: Notifications;
    iomManager: IoMManager;
    journalModel: JournalModel;
    questionnaireModel: QuestionnaireModel;
    commServerUrl: string;
    inviteUrlPrefix: string;
}

/**
 * Creates a complete root filesystem with all Filer subdirectories
 *
 * Structure:
 * /
 * ├── chats/         (ChatFileSystem)
 * ├── debug/         (DebugFileSystem)
 * ├── invites/       (PairingFileSystem)
 * ├── objects/       (ObjectsFileSystem)
 * ├── types/         (TypesFileSystem)
 * ├── profiles/      (ProfilesFileSystem)
 * ├── journal/       (JournalFileSystem)
 * └── questionnaires/ (QuestionnairesFileSystem)
 *
 * @param models - All required models for the filesystems
 * @returns Complete IFileSystem ready to mount
 */
export async function createCompleteFiler(models: FilerModels): Promise<IFileSystem> {
    // Import all required filesystem classes
    const { default: TemporaryFileSystem } = await import('@refinio/one.models/lib/fileSystems/TemporaryFileSystem.js');
    const { default: ChatFileSystem } = await import('@refinio/one.models/lib/fileSystems/ChatFileSystem.js');
    const { default: DebugFileSystem } = await import('@refinio/one.models/lib/fileSystems/DebugFileSystem.js');
    const { default: PairingFileSystem } = await import('@refinio/one.models/lib/fileSystems/PairingFileSystem.js');
    const { default: ObjectsFileSystem } = await import('@refinio/one.models/lib/fileSystems/ObjectsFileSystem.js');
    const { default: TypesFileSystem } = await import('@refinio/one.models/lib/fileSystems/TypesFileSystem.js');
    const { default: ProfilesFileSystem } = await import('@refinio/one.models/lib/fileSystems/ProfilesFileSystem.js');
    const { default: JournalFileSystem } = await import('@refinio/one.models/lib/fileSystems/JournalFileSystem.js');
    const { default: QuestionnairesFileSystem } = await import('@refinio/one.models/lib/fileSystems/QuestionnairesFileSystem.js');

    // Create all filesystem instances (matching Filer.ts:102-127)
    const chatFileSystem = new ChatFileSystem(
        models.leuteModel,
        models.topicModel,
        models.channelManager,
        models.notifications,
        '/objects'
    );

    const debugFileSystem = new DebugFileSystem(
        models.leuteModel,
        models.topicModel,
        models.connectionsModel,
        models.channelManager
    );

    const pairingFileSystem = new PairingFileSystem(
        models.connectionsModel,
        models.iomManager,
        models.inviteUrlPrefix,
        'full' // iomMode
    );

    const objectsFileSystem = new ObjectsFileSystem();
    const typesFileSystem = new TypesFileSystem();
    const profilesFileSystem = new ProfilesFileSystem(models.leuteModel);
    const questionnairesFileSystem = new QuestionnairesFileSystem(models.questionnaireModel);

    // Create root filesystem and mount all subdirectories (matching Filer.ts:131-139)
    const rootFileSystem = new TemporaryFileSystem();
    await rootFileSystem.mountFileSystem('/chats', chatFileSystem);
    await rootFileSystem.mountFileSystem('/debug', debugFileSystem);
    await rootFileSystem.mountFileSystem('/invites', pairingFileSystem);
    await rootFileSystem.mountFileSystem('/objects', objectsFileSystem);
    await rootFileSystem.mountFileSystem('/types', typesFileSystem);
    await rootFileSystem.mountFileSystem('/profiles', profilesFileSystem);
    await rootFileSystem.mountFileSystem('/questionnaires', questionnairesFileSystem);

    // Only mount journal if journalModel is provided
    if (models.journalModel) {
        const journalFileSystem = new JournalFileSystem(models.journalModel);
        await rootFileSystem.mountFileSystem('/journal', journalFileSystem);
    }

    return rootFileSystem;
}
