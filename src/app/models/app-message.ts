import { AppData } from "./app-data";
import { AppInfo } from "./app-info";
import { AppBaseProfile, AppProfile } from "./app-profile";
import { AppResource } from "./app-resource";
import { AppSettingsUserCfg } from "./app-settings-user-cfg";
import { ExternalFile } from "./external-file";
import { GameAction } from "./game-action";
import { GameDatabase } from "./game-database";
import { GameId } from "./game-id";
import { GamePluginProfileRef } from "./game-plugin-profile-ref";
import { ModImportRequest, ModImportResult } from "./mod-import-status";
import { ModProfileRef } from "./mod-profile-ref";
import { LogEntry } from "../util/logger";
import { GameInstallation } from "./game-installation";
import { AppWarnings } from "./app-warnings";
import { ExportedGameDetails, GameDetails } from "./game-details";
import { ModOverwriteFiles } from "./mod-overwrite-files";
import { AppPlatform } from "./app-platform";

export type AppMessage
    = AppMessage.AppMessage
    | AppMessage.ProfileMessage;

export type AppMessageData<I extends AppMessage["id"]> = (AppMessage & { id: I })["data"];
export type AppMessageResult<I extends AppMessage["id"]> = (AppMessage & { id: I })["result"];

type _AppMessage = AppMessage;

export namespace AppMessage {

    export type Prefix = typeof PREFIX;

    export const PREFIX = "app";

    export interface Base {
        id: string;
        data?: unknown;
        result?: unknown;
    }

    // App messages:

    export interface Exit extends Base {
        id: `${Prefix}:exit`;
    }

    export interface Log extends Base {
        id: `${Prefix}:log`;
        data: LogEntry;
        result: LogEntry;
    }

    export interface GetPlatform extends Base {
        id: `${Prefix}:getPlatform`;
        data: {};
        result: AppPlatform;
    }

    export interface GetInfo extends Base {
        id: `${Prefix}:getInfo`;
        data: {};
        result: AppInfo;
    }

    export interface CheckLatestVersion extends Base {
        id: `${Prefix}:checkLatestVersion`;
        data: {};
        result?: string;
    }

    export interface SyncUiState extends Base {
        id: `${Prefix}:syncUiState`;
        data: {
            appState: AppData;
            modListCols: string[];
            defaultModListCols: string[];
        };
    }

    export interface ChooseDirectory extends Base {
        id: `${Prefix}:chooseDirectory`;
        data: {
            baseDir?: string;
        };
        result?: string;
    }

    export interface ChooseFilePath extends Base {
        id: `${Prefix}:chooseFilePath`;
        data: {
            baseDir?: string;
            fileTypes?: string[];
        };
        result?: string;
    }

    export interface VerifyPathExists extends Base {
        id: `${Prefix}:verifyPathExists`;
        data: {
            path: string | string[];
            dirname?: boolean;
        };
        result?: string;
    }

    export interface Verify7ZipExists extends Base {
        id: `${Prefix}:verify7ZipExists`;
        result: boolean;
    }

    export interface OpenFile extends Base {
        id: `${Prefix}:openFile`;
        data: {
            path: string;
        };
        result: Pick<ExternalFile, "data" | "path" | "mimeType">;
    }

    export interface LoadProfileList extends Base {
        id: `${Prefix}:loadProfileList`;
        result: AppProfile.Description[];
    }

    export interface LoadSettings extends Base {
        id: `${Prefix}:loadSettings`;
        result: AppSettingsUserCfg | null;
    }

    export interface SaveSettings extends Base {
        id: `${Prefix}:saveSettings`;
        data: {
            settings: AppSettingsUserCfg;
        };
    }

    export interface ExportGame extends Base {
        id: `${Prefix}:exportGame`;
        data: {
            gameDetails: GameDetails;
        };
    }

    export interface ReadGame extends Base {
        id: `${Prefix}:readGame`;
        result?: [GameId, ExportedGameDetails];
    }

    export interface NewProfile extends Base {
        id: `${Prefix}:newProfile`;
    }

    export interface ImportProfile extends Base {
        id: `${Prefix}:importProfile`;
        data: {
            directImport: boolean;
        };
    }

    export interface ExportProfile extends Base {
        id: `${Prefix}:exportProfile`;
        data: {
            profile: AppProfile;
        };
        result?: string;
    }

