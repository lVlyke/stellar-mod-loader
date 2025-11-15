import type { AppBaseProfile, AppProfile } from "../../app/models/app-profile";
import type { GameInstallation } from "../../app/models/game-installation";
import type { ModProfileRef } from "../../app/models/mod-profile-ref";
import type { ModDeploymentMetadata } from "../../app/models/mod-deployment-metadata";
import type { GamePluginProfileRef } from "../../app/models/game-plugin-profile-ref";
import type { GameAction } from "../../app/models/game-action";

import * as log from "electron-log/main";
import { isNotNil, omit, orderBy, last } from "es-toolkit";
import { template } from "es-toolkit/compat";

const path = require("path") as typeof import("path");
const { exec } = require("child_process") as typeof import("child_process");
const fs = require("fs-extra") as typeof import("fs-extra");

import type { ElectronApp } from "../app";
import type { AppDataManager } from "./app-data-manager";
import { AppConstants } from "../constants";
import { PathUtils, SymlinkType } from "../util/path-utils";
import { SteamUtils } from "../util/steam-utils";

export class ProfileDataManager {

    constructor(
        private readonly app: ElectronApp
    ) {}

    private get appDataManager(): AppDataManager {
        return this.app.appDataManager;
    }

    public getDefaultProfileDir(profileNameOrPath: string): string {
        return path.isAbsolute(profileNameOrPath)
            ? profileNameOrPath
            : PathUtils.expandPath(path.join(AppConstants.APP_PROFILES_DIR, profileNameOrPath));
    }

    public getProfileDir(profile: AppProfile | AppBaseProfile): string {
        return profile.rootPathOverride ?? this.getDefaultProfileDir(profile.name);
    }

    public getProfileConfigDir(profile: AppProfile | AppBaseProfile): string {
        return isNotNil(profile.configPathOverride)
            ? this.resolveFullProfileDir(profile, profile.configPathOverride)
            : path.join(this.getProfileDir(profile), AppConstants.PROFILE_CONFIG_DIR);
    }

    public getProfileSaveDir(profile: AppProfile | AppBaseProfile): string {
        return isNotNil(profile.savesPathOverride)
            ? this.resolveFullProfileDir(profile, profile.savesPathOverride)
            : path.join(this.getProfileDir(profile), AppConstants.PROFILE_SAVE_DIR);
    }

    public getProfileModsDir(profile: AppProfile | AppBaseProfile): string {
        return isNotNil(profile.modsPathOverride)
            ? this.resolveFullProfileDir(profile, profile.modsPathOverride)
            : path.join(this.getProfileDir(profile), AppConstants.PROFILE_MODS_DIR);
    }