    export interface DeleteProfile extends Base {
        id: `${Prefix}:deleteProfile`;
        data: {
            profile: AppProfile;
        };
    }

    export interface LoadProfile extends Base {
        id: `${Prefix}:loadProfile`;
        data: {
            name: string;
            gameId: string;
        };
        result?: AppProfile;
    }

    export interface LoadExternalProfile extends Base {
        id: `${Prefix}:loadExternalProfile`;
        data: {
            profilePath?: string;
            directImport?: boolean;
        };
        result?: AppProfile;
    }

    export interface SaveProfile extends Base {
        id: `${Prefix}:saveProfile`;
        data: {
            profile: AppProfile;
        };
    }

    export interface VerifyProfile extends Base {
        id: `${Prefix}:verifyProfile`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.VerificationResults;
    }

    export interface CopyProfileData extends Base {
        id: `${Prefix}:copyProfile`;
        data: {
            srcProfile: AppProfile;
            destProfile: AppProfile;
        };
    }

    export interface ShowPreferences extends Base {
        id: `${Prefix}:showPreferences`;
    }

    export interface ShowManageGames extends Base {
        id: `${Prefix}:showManageGames`;
    }

    export interface LoadGameDatabase extends Base {
        id: `${Prefix}:loadGameDatabase`;
        data: {
            includeCustomGames: boolean;
        };
        result: GameDatabase;
    }

    export interface FindGameInstallations extends Base {
        id: `${Prefix}:findGameInstallations`;
        data: {
            gameId: GameId;
        };
        result: GameInstallation[];
    }

    export interface FindGameInstallationsByRootDir extends Base {
        id: `${Prefix}:findGameInstallationsByRootDir`;
        data: {
            gameId: GameId;
            rootDir: string;
        };
        result: GameInstallation[];
    }

    export interface ShowAboutInfo extends Base {
        id: `${Prefix}:showAboutInfo`;
        data: AppInfo;
    }

    export interface ShowSupportInfo extends Base {
        id: `${Prefix}:showSupportInfo`;
        data: AppInfo;
    }

    export interface ToggleModListColumn extends Base {
        id: `${Prefix}:toggleModListColumn`;
        data: {
            column?: string;
            reset?: boolean;
        };
    }

    export interface ToggleLogPanel extends Base {
        id: `${Prefix}:toggleLogPanel`;
    }

    export interface CheckLinkSupported extends Base {
        id: `${Prefix}:checkLinkSupported`;
        data: {
            targetPath: string;
            destPaths: string[];
            symlink: boolean;
            symlinkType?: "file" | "dir" | "junction";
        };
        result: boolean;
    }
    
    export interface ResolveResourceUrl extends Base {
        id: `${Prefix}:resolveResourceUrl`;
        data: {
            resource: AppResource;
        };
        result: string | undefined;
    }

    export interface QueryWarnings extends Base {
        id: `${Prefix}:queryWarnings`;
        data: {};
        result: AppWarnings;
    }

    export interface GetActiveSteamUserIds extends Base {
        id: `${Prefix}:getActiveSteamUserIds`;
        data: {};
        result: string[];
    }

    export type AppMessage = Exit
                           | Log
                           | GetPlatform
                           | GetInfo
                           | CheckLatestVersion
                           | SyncUiState
                           | ChooseDirectory
                           | ChooseFilePath
                           | VerifyPathExists
                           | Verify7ZipExists
                           | OpenFile
                           | LoadProfileList
                           | LoadSettings
                           | SaveSettings
                           | ExportGame
                           | ReadGame
                           | NewProfile
                           | ImportProfile
                           | ExportProfile
                           | DeleteProfile
                           | LoadProfile
                           | LoadExternalProfile
                           | SaveProfile
                           | VerifyProfile
                           | CopyProfileData
                           | ShowPreferences
                           | ShowManageGames
                           | LoadGameDatabase
                           | FindGameInstallations
                           | FindGameInstallationsByRootDir
                           | ShowAboutInfo
                           | ShowSupportInfo
                           | ToggleModListColumn
                           | ToggleLogPanel
                           | CheckLinkSupported
                           | ResolveResourceUrl
                           | QueryWarnings
                           | GetActiveSteamUserIds;

    // Profile messages:

    export namespace ProfileMessage {
       
        export type Prefix = typeof PREFIX;

        export const PREFIX = "profile";
    }

    export interface ResolveProfilePath extends Base {
        id: `${ProfileMessage.Prefix}:resolvePath`;
        data: {
            profile: AppProfile;
            pathKeys: Array<keyof AppProfile>;
        };
        result: Array<string | undefined>;
    }

    export interface MoveProfileFolder extends Base {
        id: `${ProfileMessage.Prefix}:moveFolder`;
        data: {
            oldProfile: AppProfile;
            newProfile: AppProfile;
            pathKey: keyof AppProfile;
            overwrite: boolean;
            destructive: boolean;
        };
    }

    export interface ProfileSettings extends Base {
        id: `${ProfileMessage.Prefix}:settings`;
        data: {
            profile: AppProfile;
        };
    }

    export interface BeginModAdd extends Base {
        id: `${ProfileMessage.Prefix}:beginModAdd`;
        data: {
            profile: AppProfile;
            modPath?: string;
            root?: boolean;
        };
        result?: ModImportRequest;
    }

    export interface BeginModExternalImport extends Base {
        id: `${ProfileMessage.Prefix}:beginModExternalImport`;
        data: {
            profile: AppProfile;
            modPath?: string;
            root?: boolean;
        };
        result?: ModImportRequest;
    }

    export interface CompleteModImport extends Base {
        id: `${ProfileMessage.Prefix}:completeModImport`;
        data: {
            importRequest: ModImportRequest;
        };
        result?: ModImportResult;
    }

    export interface AddModSection extends Base {
        id: `${ProfileMessage.Prefix}:addModSection`;
        data: {
            root: boolean;
        };
    }

    export interface DeleteProfileMod extends Base {
        id: `${ProfileMessage.Prefix}:deleteMod`;
        data: {
            profile: AppProfile;
            modName: string;
        };
    }

    export interface RenameProfileMod extends Base {
        id: `${ProfileMessage.Prefix}:renameMod`;
        data: {
            profile: AppProfile;
            modCurName: string;
            modNewName: string;
        };
    }

    export interface ReadProfileModFilePaths extends Base {
        id: `${ProfileMessage.Prefix}:readModFilePaths`;
        data: {
            profile: AppProfile;
            modName: string;
            modRef: ModProfileRef;
            normalizePaths?: boolean;
        };
        result: string[];
    }

    export interface ReadDataSubdirs extends Base {
        id: `${ProfileMessage.Prefix}:readDataSubdirs`;
        data: {
            profile: AppProfile;
        };
        result: string[];
    }

    export interface FindPluginFiles extends Base {
        id: `${ProfileMessage.Prefix}:findPluginFiles`;
        data: {
            profile: AppProfile;
        };
        result: GamePluginProfileRef[];
    }

    export interface FindModFiles extends Base {
        id: `${ProfileMessage.Prefix}:findModFiles`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.ModList;
    }

    export interface ImportProfileModOrderBackup extends Base {
        id: `${ProfileMessage.Prefix}:importModOrderBackup`;
        data: {
            profile: AppProfile;
            backupPath?: string;
        };
        result: AppProfile | undefined;
    }

    export interface CreateProfileModOrderBackup extends Base {
        id: `${ProfileMessage.Prefix}:createModOrderBackup`;
        data: {
            profile: AppProfile;
            backupName?: string;
        };
    }

    export interface ReadProfileModOrderBackups extends Base {
        id: `${ProfileMessage.Prefix}:readModOrderBackups`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.BackupEntry[];
    }

    export interface DeleteProfileModOrderBackup extends Base {
        id: `${ProfileMessage.Prefix}:deleteModOrderBackup`;
        data: {
            profile: AppProfile;
            backupFile: string;
        };
    }

    export interface ImportProfilePluginBackup extends Base {
        id: `${ProfileMessage.Prefix}:importPluginBackup`;
        data: {
            profile: AppProfile;
            backupPath?: string;
        };
        result: AppProfile | undefined;
    }

    export interface ImportProfileConfigBackup extends Base {
        id: `${ProfileMessage.Prefix}:importConfigBackup`;
        data: {
            profile: AppProfile;
            backupPath?: string;
        };
        result: AppProfile | undefined;
    }

    export interface CreateProfilePluginBackup extends Base {
        id: `${ProfileMessage.Prefix}:createPluginBackup`;
        data: {
            profile: AppProfile;
            backupName?: string;
        };
    }