    public getProfileTmpDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(this.getProfileDir(profile), AppConstants.PROFILE_MODS_STAGING_DIR);
    }

    public getProfileOwnModDir(profile: AppProfile | AppBaseProfile, modName: string): string {
        return path.join(this.getProfileModsDir(profile), modName);
    }

    public getProfileModDir(profile: AppProfile | AppBaseProfile, modName: string, modRef: ModProfileRef): string {
        const modProfile = (modRef.baseProfile && "baseProfile" in profile && profile.baseProfile)
            ? profile.baseProfile
            : profile;
        return this.getProfileOwnModDir(modProfile, modName);
    }

    public getProfileBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return profile.backupsPathOverride !== undefined
            ? this.resolveFullProfileDir(profile, profile.backupsPathOverride)
            : path.join(this.getProfileDir(profile), AppConstants.PROFILE_BACKUPS_DIR);
    }

    public getProfileModOrderBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(
            this.getProfileBackupsDir(profile),
            AppConstants.PROFILE_BACKUPS_MOD_ORDER_DIR
        );
    }

    public getProfilePluginBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(
            this.getProfileBackupsDir(profile),
            AppConstants.PROFILE_BACKUPS_PLUGINS_DIR
        );
    }

    public getProfileConfigBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(
            this.getProfileBackupsDir(profile),
            AppConstants.PROFILE_BACKUPS_CONFIG_DIR
        );
    }

    public getProfileDirByKey(
        profile: AppProfile | AppBaseProfile,
        pathKey: keyof AppProfile | keyof GameInstallation
    ): string | undefined {
        switch (pathKey) {
            case "modDir": return "gameInstallation" in profile && !!profile.gameInstallation
                ? profile.gameInstallation.modDir
                : undefined;
            case "rootDir": return "gameInstallation" in profile && !!profile.gameInstallation
                ? profile.gameInstallation.rootDir
                : undefined;
            case "configFilePath": return "gameInstallation" in profile && !!profile.gameInstallation
                ? profile.gameInstallation.configFilePath
                : undefined;
            case "saveFolderPath": return "gameInstallation" in profile && !!profile.gameInstallation
                ? profile.gameInstallation.saveFolderPath
                : undefined;
            case "rootPathOverride": return this.getProfileDir(profile);
            case "modsPathOverride": return this.getProfileModsDir(profile);
            case "savesPathOverride": return this.getProfileSaveDir(profile);
            case "configPathOverride": return this.getProfileConfigDir(profile);
            case "backupsPathOverride": return this.getProfileBackupsDir(profile);
            default: throw new Error("Invalid profile path key");
        }
    }

    public loadProfile(profileNameOrPath: string): AppProfile | AppBaseProfile | null {
        return this.loadProfileFromPath(profileNameOrPath, this.getDefaultProfileDir(profileNameOrPath));
    }

    public loadProfileFromPath(profileName: string, profilePath: string): AppProfile | AppBaseProfile | null {
        const profileSettingsName = AppConstants.PROFILE_SETTINGS_FILE;
        const profileSettingsPath = path.join(profilePath, profileSettingsName);

        if (!fs.existsSync(profileSettingsPath)) {
            return null;
        }

        const profileSrc = fs.readFileSync(profileSettingsPath);
        const profile = JSON.parse(profileSrc.toString("utf8"));

        // Add profile name to profile
        profile.name = profileName;

        // Ensure mod lists exist
        profile.mods ??= [];
        profile.rootMods ??= [];

        // Ensure default actions exist
        profile.defaultGameActions ??= [];

        // Resolve profile's `rootPathOverride` if applicable
        const realProfilePath = fs.realpathSync(profilePath);
        if (path.resolve(realProfilePath) !== path.resolve(profilePath)) {
            profile.rootPathOverride = realProfilePath;
        }

        // BC: <0.10.0
        {
            if ("gameBaseDir" in profile) {
                profile.gameRootDir = profile.gameBaseDir;
                delete profile.gameBaseDir;
            }

            if ("modBaseDir" in profile) {
                profile.gameModDir = profile.modBaseDir;
                delete profile.modBaseDir;
            }

            if ("pluginListPath" in profile) {
                profile.gamePluginListPath = profile.pluginListPath;
                delete profile.pluginListPath;
            }

            if ("configFilePath" in profile) {
                profile.gameConfigFilePath = profile.configFilePath;
                delete profile.configFilePath;
            }

            if ("saveFolderPath" in profile) {
                profile.gameSaveFolderPath = profile.saveFolderPath;
                delete profile.saveFolderPath;
            }

            if ("linkMode" in profile) {
                profile.modLinkMode = profile.linkMode;
                delete profile.linkMode;
            }
        }

        // BC: <0.11.0
        if ("gameRootDir" in profile)
        {
            profile.gameInstallation = {};

            if ("gameRootDir" in profile) {
                profile.gameInstallation.rootDir = profile.gameRootDir;
                delete profile.gameRootDir;
            }

            if ("gameModDir" in profile) {
                profile.gameInstallation.modDir = profile.gameModDir;
                delete profile.gameModDir;
            }

            if ("gamePluginListPath" in profile) {
                profile.gameInstallation.pluginListPath = profile.gamePluginListPath;
                delete profile.gamePluginListPath;
            }

            if ("gameConfigFilePath" in profile) {
                profile.gameInstallation.configFilePath = profile.gameConfigFilePath;
                delete profile.gameConfigFilePath;
            }

            if ("gameSaveFolderPath" in profile) {
                profile.gameInstallation.saveFolderPath = profile.gameSaveFolderPath;
                delete profile.gameSaveFolderPath;
            }

            if ("steamGameId" in profile) {
                profile.steamCustomGameId = profile.steamGameId;
                delete profile.steamGameId;

                // Restore the steamId for this profile to preserve symlink compat management
                if (profile.manageSteamCompatSymlinks) {
                    const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
                    if (!!gameDetails) {
                        profile.gameInstallation.steamId = gameDetails.installations
                            .map(installation => installation.steamId)
                            .find(Boolean);
                    }
                }
            }

            if ("gameBinaryPath" in profile) {
                delete profile.gameBinaryPath;
            }
        }

        // BC: <0.14.0
        {
            if (this.appDataManager.loadSettings()?.normalizePathCasing) {
                profile.normalizePathCasing = true;
            }
        }

        // BC: <0.14.0
        {
            const actionSources = [
                profile.defaultGameActions,
                profile.customGameActions ?? [],
                profile.activeGameAction ? [profile.activeGameAction] : []
            ];

            for (const gameActionSource of actionSources) {
                for (const gameAction of gameActionSource) {
                    // Convert `actionScript` to new `GameAction` format
                    if (gameAction.actionScript !== undefined) {
                        gameAction.actionType = "script";
                        gameAction.actionData = gameAction.actionScript;
                        delete gameAction.actionScript;
                    }
                }
            }
        }

        if (profile.baseProfile) {
            // TODO - Allow loading base profile from custom path?
            profile.baseProfile = this.loadProfileFromPath(profile.baseProfile, this.getDefaultProfileDir(profile.baseProfile));
        }

        // Check if profile is deployed
        if ("gameInstallation" in profile) {
            // Update deployment status
            profile.deployed = this.isProfileDeployed(profile);
        }

        return profile;
    }

    public saveProfile(profile: AppProfile, options = undefined): void {
        const profileDir = this.getProfileDir(profile);
        const defaultProfileDir = this.getDefaultProfileDir(profile.name);
        const profileSettingsName = AppConstants.PROFILE_SETTINGS_FILE;
        const profileToWrite = Object.assign({}, profile, { baseProfile: profile.baseProfile?.name });

        // Make sure the profile and mods directory exists
        fs.mkdirpSync(this.getProfileModsDir(profile));

        // If the profile root has been overridden, create a symlink to the profile at the default path
        if (defaultProfileDir !== profileDir) {
            if (!fs.existsSync(defaultProfileDir)) {
                fs.ensureSymlinkSync(path.resolve(profileDir), path.resolve(defaultProfileDir), "dir");
            }
        }

        const PROFILE_RUNTIME_PROPERTIES: Array<keyof AppProfile> = [
            "name",
            "rootPathOverride"
        ];

        return fs.writeFileSync(
            path.join(profileDir, profileSettingsName),
            JSON.stringify(omit(profileToWrite, PROFILE_RUNTIME_PROPERTIES)),
            options
        );
    }

    public deleteProfile(profile: AppProfile): void {
        const profileDir = this.getProfileDir(profile);
        const defaultProfileDir = this.getDefaultProfileDir(profile.name);

        if (defaultProfileDir !== profileDir) {
            if (fs.existsSync(defaultProfileDir)) {
                fs.removeSync(defaultProfileDir);
            }
        }

        return fs.rmSync(profileDir, { recursive: true });
    }

    public readProfileConfigFile(
        profile: AppProfile | AppBaseProfile,
        fileName: string,
        loadDefaults: boolean
    ): string | undefined {
        const profileConfigDir = this.getProfileConfigDir(profile);
        let profileConfigFilePath = path.join(profileConfigDir, fileName);
        
        if (!fs.existsSync(profileConfigFilePath)) {
            // Attempt to load default config values if profile file doesn't exist yet
            if (loadDefaults) {
                const defaultConfigFilePath = this.resolveGameConfigFilePath(profile, fileName, true);
                if (defaultConfigFilePath !== undefined && fs.existsSync(defaultConfigFilePath)) {
                    return fs.readFileSync(defaultConfigFilePath, "utf8");
                }
            }

            return undefined;
        }

        return fs.readFileSync(profileConfigFilePath, "utf8");
    }

    public readProfileSaveFiles(profile: AppProfile): AppProfile.Save[] {
        const profileSaveDir = this.getProfileSaveDir(profile);
        
        if (!fs.existsSync(profileSaveDir)) {
            return [];
        }

        const gameDb = this.appDataManager.loadGameDatabase();
        const gameDetails = gameDb[profile.gameId];
        const gameSaveFormats = gameDetails?.saveFormats ?? [];
        const saveFiles = fs.readdirSync(profileSaveDir)
            .filter(saveFileName => gameSaveFormats.some((saveFormat) => {
                return saveFileName.toLowerCase().endsWith(`.${saveFormat.toLowerCase()}`);
            }))
            .map((saveFileName) => ({
                name: path.parse(saveFileName).name,
                date: fs.statSync(path.join(profileSaveDir, saveFileName)).mtime
            }));
        
        return orderBy(saveFiles, ["date"], ["desc"]);
    }

    public updateProfileConfigFile(profile: AppProfile, fileName: string, data?: string): void {
        const profileConfigDir = this.getProfileConfigDir(profile);
        const profileConfigFilePath = path.join(profileConfigDir, fileName);
        
        fs.mkdirpSync(profileConfigDir);
        fs.writeFileSync(profileConfigFilePath, data ?? "", "utf8");
    }

    public deleteProfileSaveFile(profile: AppProfile, save: AppProfile.Save): boolean {
        const profileSaveDir = this.getProfileSaveDir(profile);
        
        if (!fs.existsSync(profileSaveDir)) {
            return false;
        }

        const saveFiles = fs.readdirSync(profileSaveDir);
        let result = false;
        for (const saveFile of saveFiles) {
            const saveFileName = path.parse(saveFile).name;
            if (saveFileName === save.name) {
                try {
                    fs.rmSync(path.join(profileSaveDir, saveFile));
                    result = true;
                } catch (err) {
                    log.error(`Failed to delete save file "${saveFile}": `, err);
                    return false;
                }
            }
        }

        log.info(`Deleted save file "${save.name}".`);
        return result;
    }

    public importProfileModOrderBackup(profile: AppProfile, backupPath: string): AppProfile {
        backupPath = PathUtils.expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileModOrderBackupsDir(profile), backupPath);
        }

        if (!fs.existsSync(backupPath)) {
            throw new Error("Invalid backup path.");
        }

        const modOrderBackup: AppProfile.ModOrderBackup = fs.readJSONSync(backupPath);

        if (!(typeof modOrderBackup === "object")) {
            throw new Error("Invalid backup.");
        }

        const modListKeys: Array<keyof AppProfile & ("mods" | "rootMods")> = ["mods", "rootMods"];
        modListKeys.forEach((modListKey) => {
            const modListBackup: AppProfile.ModOrderBackupEntry[] = modOrderBackup[modListKey];
            const modList: AppProfile.ModList = profile[modListKey];

            // Only restore mods that already exist in the current mod list
            const restoredMods = modListBackup.reduce((restoredMods, modBackup) => {
                const existingMod = modList.find(([modName]) => modName === modBackup.name);
                if (existingMod) {
                    // Restore enabled state if mod is not from a base profile
                    if (!existingMod[1].baseProfile) {
                        existingMod[1].enabled = modBackup.enabled;
                    }
                    restoredMods.push(existingMod);
                }

                return restoredMods;
            }, [] as AppProfile.ModList);

            // Move any existing mods that weren't in the backup to the bottom of the load order
            restoredMods.push(...modList.filter(([modName]) => !restoredMods.some(([restoredModName]) => {
                return modName === restoredModName;
            })));

            // Update the profile's mod list
            Object.assign(profile, { [modListKey]: restoredMods });
        });

        const sectionListKeys: Array<keyof AppProfile & ("modSections" | "rootModSections")> = ["modSections", "rootModSections"];
        sectionListKeys.forEach((sectionListKey) => {
            const root = sectionListKey === "rootModSections";
            const sectionsBackup = modOrderBackup[sectionListKey];
            const modList = root ? profile.rootMods : profile.mods;

            if (sectionsBackup) {
                // Overwrite profile sections with sections from backup
                profile[sectionListKey] = sectionsBackup?.map((sectionBackup) => ({
                    name: sectionBackup.name,
                    modIndexBefore: sectionBackup.modBefore
                        ? modList.findIndex(([modName]) => modName === sectionBackup.modBefore)
                        : undefined,
                    iconName: sectionBackup.iconName
                }));
            } else {
                // TODO - Delete all existing sections if none in backup?
            }
        });

        return profile;
    }

    public importProfilePluginBackup(profile: AppProfile, backupPath: string): AppProfile {
        backupPath = PathUtils.expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfilePluginBackupsDir(profile), backupPath);
        }

        if (!fs.existsSync(backupPath)) {
            throw new Error("Invalid backup path.");
        }

        const pluginsBackup: AppProfile["plugins"] = fs.readJSONSync(backupPath);

        if (!Array.isArray(pluginsBackup)) {
            throw new Error("Invalid backup.");
        }

        // Only import plugins that already exist in the current plugin list
        const restoredPlugins = pluginsBackup.filter((restoredPlugin) => profile.plugins.some((existingPlugin) => {
            if (existingPlugin.plugin !== restoredPlugin.plugin) {
                return false;
            }

            // If plugin name matches but not mod ID, use the mod ID of the existing profile mod
            if (existingPlugin.modId !== restoredPlugin.modId) {
                restoredPlugin.modId = existingPlugin.modId;
            }

            return true;
        }));

        // Move any existing plugins that weren't in the backup to the bottom of the load order
        restoredPlugins.push(...profile.plugins.filter((existingPlugin) => !restoredPlugins.some((restoredPlugin) => {
            return existingPlugin.plugin === restoredPlugin.plugin && existingPlugin.modId === restoredPlugin.modId;
        })));
        
        // Return the updated profile
        return Object.assign(profile, { plugins: restoredPlugins });
    }

    public importProfileConfigBackup(profile: AppProfile, backupPath: string): AppProfile {
        backupPath = PathUtils.expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileConfigBackupsDir(profile), backupPath);
        }

        if (!fs.existsSync(backupPath)) {
            throw new Error("Invalid backup.");
        }

        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        const gameConfigFiles = gameDetails?.gameConfigFiles ?? [];
        const configDir = this.getProfileConfigDir(profile);
        fs.mkdirpSync(configDir);

        // Restore all config files in the backup
        fs.readdirSync(backupPath).forEach((backupConfigFile) => {
            if (gameConfigFiles.includes(backupConfigFile)) {
                fs.copySync(
                    path.join(backupPath, backupConfigFile),
                    path.join(configDir, backupConfigFile),
                    { overwrite: true }
                );
            }
        });
        
        // Return the profile
        return profile;
    }

    public createProfileModOrderBackup(profile: AppProfile, backupName?: string): void {
        const backupsDir = this.getProfileModOrderBackupsDir(profile);
        const backupFileName = `${PathUtils.asFileName(backupName || PathUtils.currentDateTimeAsFileName())}.json`;

        fs.mkdirpSync(backupsDir);

        const modOrderBackup: AppProfile.ModOrderBackup = {
            rootMods: profile.rootMods.map(([name, { enabled }]) => ({ name, enabled })),
            mods: profile.mods.map(([name, { enabled }]) => ({ name, enabled })),
            rootModSections: profile.rootModSections?.map((section) => ({
                name: section.name,
                modBefore: (section.modIndexBefore !== undefined) ? profile.rootMods[section.modIndexBefore][0] : undefined,
                iconName: section.iconName
            })),
            modSections: profile.modSections?.map((section) => ({
                name: section.name,
                modBefore: (section.modIndexBefore !== undefined) ? profile.mods[section.modIndexBefore][0] : undefined,
                iconName: section.iconName
            }))
        };

        fs.writeJSONSync(
            path.join(backupsDir, backupFileName),
            modOrderBackup,
            { spaces: 4 }
        );
    }

    public createProfilePluginBackup(profile: AppProfile, backupName?: string): void {
        const backupsDir = this.getProfilePluginBackupsDir(profile);
        const backupFileName = `${PathUtils.asFileName(backupName || PathUtils.currentDateTimeAsFileName())}.json`;

        fs.mkdirpSync(backupsDir);

        fs.writeJSONSync(
            path.join(backupsDir, backupFileName),
            profile.plugins,
            { spaces: 4 }
        );
    }

    public createProfileConfigBackup(profile: AppProfile, backupName?: string): void {
        backupName = PathUtils.asFileName(backupName || PathUtils.currentDateTimeAsFileName());
        const backupsDir = this.getProfileConfigBackupsDir(profile);
        const backupDir = path.join(backupsDir, backupName);
        const profileConfigDir = this.getProfileConfigDir(profile);

        fs.mkdirpSync(backupDir);

        if (fs.existsSync(profileConfigDir)) {
            fs.readdirSync(profileConfigDir).forEach((configFileName) => {
                fs.copyFileSync(
                    path.join(profileConfigDir, configFileName),
                    path.join(backupDir, configFileName)
                );
            });
        }
    }

    public deleteProfileModOrderBackup(profile: AppProfile, backupPath: string): void {
        backupPath = PathUtils.expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileModOrderBackupsDir(profile), backupPath);
        }

        fs.rmSync(backupPath);
    }

    public deleteProfilePluginBackup(profile: AppProfile, backupPath: string): void {
        backupPath = PathUtils.expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfilePluginBackupsDir(profile), backupPath);
        }

        fs.rmSync(backupPath);
    }

    public deleteProfileConfigBackup(profile: AppProfile, backupPath: string): void {
        backupPath = PathUtils.expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileConfigBackupsDir(profile), backupPath);
        }

        fs.removeSync(backupPath);
    }

    public readProfileModOrderBackups(profile: AppProfile): AppProfile.BackupEntry[] {
        const backupsDir = this.getProfileModOrderBackupsDir(profile);

        if (!fs.existsSync(backupsDir)) {
            return [];
        }

        return orderBy(fs.readdirSync(backupsDir)
            .filter(filePath => filePath.endsWith(".json"))
            .map((filePath) => ({
                filePath,
                backupDate: fs.lstatSync(path.join(backupsDir, filePath)).mtime
            })), ["backupDate"], ["desc"]);
    }

    public readProfilePluginBackups(profile: AppProfile): AppProfile.BackupEntry[] {
        const backupsDir = this.getProfilePluginBackupsDir(profile);

        if (!fs.existsSync(backupsDir)) {
            return [];
        }

        return orderBy(fs.readdirSync(backupsDir)
            .filter(filePath => filePath.endsWith(".json"))
            .map((filePath) => ({
                filePath,
                backupDate: fs.lstatSync(path.join(backupsDir, filePath)).mtime
            })), ["backupDate"], ["desc"]);
    }

    public readProfileConfigBackups(profile: AppProfile): AppProfile.BackupEntry[] {
        const backupsDir = this.getProfileConfigBackupsDir(profile);

        if (!fs.existsSync(backupsDir)) {
            return [];
        }

        return orderBy(fs.readdirSync(backupsDir)
            .map((filePath) => ({
                filePath,
                backupDate: fs.lstatSync(path.join(backupsDir, filePath)).mtime
            })), ["backupDate"], ["desc"]);
    }

    public verifyProfilePathExists(pathToVerify: string): AppProfile.VerificationResult {
        const pathExists = fs.existsSync(PathUtils.expandPath(pathToVerify));
        return {
            error: !pathExists,
            found: pathExists
        };
    }

    public async findProfileExternalFilesInDir(
        profile: AppProfile,
        dirPath: string,
        recursiveSearch: boolean
    ): Promise<Array<string>> {
        dirPath = path.resolve(PathUtils.expandPath(dirPath));
        if (!fs.existsSync(dirPath)) {
            return [];
        }

        let modDirFiles = await fs.readdir(dirPath, { encoding: "utf-8", recursive: recursiveSearch });

        // Filter out directories and deployment metadata
        modDirFiles = modDirFiles.filter((file) => {
            return !fs.lstatSync(path.join(dirPath, file)).isDirectory()
                && !file.startsWith(AppConstants.DEPLOY_EXT_BACKUP_DIR)
                && file !== AppConstants.PROFILE_METADATA_FILE;
        });

        if (this.isSimilarProfileDeployed(profile)) {
            const profileModFiles = this.readProfileDeploymentMetadata(profile)?.profileModFiles.map((filePath) => {
                // Resolve absolute file paths relative to `dirPath`
                if (path.isAbsolute(filePath)) {
                    filePath = filePath.replace(`${dirPath}${path.sep}`, "");
                }

                return filePath.toLowerCase();
            });

            if (!profileModFiles) {
                throw new Error("Unable to read deployment metadata.");
            }
            
            // Filter deployed files
            modDirFiles = modDirFiles.filter(file => !profileModFiles.includes(file.toLowerCase()));
        }

        return modDirFiles;
    }

    public async findProfileExternalPluginFiles(profile: AppProfile): Promise<Array<string>> {
        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        let gamePluginDir = PathUtils.expandPath(profile.gameInstallation.modDir);

        if (gameDetails?.pluginDataRoot) {
            gamePluginDir = path.join(gamePluginDir, gameDetails.pluginDataRoot);
        }

        return (await this.findProfileExternalFilesInDir(profile, gamePluginDir, false))
            .filter((modFile) => {
                // Make sure this is a mod file
                return gameDetails?.pluginFormats.includes(last(modFile.split("."))?.toLowerCase() ?? "");
            })
            .sort((externalPluginA, externalPluginB) => {
                const externalPlugins = [externalPluginA, externalPluginB];
                const pinnedIndex = externalPlugins.map((externalPlugin) => {
                    const pinnedIndex = gameDetails?.pinnedPlugins?.findIndex(({ plugin }) => {
                        return externalPlugin.toLowerCase() === plugin.toLowerCase();
                    });

                    return pinnedIndex === -1 ? undefined : pinnedIndex;
                });

                // Determine if any of the plugins are pinned and if so, use the pinned order
                if (pinnedIndex[0] !== undefined && pinnedIndex[1] !== undefined) {
                    return pinnedIndex[0] - pinnedIndex[1];
                } else if (pinnedIndex[0] !== undefined) {
                    return -1;
                } else if (pinnedIndex[1] !== undefined) {
                    return 1;
                } else {
                    // Order plugin by file's "last modified" timestamp
                    const fileTime = externalPlugins.map((externalPlugin) => {
                        return fs.statSync(path.join(gamePluginDir, externalPlugin)).mtime;
                    });

                    if (fileTime[0] < fileTime[1]) {
                        return -1;
                    } else if (fileTime[0] > fileTime[1]) {
                        return 1;
                    }
                }

                return 0;
            });
    }

    public async findProfileExternalFiles(profile: AppProfile): Promise<AppProfile.ExternalFiles> {
        if (!!profile.gameInstallation) {
            // Scan game dir for external files
            return {
                modDirFiles: await this.findProfileExternalFilesInDir(profile, profile.gameInstallation.modDir, true),
                gameDirFiles: await this.findProfileExternalFilesInDir(profile, profile.gameInstallation.rootDir, false),
                pluginFiles: await this.findProfileExternalPluginFiles(profile)
            };
        } else {
            // Use default plugin list from game db
            const gameDb = this.appDataManager.loadGameDatabase();
            const gameDetails = gameDb[profile.gameId];
            const defaultPlugins = (gameDetails?.pinnedPlugins ?? []).map(pinnedPlugin => pinnedPlugin.plugin);
            return {
                modDirFiles: [],
                gameDirFiles: [],
                pluginFiles: defaultPlugins
            }
        }
    }

    public readModFilePaths(
        profile: AppProfile,
        modName: string,
        modRef: ModProfileRef,
        normalizePaths?: boolean
    ): string[] {
        const modDirPath = this.getProfileModDir(profile, modName, modRef);
        if (!fs.existsSync(modDirPath)) {
            return [];
        }

        let files = fs.readdirSync(modDirPath, { encoding: "utf-8", recursive: true });

        if (normalizePaths) {
            files = files.map(file => PathUtils.expandPath(file));
        }

        return files;
    }

    public resolveDefaultGameActions(profile: AppProfile): GameAction[] {
        if (!profile.gameInstallation) {
            return [];
        }

        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        const modsToSearch = profile.rootMods;
        const gameRootDir = path.resolve(profile.gameInstallation.rootDir);

        if (path.resolve(profile.gameInstallation.modDir) === gameRootDir) {
            modsToSearch.push(...profile.mods);
        }

        // Find available game binaries and add them as actions
        return gameDetails?.gameBinary.slice().reverse().reduce((gameActions, gameBinary) => {
            let binaryExists = !!profile.externalFilesCache?.gameDirFiles?.some((externalFile) => {
                return externalFile.endsWith(gameBinary);
            });

            binaryExists ||= profile.rootMods.some(([modName, modRef]) => {
                if (!modRef.enabled) {
                    return false;
                }

                const modFiles = this.readModFilePaths(profile, modName, modRef, true);
                return modFiles.some((modFile) => {
                    return modFile.endsWith(gameBinary);
                })
            });
    
            if (binaryExists) {
                if (profile.gameInstallation.steamId && gameBinary === gameDetails.gameBinary[0]) {
                    gameActions.push({
                        name: `Start ${path.parse(gameBinary).name}`,
                        actionType: "steam_app",
                        actionData: profile.gameInstallation.steamId[0]
                    });
                } else {
                    // Check if this binary requires Proton to run on Linux
                    const needsProton = process.platform === "linux" && gameBinary.toLowerCase().endsWith(".exe");

                    gameActions.push({
                        name: `Start ${path.parse(gameBinary).name}`,
                        actionType: "script",
                        actionData: path.join(gameRootDir, gameBinary),
                        requiresSteam: needsProton
                    });
                }
            }

            return gameActions;
        }, [] as GameAction[]) ?? [];
    }

    public resolveGameConfigFilePath(
        profile: AppProfile | AppBaseProfile | AppProfile.Form,
        configFileName: string,
        includeGameFiles: boolean
    ): string | undefined {
        if ("manageConfigFiles" in profile && profile.manageConfigFiles) {
            const profileConfigFilePath = path.join(this.getProfileConfigDir(profile), configFileName);

            if (fs.existsSync(profileConfigFilePath)) {
                return profileConfigFilePath;
            }
        }

        if ("baseProfile" in profile && !!profile.baseProfile) {
            let baseProfile;
            if (typeof profile.baseProfile === "string") {
                baseProfile = this.loadProfile(profile.baseProfile);
            } else {
                baseProfile = profile.baseProfile;
            }

            if (!!baseProfile) {
                const configFilePath = this.resolveGameConfigFilePath(baseProfile, configFileName, false);
                if (configFilePath !== undefined && fs.existsSync(configFilePath)) {
                    return configFilePath;
                }
            }
        }

        if (includeGameFiles && "gameInstallation" in profile) {
            return path.join(profile.gameInstallation.configFilePath, configFileName);
        }

        return undefined;
    }

    public async checkArchiveInvalidationEnabled(profile: AppProfile | AppBaseProfile | AppProfile.Form): Promise<boolean> {
        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        if (!gameDetails) {
            return false;
        }

        const archiveInvalidationConfig: [string, string][] = Object.entries(gameDetails.archiveInvalidation ?? {});

        for (let [configFileName, configInvalidationString] of archiveInvalidationConfig) {
            const configFilePath = this.resolveGameConfigFilePath(profile, configFileName, true);

            if (!configFilePath || !fs.existsSync(configFilePath)) {
                continue;
            }

            configInvalidationString = configInvalidationString.trim().replace(/\r/g, "");
            const configFileData = fs.readFileSync(configFilePath, { encoding: "utf-8" }).trim().replace(/\r/g, "");
            if (configFileData.includes(configInvalidationString)) {
                return true;
            }
        }

        return false;
    }

    public async setArchiveInvalidationEnabled(profile: AppProfile, enabled: boolean): Promise<void> {
        if (await this.checkArchiveInvalidationEnabled(profile) === enabled) {
            return;
        }

        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        if (!gameDetails) {
            throw new Error("Game does not support archive invalidation.");
        }

        const archiveInvalidationConfig = Object.entries(gameDetails.archiveInvalidation ?? {});

        for (const [configFileName, configData] of archiveInvalidationConfig) {
            const configFilePath = this.resolveGameConfigFilePath(profile, configFileName, true);

            if (!configFilePath || !fs.existsSync(configFilePath)) {
                continue;
            }

            let configFileData = fs.readFileSync(configFilePath, { encoding: "utf-8" });

            if (!configFileData.includes(configData) && enabled) {
                configFileData = configData + configFileData;
            } else if (configFileData.includes(configData) && !enabled) {
                configFileData = configFileData.replace(configData, "");
            }

            fs.writeFileSync(configFilePath, configFileData, { encoding: "utf-8" });
        }
    }
    
    public findPluginFiles(profile: AppProfile): GamePluginProfileRef[] {
        const gameDb = this.appDataManager.loadGameDatabase();
        const gameDetails = gameDb[profile.gameId];
        const gamePluginFormats = gameDetails?.pluginFormats ?? [];

        return profile.mods
            .filter(mod => mod[1].enabled)
            .reduce((plugins, [modId, modRef]) => {
                let pluginDirPath = this.getProfileModDir(profile, modId, modRef);

                if (gameDetails.pluginDataRoot) {
                    pluginDirPath = path.join(pluginDirPath, gameDetails.pluginDataRoot);
                }
                
                if (fs.existsSync(pluginDirPath)) {
                    const pluginFiles = fs.readdirSync(pluginDirPath, { encoding: "utf-8", recursive: false });
                    const modPlugins = pluginFiles
                        .filter((pluginFile) => gamePluginFormats.some((gamePluginFormat) => {
                            return pluginFile.toLowerCase().endsWith(`.${gamePluginFormat}`);
                        }))
                        .filter((pluginFile) => fs.lstatSync(path.join(pluginDirPath, pluginFile)).isFile())
                        .map((pluginFile) => ({
                            modId,
                            plugin: pluginFile,
                            enabled: modRef.enabled
                        }));

                    plugins.push(...modPlugins);
                }

                return plugins;
            }, [] as GamePluginProfileRef[]);
    }

    public findModFiles(profile: AppProfile): AppProfile.ModList {
        const profileModsDir = this.getProfileModsDir(profile);

        if (!fs.existsSync(profileModsDir)) {
            return [];
        }

        const profileModDirs = fs.readdirSync(profileModsDir);
        return profileModDirs.map(modName => [modName, { enabled: true }]);
    }

    public runGameAction(profile: AppProfile, gameAction: GameAction): boolean {
        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);

        // Create action command string:
        let gameActionCmd: string;
        switch (gameAction.actionType) {
            case "script": {
                // Substitute variables for profile
                gameActionCmd = template(gameAction.actionData)({ ...profile, gameDetails });
            } break;
            case "steam_app": {
                // Launch the game using the given Steam App ID
                gameActionCmd = `"${SteamUtils.getSteamBinaryPath()}" steam://launch/${gameAction.actionData}`;
            } break;
            default: throw new Error("Unknown GameActionType.");
        }
        
        // Apply environment variables:
        let envDict: Record<string, string | undefined> = { ...process.env };
        if (gameAction.environment) {
            envDict = gameAction.environment
                .filter(envVar => envVar.enabled)
                .reduce<Record<string, string | undefined>>(
                    (envDict, envVar) => (envDict[envVar.key] = envVar.value, envDict),
                    envDict
                );
        }

        log.info("Running game action: ", gameActionCmd);
        
        // Run the action
        try {
            exec(gameActionCmd, {
                cwd: profile.gameInstallation.rootDir,
                env: envDict
            });
        } catch(error) {
            log.error(error);
            return false;
        }

        return true;
    }

    /**
     * @returns The 64-bit game ID of the shortcut
     */
    public addGameActionToSteam(
        profile: AppProfile,
        steamUserId: string,
        gameAction: GameAction,
        protonCompatDataRoot?: string
    ): string {
        const steamUserShortcutsDb = SteamUtils.loadUserShortcuts(steamUserId);

        if (!steamUserShortcutsDb) {
            throw new Error(`Unable to find shortcuts for Steam ID: ${steamUserId}`);
        }

        const steamUserShortcuts = steamUserShortcutsDb["shortcuts"];

        // Find next shortcut index:
        const shortcutIndices = Object.keys(steamUserShortcuts);
        const shortcutIndex = shortcutIndices.length === 0 ? 0 : (shortcutIndices.reduce((maxIndex, curIndexKey) => {
            const curIndex = Number.parseInt(curIndexKey);
            return curIndex > maxIndex ? curIndex : maxIndex;
        }, 0) + 1);

        // Generate unique `appid`:
        const appIds = Object.values(steamUserShortcuts).map(shortcutEntry => shortcutEntry.appid);
        let appId: number;
        do {
            appId = SteamUtils.generateAppShortcutId();
        } while (appIds.includes(appId));

        // Compute the launch option environment variable
        let launchOptions = "";

        if (protonCompatDataRoot !== undefined) {
            launchOptions += PathUtils.serializeEnvironmentVariables([
                ["STEAM_COMPAT_DATA_PATH", protonCompatDataRoot],
            ], "linux"); 
        }

        if (gameAction.environment) {
            launchOptions += PathUtils.serializeEnvironmentVariables(gameAction.environment
                .filter(envVar => envVar.enabled)
                .map(envVar => [envVar.key, envVar.value]),
                "linux"
            );
        }

        if (launchOptions.length > 0) {
            launchOptions += " %command% ";
        }

        // Compute working directory:
        const unquotedActionData = gameAction.actionData.replace(/["']+/g, "");
        let workingDir = path.dirname(unquotedActionData);
    
        if (!path.isAbsolute(workingDir)) {
            workingDir = path.join(profile.gameInstallation.rootDir, workingDir);
        }

        // Create Steam shortcut from `gameAction`:
        steamUserShortcuts[shortcutIndex.toString()] = {
            appid: appId,
            AppName: gameAction.name,
            Exe: `"${path.join(workingDir, path.basename(unquotedActionData))}"`,
            StartDir: `"${workingDir}"`,
            icon: "",
            ShortcutPath: "",
            LaunchOptions: launchOptions,
            IsHidden: 0,
            AllowDesktopConfig: 1,
            AllowOverlay: 1,
            OpenVR: 0,
            Devkit: 0,
            DevkitGameID: "",
            DevkitOverrideAppID: 0,
            LastPlayTime: 0,
            FlatpakAppID: "",
            sortas: "",
            tags: {}
        };

        // Save the new shortcut
        SteamUtils.updateUserShortcuts(steamUserId, steamUserShortcutsDb);

        return SteamUtils.resolveGameId64(appId.toString());
    }

    /** 
     * @description Determines whether or not **any** profile is deployed in the `gameModDir` of `profile`.
     */
    public isSimilarProfileDeployed(profile: AppProfile): boolean {
        const metaFilePath = PathUtils.expandPath(path.join(profile.gameInstallation.modDir, AppConstants.PROFILE_METADATA_FILE));
        return fs.existsSync(metaFilePath);
    }

    /** 
     * @description Determines whether or the specific profile is deployed in the `gameModDir` of `profile`.
     */
    public isProfileDeployed(profile: AppProfile): boolean {
        return this.isSimilarProfileDeployed(profile) && this.readProfileDeploymentMetadata(profile)?.profile === profile.name;
    }

    public readProfileDeploymentMetadata(profile: AppProfile): ModDeploymentMetadata | undefined {
        const metaFilePath = PathUtils.expandPath(path.join(profile.gameInstallation.modDir, AppConstants.PROFILE_METADATA_FILE));
        const metaFileExists = fs.existsSync(metaFilePath);

        if (!metaFileExists) {
            return undefined;
        }

        return JSON.parse(fs.readFileSync(metaFilePath).toString("utf-8"));
    }

    public checkProfileLinkSupported(
        profile: AppProfile | AppBaseProfile | string | null | undefined,
        srcDir: keyof AppProfile,
        destDirs: Array<keyof AppProfile | keyof GameInstallation>,
        symlink: boolean,
        symlinkType?: SymlinkType,
        checkBaseProfile?: boolean
    ): boolean | undefined {
        if (typeof profile === "string") {
            profile = this.loadProfile(profile);
        }

        if (!profile) {
            return undefined;
        }

        const srcPath = this.getProfileDirByKey(profile, srcDir);

        if (!srcPath) {
            return undefined;
        }

        const destPaths = destDirs.map(destDir => this.getProfileDirByKey(profile, destDir));
        if (destPaths.some(destPath => destPath === undefined)) {
            return undefined;
        }

        let result;
        // Check if link is supported on this profile
        result = PathUtils.checkLinkSupported(
            srcPath,
            destPaths as string[],
            symlink,
            symlinkType
        );

        // Check if link is also supported from base profile if required
        if (result && checkBaseProfile && "baseProfile" in profile && !!profile.baseProfile) {
            let baseProfile: AppBaseProfile | string | null = profile.baseProfile;
            if (typeof baseProfile === "string") {
                baseProfile = this.loadProfile(baseProfile);
            }

            if (!!baseProfile) {
                const baseSrcPath = this.getProfileDirByKey(baseProfile, srcDir);
                if (!!baseSrcPath) {
                    result = PathUtils.checkLinkSupported(
                        baseSrcPath,
                        destPaths as string[],
                        symlink,
                        symlinkType
                    );
                }
            }
        }

        return result;
    }

    private resolveFullProfileDir(profile: AppProfile | AppBaseProfile | AppProfile.Form, profileDir: string): string {
        profileDir = PathUtils.expandPath(profileDir);

        return path.isAbsolute(profileDir)
            ? profileDir
            : path.join(this.getProfileDir(profile), profileDir)
    }
}