    export interface CreateProfileConfigBackup extends Base {
        id: `${ProfileMessage.Prefix}:createConfigBackup`;
        data: {
            profile: AppProfile;
            backupName?: string;
        };
    }

    export interface DeleteProfilePluginBackup extends Base {
        id: `${ProfileMessage.Prefix}:deletePluginBackup`;
        data: {
            profile: AppProfile;
            backupFile: string;
        };
    }

    export interface DeleteProfileConfigBackup extends Base {
        id: `${ProfileMessage.Prefix}:deleteConfigBackup`;
        data: {
            profile: AppProfile;
            backupFile: string;
        };
    }

    export interface ReadProfilePluginBackups extends Base {
        id: `${ProfileMessage.Prefix}:readPluginBackups`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.BackupEntry[];
    }

    export interface ReadProfileConfigBackups extends Base {
        id: `${ProfileMessage.Prefix}:readConfigBackups`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.BackupEntry[];
    }

    export interface ExportProfilePluginList extends Base {
        id: `${ProfileMessage.Prefix}:exportPluginList`;
        data: {
            profile: AppProfile;
        };
    }

    export interface CheckArchiveInvalidationEnabled extends Base {
        id: `${ProfileMessage.Prefix}:checkArchiveInvalidationEnabled`;
        data: {
            profile: AppProfile | AppBaseProfile | AppProfile.Form;
        };
        result: boolean;
    }

    export interface SetArchiveInvalidationEnabled extends Base {
        id: `${ProfileMessage.Prefix}:setArchiveInvalidationEnabled`;
        data: {
            profile: AppProfile;
            enabled: boolean;
        };
    }

    export interface DeployProfile extends Base {
        id: `${ProfileMessage.Prefix}:deploy`;
        data: {
            profile: AppProfile;
            deployPlugins: boolean;
        };
    }

    export interface UndeployProfile extends Base {
        id: `${ProfileMessage.Prefix}:undeploy`;
        data: {
            profile: AppProfile;
        };
    }

    export interface FindDeployedProfile extends Base {
        id: `${ProfileMessage.Prefix}:findDeployedProfile`;
        data: {
            refProfile: AppProfile;
        };
        result?: string;
    }

    export interface FindProfileExternalFiles extends Base {
        id: `${ProfileMessage.Prefix}:findExternalFiles`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.ExternalFiles;
    }

    export interface CalculateModOverwriteFilesStart extends Base {
        id: `${ProfileMessage.Prefix}:calculateModOverwriteFilesStart`;
        data: {
            profile: AppProfile | AppBaseProfile;
            root: boolean;
            nonce: number;
        };
    }

    export interface CalculateModOverwriteFilesUpdate extends Base {
        id: `${ProfileMessage.Prefix}:calculateModOverwriteFilesUpdate`;
        data: {
            profile: AppProfile | AppBaseProfile;
            root: boolean;
            nonce: number;
            overwriteFiles: ModOverwriteFiles;
            completed: boolean;
        };
    }

    export interface ShowModInFileExplorer extends Base {
        id: `${ProfileMessage.Prefix}:showModInFileExplorer`;
        data: {
            profile: AppProfile;
            modName: string;
            modRef: ModProfileRef;
        };
    }

    export interface ShowProfileDirInFileExplorer extends Base {
        id: `${ProfileMessage.Prefix}:showProfileDirInFileExplorer`;
        data: {
            profile: AppProfile;
            profileKey: keyof AppProfile | keyof GameInstallation;
        };
    }

    export interface ShowProfileModOrderBackupsInFileExplorer extends Base {
        id: `${ProfileMessage.Prefix}:showProfileModOrderBackupsInFileExplorer`;
        data: {
            profile: AppProfile;
        };
    }

    export interface ShowProfilePluginBackupsInFileExplorer extends Base {
        id: `${ProfileMessage.Prefix}:showProfilePluginBackupsInFileExplorer`;
        data: {
            profile: AppProfile;
        };
    }

    export interface ShowProfileConfigBackupsInFileExplorer extends Base {
        id: `${ProfileMessage.Prefix}:showProfileConfigBackupsInFileExplorer`;
        data: {
            profile: AppProfile;
        };
    }

    export interface RunGameAction extends Base {
        id: `${ProfileMessage.Prefix}:runGameAction`;
        data: {
            profile: AppProfile;
            gameAction: GameAction;
        };
    }

    export interface AddGameActionToSteam extends Base {
        id: `${ProfileMessage.Prefix}:addGameActionToSteam`;
        data: {
            profile: AppProfile;
            steamUserId: string;
            gameAction: GameAction;
            protonCompatDataRoot?: string;
        };
        result: string;
    }

    export interface ResolveDefaultGameActions extends Base {
        id: `${ProfileMessage.Prefix}:resolveDefaultGameActions`;
        data: {
            profile: AppProfile;
        };
        result: GameAction[];
    }

    export interface OpenProfileConfigFile extends Base {
        id: `${ProfileMessage.Prefix}:openProfileConfigFile`;
        data: {
            profile: AppProfile;
            configFileName: string;
            includeGameFiles?: boolean;
        };
    }

    export interface DeleteProfileConfigFile extends Base {
        id: `${ProfileMessage.Prefix}:deleteProfileConfigFile`;
        data: {
            profile: AppProfile;
            configFileName: string;
        };
        result: AppProfile;
    }

    export interface ReadConfigFile extends Base {
        id: `${ProfileMessage.Prefix}:readConfigFile`;
        data: {
            profile: AppBaseProfile;
            fileName: string;
            loadDefaults: boolean;
        };
        result: string;
    }

    export interface ReadSaveFiles extends Base {
        id: `${ProfileMessage.Prefix}:readSaveFiles`;
        data: {
            profile: AppProfile;
        };
        result: AppProfile.Save[];
    }

    export interface UpdateConfigFile extends Base {
        id: `${ProfileMessage.Prefix}:updateConfigFile`;
        data: {
            profile: AppProfile;
            fileName: string;
            data: string;
        };
    }

    export interface DeleteSaveFile extends Base {
        id: `${ProfileMessage.Prefix}:deleteSaveFile`;
        data: {
            profile: AppProfile;
            save: AppProfile.Save;
        };
    }

    export interface ProfileDirLinkSupported extends Base {
        id: `${ProfileMessage.Prefix}:dirLinkSupported`;
        data: {
            profile: AppProfile;
            srcDir: keyof AppProfile;
            destDirs: Array<keyof AppProfile | keyof GameInstallation>;
            symlink: boolean;
            symlinkType?: "file" | "dir" | "junction";
            checkBaseProfile?: boolean;
        };
        result: boolean | undefined;
    }

    export interface NormalizePathCasingRecommended extends Base {
        id: `${ProfileMessage.Prefix}:normalizePathCasingRecommended`;
        data: {
            profile: AppProfile;
        };
        result: boolean;
    }

    export interface ResolveGameSteamCompatRoot extends Base {
        id: `${ProfileMessage.Prefix}:resolveGameSteamCompatRoot`;
        data: {
            profile: AppProfile;
        };
        result: string | undefined;
    }

    export interface SteamCompatSymlinksSupported extends Base {
        id: `${ProfileMessage.Prefix}:steamCompatSymlinksSupported`;
        data: {
            profile: AppProfile;
        };
        result: boolean;
    }

    export interface ResolveGameBinaryVersion extends Base {
        id: `${ProfileMessage.Prefix}:resolveGameBinaryVersion`;
        data: {
            profile: AppProfile;
        };
        result?: string;
    }

    export interface ToggleLockState extends Base {
        id: `${ProfileMessage.Prefix}:toggleLockState`;
    }

    export type ProfileMessage = ResolveProfilePath
                               | MoveProfileFolder
                               | ProfileSettings
                               | BeginModAdd
                               | BeginModExternalImport
                               | CompleteModImport
                               | AddModSection
                               | DeleteProfileMod
                               | RenameProfileMod
                               | ReadProfileModFilePaths
                               | ReadDataSubdirs
                               | FindPluginFiles
                               | FindModFiles
                               | ImportProfileModOrderBackup
                               | CreateProfileModOrderBackup
                               | ReadProfileModOrderBackups
                               | DeleteProfileModOrderBackup
                               | ImportProfilePluginBackup
                               | CreateProfilePluginBackup
                               | DeleteProfilePluginBackup
                               | ReadProfilePluginBackups
                               | ImportProfileConfigBackup
                               | CreateProfileConfigBackup
                               | ReadProfileConfigBackups
                               | DeleteProfileConfigBackup
                               | ExportProfilePluginList
                               | CheckArchiveInvalidationEnabled
                               | SetArchiveInvalidationEnabled
                               | DeployProfile
                               | UndeployProfile
                               | FindDeployedProfile
                               | FindProfileExternalFiles
                               | CalculateModOverwriteFilesStart
                               | CalculateModOverwriteFilesUpdate
                               | ShowModInFileExplorer
                               | ShowProfileDirInFileExplorer
                               | ShowProfileModOrderBackupsInFileExplorer
                               | ShowProfilePluginBackupsInFileExplorer
                               | ShowProfileConfigBackupsInFileExplorer
                               | RunGameAction
                               | AddGameActionToSteam
                               | ResolveDefaultGameActions
                               | OpenProfileConfigFile
                               | DeleteProfileConfigFile
                               | ReadConfigFile
                               | ReadSaveFiles
                               | UpdateConfigFile
                               | DeleteSaveFile
                               | ProfileDirLinkSupported
                               | NormalizePathCasingRecommended
                               | ResolveGameSteamCompatRoot
                               | SteamCompatSymlinksSupported
                               | ResolveGameBinaryVersion
                               | ToggleLockState;

    // Message record:

    export const record: Array<_AppMessage["id"]> = [
        "app:exit",
        "app:log",
        "app:getPlatform",
        "app:getInfo",
        "app:checkLatestVersion",
        "app:syncUiState",
        "app:chooseDirectory",
        "app:chooseFilePath",
        "app:verifyPathExists",
        "app:verify7ZipExists",
        "app:openFile",
        "app:loadProfileList",
        "app:loadSettings",
        "app:saveSettings",
        "app:exportGame",
        "app:readGame",
        "app:newProfile",
        "app:importProfile",
        "app:exportProfile",
        "app:deleteProfile",
        "app:loadProfile",
        "app:loadExternalProfile",
        "app:saveProfile",
        "app:copyProfile",
        "app:verifyProfile",
        "app:showPreferences",
        "app:showManageGames",
        "app:loadGameDatabase",
        "app:findGameInstallations",
        "app:findGameInstallationsByRootDir",
        "app:showAboutInfo",
        "app:showSupportInfo",
        "app:toggleModListColumn",
        "app:toggleLogPanel",
        "app:checkLinkSupported",
        "app:resolveResourceUrl",
        "app:queryWarnings",
        "app:getActiveSteamUserIds",

        "profile:resolvePath",
        "profile:moveFolder",
        "profile:settings",
        "profile:beginModAdd",
        "profile:beginModExternalImport",
        "profile:completeModImport",
        "profile:addModSection",
        "profile:deleteMod",
        "profile:renameMod",
        "profile:readModFilePaths",
        "profile:readDataSubdirs",
        "profile:findPluginFiles",
        "profile:findModFiles",
        "profile:importModOrderBackup",
        "profile:createModOrderBackup",
        "profile:readModOrderBackups",
        "profile:deleteModOrderBackup",
        "profile:importPluginBackup",
        "profile:createPluginBackup",
        "profile:deletePluginBackup",
        "profile:readPluginBackups",
        "profile:importConfigBackup",
        "profile:createConfigBackup",
        "profile:readConfigBackups",
        "profile:deleteConfigBackup",
        "profile:exportPluginList",
        "profile:checkArchiveInvalidationEnabled",
        "profile:setArchiveInvalidationEnabled",
        "profile:deploy",
        "profile:undeploy",
        "profile:findDeployedProfile",
        "profile:findExternalFiles",
        "profile:calculateModOverwriteFilesStart",
        "profile:calculateModOverwriteFilesUpdate",
        "profile:showModInFileExplorer",
        "profile:showProfileDirInFileExplorer",
        "profile:showProfileModOrderBackupsInFileExplorer",
        "profile:showProfilePluginBackupsInFileExplorer",
        "profile:showProfileConfigBackupsInFileExplorer",
        "profile:runGameAction",
        "profile:addGameActionToSteam",
        "profile:resolveDefaultGameActions",
        "profile:openProfileConfigFile",
        "profile:deleteProfileConfigFile",
        "profile:readConfigFile",
        "profile:readSaveFiles",
        "profile:updateConfigFile",
        "profile:deleteSaveFile",
        "profile:dirLinkSupported",
        "profile:normalizePathCasingRecommended",
        "profile:resolveGameSteamCompatRoot",
        "profile:steamCompatSymlinksSupported",
        "profile:resolveGameBinaryVersion",
        "profile:toggleLockState"
    ];
}