import type { AppProfile } from "../../app/models/app-profile";
import type { GamePluginListType } from "../../app/models/game-plugin-list-type";
import type { ModDeploymentMetadata } from "../../app/models/mod-deployment-metadata";

import * as log from "electron-log/main";
import { remove, uniq } from "es-toolkit";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");
const fsPromises = require("fs/promises") as typeof import("fs/promises");

import type { ElectronApp } from "../app";
import type { AppDataManager } from "./app-data-manager";
import type { ProfileDataManager } from "./profile-data-manager";
import { AppConstants } from "../constants";
import { PathUtils } from "../util/path-utils";
import { SteamUtils } from "../util/steam-utils";

export class ProfileDeploymentManager {

    constructor(
        private readonly app: ElectronApp
    ) {}

    private get appDataManager(): AppDataManager {
        return this.app.appDataManager;
    }

    private get profileDataManager(): ProfileDataManager {
        return this.app.profileDataManager;
    }

    public async deployMods(profile: AppProfile, root: boolean): Promise<string[]> {
        const profileModFiles = [];
        const relModDir = PathUtils.expandPath(root ? profile.gameInstallation.rootDir : profile.gameInstallation.modDir);
        const gameModDir = path.resolve(relModDir);
        const extFilesBackupDir = path.join(relModDir, AppConstants.DEPLOY_EXT_BACKUP_DIR);
        const extFilesList = await this.profileDataManager.findProfileExternalFilesInDir(profile, relModDir, !root);
        const gameDb = this.appDataManager.loadGameDatabase();
        const gameDetails = gameDb[profile.gameId];
        const gamePluginFormats = gameDetails?.pluginFormats ?? [];

        // Build Map of all existing data subdirs for path normalization
        const existingDataSubdirs = new Map<string, string>();
        if (profile.normalizePathCasing) {
            (await fs.readdir(gameModDir, { recursive: true })).forEach((existingModFile) => {
                if (fs.lstatSync(path.join(gameModDir, existingModFile as string)).isDirectory()) {
                    existingDataSubdirs.set((existingModFile as string).toLowerCase(), existingModFile as string);
                }
            });
        }

        // Copy all mods to the gameModDir for this profile
        // (Copy mods in reverse with `overwrite: false` to follow load order and allow existing manual mods in the folder to be preserved)
        const deployableMods = root ? profile.rootMods : profile.mods;
        const deployableModFiles = deployableMods.slice(0).reverse();
        for (const [modName, mod] of deployableModFiles) {
            if (mod.enabled) {
                const copyTasks = [];
                const modDirPath = this.profileDataManager.getProfileModDir(profile, modName, mod);
                const modFilesToCopy = await fs.readdir(modDirPath, { encoding: "utf-8", recursive: true });

                // Copy data files to mod base dir
                for (let modFile of modFilesToCopy) {
                    const srcFilePath = path.resolve(path.join(modDirPath, modFile.toString()));

                    // If file path normalization is enabled, apply to all files inside Data subdirectories (i.e. textures/, meshes/)
                    if (profile.normalizePathCasing && modFile.includes(path.sep)) {
                        // Convert file paths to lowercase
                        // If this file is a plugin, preserve the plugin name's casing
                        if (gamePluginFormats.some(pluginFormat => modFile.endsWith(pluginFormat))) {
                            modFile = path.join(path.dirname(modFile).toLowerCase(), path.basename(modFile));
                        } else {
                            modFile = modFile.toLowerCase();
                        }

                        // Apply existing capitalization rules of mod data subdirectories to ensure only one folder is created
                        let modFileBase = path.dirname(modFile);
                        while (modFileBase !== "." && modFileBase !== path.sep) {
                            const existingBase = existingDataSubdirs.get(modFileBase.toLowerCase());
                            if (existingBase) {
                                modFile = modFile.replace(modFileBase, existingBase);
                                break;
                            } else {
                                modFileBase = path.dirname(modFileBase);
                            }
                        }
                    }

                    const destFilePath = path.join(gameModDir, modFile);
                    // Don't copy directories directly
                    let shouldCopy = !fs.lstatSync(srcFilePath).isDirectory();

                    if (fs.existsSync(destFilePath)) {
                        if (extFilesList?.includes(modFile)) {
                            if (!shouldCopy) {
                                log.warn("Original file to backup is a directory, this should not happen.");
                            } else {
                                // Backup original external file to temp directory for deploy and override
                                fs.moveSync(destFilePath, path.join(extFilesBackupDir, modFile));
                                remove(extFilesList, extFile => extFile === modFile);
                            }
                            
                        } else {
                            // Don't override deployed files
                            shouldCopy = false;
                        }
                    }
                    
                    if (shouldCopy && modFile.length > 0) {
                        // Record mod files written from profile
                        // Record full path for root mods
                        profileModFiles.push(root ? destFilePath : modFile);
                    }

                    if (shouldCopy) {
                        if (profile.modLinkMode) {
                            await fs.mkdirp(path.dirname(destFilePath));
                            copyTasks.push(fs.link(srcFilePath, destFilePath));
                        } else {
                            copyTasks.push(fs.copy(srcFilePath, destFilePath, { overwrite: false }));
                        }
                    }
                }

                await Promise.all(copyTasks);
            }
        }

        return profileModFiles;
    }

    public async writePluginList(profile: AppProfile): Promise<string> {
        const pluginListPath = profile.gameInstallation.pluginListPath
            ? path.resolve(PathUtils.expandPath(profile.gameInstallation.pluginListPath))
            : undefined;

        if (pluginListPath) {
            const pluginListDir = path.dirname(pluginListPath);
            fs.mkdirpSync(pluginListDir);
            
            // Backup any existing plugins file
            if (fs.existsSync(pluginListPath)) {
                const backupDir = path.join(pluginListDir, AppConstants.DEPLOY_EXT_BACKUP_DIR);

                fs.mkdirpSync(backupDir);
                fs.copyFileSync(pluginListPath, path.join(backupDir, path.parse(pluginListPath).base));
            }

            // Write the plugin list
            try {
                fs.writeFileSync(pluginListPath, this.createProfilePluginList(profile));
            } catch (err: any) {
                throw new Error(`Unable to write plugins list: ${err.toString()}`);
            }

            return pluginListPath;
        } else {
            throw new Error(`Unable to write plugins list: Plugin list path not defined in profile "${profile.name}"`);
        }
    }

    public async writeConfigFiles(profile: AppProfile): Promise<string[]> {
        const deployConfigDir = profile.gameInstallation.configFilePath
            ? PathUtils.expandPath(profile.gameInstallation.configFilePath)
            : undefined;

        if (!deployConfigDir || !fs.existsSync(deployConfigDir)) {
            throw new Error(`Unable to write config files: Profile's Game Config File Path "${profile.gameInstallation.configFilePath}" is not valid.`);
        }

        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        const backupDir = path.join(deployConfigDir, AppConstants.DEPLOY_EXT_BACKUP_DIR);
        const profileConfigDir = this.profileDataManager.getProfileConfigDir(profile);

        if (!fs.existsSync(profileConfigDir)) {
            return [];
        }

        const profileConfigFiles = gameDetails?.gameConfigFiles
            ? gameDetails.gameConfigFiles
            : fs.readdirSync(profileConfigDir);
        
        const writtenConfigFiles = [];
        for (const configFileName of profileConfigFiles) {
            const rawConfigSrcPath = path.resolve(path.join(profileConfigDir, configFileName));
            // Resolve src config file path with any potential overrides
            const configSrcPath = path.resolve(this.profileDataManager.resolveGameConfigFilePath(profile, configFileName, false) ?? rawConfigSrcPath);
            const configDestPath = path.resolve(path.join(deployConfigDir, configFileName));

            if (!fs.existsSync(configSrcPath)) {
                break;
            }

            if (!fs.existsSync(configSrcPath)) {
                break;
            }

            // Backup any existing config files
            if (fs.existsSync(configDestPath)) {
                let backupFile = path.join(backupDir, configFileName);
                while (fs.existsSync(backupFile)) {
                    backupFile += `_${PathUtils.currentDateTimeAsFileName()}`;
                }

                fs.moveSync(configDestPath, backupFile);
            }

            if (profile.configLinkMode) {
                await fs.symlink(configSrcPath, configDestPath, "file");
            } else {
                await fs.copyFile(configSrcPath, configDestPath);
            }
            
            writtenConfigFiles.push(configDestPath);
        }

        return writtenConfigFiles;
    }

    public async writeSaveFiles(profile: AppProfile): Promise<string[]> {
        const deploySaveDir = profile.gameInstallation.saveFolderPath
            ? path.resolve(PathUtils.expandPath(profile.gameInstallation.saveFolderPath))
            : undefined;

        if (!deploySaveDir || !fs.existsSync(deploySaveDir)) {
            throw new Error(`Unable to write save files: Profile's Save Folder Path "${profile.gameInstallation.saveFolderPath}" is not valid.`);
        }

        const rootBackupDir = path.join(path.dirname(deploySaveDir), AppConstants.DEPLOY_EXT_BACKUP_DIR);
        const savesBackupDir = path.join(rootBackupDir, path.basename(deploySaveDir));
        const profileSaveDir = path.resolve(this.profileDataManager.getProfileSaveDir(profile));

        // Backup existing saves
        if (fs.existsSync(deploySaveDir)) {
            fs.moveSync(deploySaveDir, savesBackupDir);
        }

        // Make sure profile save folder exists
        fs.mkdirpSync(profileSaveDir);

        if (PathUtils.checkLinkSupported(profileSaveDir, [deploySaveDir], true, "junction")) {
            await fs.symlink(profileSaveDir, deploySaveDir, "junction");
        } else {
            log.error("Cannot deploy profile save files, symlink not supported for path from", profileSaveDir, "to", deploySaveDir);
            throw new Error("Cannot deploy profile save files, symlink not supported for path.");
        }

        // Create helper symlink for easy access to backed up saves
        const backupDirHelperLink = `${deploySaveDir.replace(/[/\\]$/, "")}.original`;
        if (PathUtils.checkLinkSupported(path.resolve(savesBackupDir), [path.resolve(backupDirHelperLink)], true, "dir")) {
            if (fs.existsSync(savesBackupDir)) {
                await fs.symlink(path.resolve(savesBackupDir), path.resolve(backupDirHelperLink), "dir");
            }
        }

        return [deploySaveDir, backupDirHelperLink];
    }

    public async writeSteamCompatSymlinks(profile: AppProfile): Promise<string[]> {
        if (!profile.gameInstallation.steamId?.length || !profile.steamCustomGameId) {
            return [];
        }

        const appSettings = this.appDataManager.loadSettings();
        const gameCompatSteamuserDir = SteamUtils.getSteamCompatSteamuserDir(profile.gameInstallation);
        const customCompatSteamuserDir = SteamUtils.getCoreSteamCompatSteamuserDir(appSettings, profile.steamCustomGameId);

        if (!gameCompatSteamuserDir || !customCompatSteamuserDir || !fs.existsSync(gameCompatSteamuserDir) || !fs.existsSync(customCompatSteamuserDir)) {
            return [];
        }

        if (gameCompatSteamuserDir === customCompatSteamuserDir) {
            return [];
        }

        const customCompatRoot = SteamUtils.getCoreSteamCompatRoot(appSettings, profile.steamCustomGameId);
        if (!customCompatRoot) {
            return [];
        }

        const rootBackupDir = path.join(customCompatRoot, AppConstants.DEPLOY_EXT_BACKUP_DIR);
        const userDirBackupDir = path.join(rootBackupDir, AppConstants.STEAM_COMPAT_STEAMUSER_DIR);

        // Backup existing steamuser dir
        fs.mkdirpSync(rootBackupDir);
        fs.moveSync(customCompatSteamuserDir, userDirBackupDir);

        // Symlink the user steamuser dir to the game steamuser dir
        fs.ensureSymlinkSync(gameCompatSteamuserDir, customCompatSteamuserDir, "dir");

        return [path.resolve(customCompatSteamuserDir)];
    }

    public writeProfileDeploymentMetadata(profile: AppProfile, deploymentMetadata: ModDeploymentMetadata): void {
        const metaFilePath = PathUtils.expandPath(path.join(profile.gameInstallation.modDir, AppConstants.PROFILE_METADATA_FILE));

        return fs.writeFileSync(metaFilePath, JSON.stringify(deploymentMetadata));
    }

    public async processDeployedFiles(profile: AppProfile, _profileModFiles: string[]): Promise<string[]> {
        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
        const timestampedPluginTypes: GamePluginListType[] = ["Gamebryo", "NetImmerse"];

        // Some games require processing of plugin file timestamps to enforce load order
        if (!!gameDetails?.pluginListType && profile.plugins && timestampedPluginTypes.includes(gameDetails.pluginListType)) {
            let gamePluginDir = PathUtils.expandPath(profile.gameInstallation.modDir);

            if (gameDetails.pluginDataRoot) {
                gamePluginDir = path.join(gamePluginDir, gameDetails.pluginDataRoot);
            }

            let pluginTimestamp = Date.now() / 1000 | 0;
            profile.plugins.forEach((pluginRef) => {
                const pluginPath = path.join(gamePluginDir, pluginRef.plugin);
                if (fs.existsSync(pluginPath)) {
                    // Set plugin order using the plugin file's "last modified" timestamp
                    fs.utimesSync(pluginPath, pluginTimestamp, pluginTimestamp);
                    ++pluginTimestamp;
                } else {
                    log.warn("Missing plugin file", pluginPath);
                }
            });
        }

        return [];
    }

    public async deployGameResources(profile: AppProfile): Promise<string[]> {
        const profileModFiles: string[] = [];
        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);

        if (gameDetails?.resources?.mods) {
            Object.entries(gameDetails.resources.mods).forEach(([resourceSrc, resourceDest]) => {
                const srcFilePath = path.join(AppConstants.GAME_RESOURCES_DIR, resourceSrc);

                if (profile.normalizePathCasing) {
                    // TODO - Apply normalization rules to `resourceDest`
                }

                const destFilePath = PathUtils.expandPath(path.join(profile.gameInstallation.modDir, resourceDest));

                if (fs.existsSync(destFilePath)) {
                    return;
                }

                const linkMode = PathUtils.checkLinkSupported(srcFilePath, [destFilePath], false);
                if (linkMode) {
                    fs.mkdirpSync(path.dirname(destFilePath));
                    fs.linkSync(srcFilePath, destFilePath);
                } else {
                    fs.copySync(srcFilePath, destFilePath, { overwrite: false });
                }

                profileModFiles.push(resourceDest);
            });
        } 

        return profileModFiles;
    }

    public async deployProfile(profile: AppProfile, deployPlugins: boolean): Promise<void> {
        const profileModFiles: string[] = [];
        let deploymentError = undefined;

        try {
            // Ensure the mod base dir exists
            fs.mkdirpSync(PathUtils.expandPath(profile.gameInstallation.modDir));

            if (this.profileDataManager.isSimilarProfileDeployed(profile)) {
                await this.undeployProfile(profile);
            }

            log.info("Deploying profile", profile.name);

            // Deploy mods
            profileModFiles.push(... await this.deployMods(profile, true));
            profileModFiles.push(... await this.deployMods(profile, false));

            if (deployPlugins && !!profile.gameInstallation.pluginListPath && profile.plugins.length > 0) {
                // Write plugin list
                profileModFiles.push(await this.writePluginList(profile));
            }

            if (profile.manageConfigFiles) {
                profileModFiles.push(... await this.writeConfigFiles(profile));
            }

            if (profile.manageSaveFiles) {
                profileModFiles.push(... await this.writeSaveFiles(profile));
            }

            if (profile.manageSteamCompatSymlinks) {
                profileModFiles.push(... await this.writeSteamCompatSymlinks(profile));
            }

            // Write game resources
            profileModFiles.push(... await this.deployGameResources(profile));

            // Process deployed files
            profileModFiles.push(... await this.processDeployedFiles(profile, profileModFiles));
        } catch (err) {
            deploymentError = err;
        }

        // Write the deployment metadata file
        if (profileModFiles.length > 0) {
            this.writeProfileDeploymentMetadata(profile, {
                profile: profile.name,
                profileModFiles
            });
        }

        if (deploymentError) {
            // Remove any partially deployed files if deployment failed
            try {
                this.undeployProfile(profile);
            } catch (_err) {}

            log.error("Mod deployment failed: ", deploymentError);
            throw deploymentError;
        }

        log.info("Mod deployment succeeded");
    }

    public async undeployProfile(profile: AppProfile): Promise<void> {
        try {
            if (!this.profileDataManager.isSimilarProfileDeployed(profile)) {
                return;
            }

            const deploymentMetadata = this.profileDataManager.readProfileDeploymentMetadata(profile);
            if (!deploymentMetadata) {
                log.error("Mod undeployment failed unexpectedly.");
                return;
            }

            // A deployed profile is orphaned if it is not known by the running instance of the application
            let orphanedDeploy = false;

            if (deploymentMetadata.profile !== profile.name) {
                const originalProfile = this.profileDataManager.loadProfile(deploymentMetadata.profile) as AppProfile;
                if (originalProfile) {
                    profile = originalProfile;
                } else {
                    orphanedDeploy = true;
                }
            }

            log.info("Undeploying profile", deploymentMetadata.profile);

            if (orphanedDeploy) {
                log.warn("The profile being undeployed is orphaned. Data loss may occur.");
            }

            const gameModDir = PathUtils.expandPath(profile.gameInstallation.modDir);
            const gameRootDir = PathUtils.expandPath(profile.gameInstallation.rootDir);

            // Only remove files managed by this profile
            const undeployJobs = deploymentMetadata.profileModFiles.map(async (existingFile) => {
                const fullExistingPath = path.isAbsolute(existingFile)
                    ? existingFile
                    : path.join(gameModDir, existingFile);

                if (fs.existsSync(fullExistingPath)) {
                    await fs.remove(fullExistingPath);
                }

                // Recursively remove empty parent directories
                let existingDir = path.dirname(fullExistingPath);
                while (existingDir !== profile.gameInstallation.modDir && fs.existsSync(existingDir) && fs.readdirSync(existingDir).length === 0) {
                    try {
                        fs.rmdirSync(existingDir);
                        existingDir = path.dirname(existingDir);
                    } catch (error) {
                        log.error("Failed to remove dir", existingDir, error);
                        break;
                    }
                }
            });

            // Wait for all files to be removed
            await Promise.all(undeployJobs);

            const customSteamCompatRoot = !!profile.steamCustomGameId && !!profile.gameInstallation.steamId?.length
                ? SteamUtils.getCoreSteamCompatRoot(this.appDataManager.loadSettings(), profile.steamCustomGameId)
                : undefined;

            const extFilesBackupDirs = uniq([
                path.join(gameModDir, AppConstants.DEPLOY_EXT_BACKUP_DIR),
                path.join(gameRootDir, AppConstants.DEPLOY_EXT_BACKUP_DIR),
                ... profile.gameInstallation.configFilePath ? [path.join(profile.gameInstallation.configFilePath, AppConstants.DEPLOY_EXT_BACKUP_DIR)] : [],
                ... profile.gameInstallation.saveFolderPath ? [path.join(path.dirname(profile.gameInstallation.saveFolderPath), AppConstants.DEPLOY_EXT_BACKUP_DIR)] : [],
                ... profile.gameInstallation.pluginListPath ? [path.join(path.dirname(profile.gameInstallation.pluginListPath), AppConstants.DEPLOY_EXT_BACKUP_DIR)] : [],
                ... customSteamCompatRoot ? [path.join(customSteamCompatRoot, AppConstants.DEPLOY_EXT_BACKUP_DIR)] : [],
            ]);
            
            // Restore original external files, if any were moved
            for (const extFilesBackupDir of extFilesBackupDirs) {
                if (await fs.exists(extFilesBackupDir)) {
                    const backupEntries = await fs.readdir(extFilesBackupDir);

                    for (const backupEntry of backupEntries) {
                        const backupSrc = path.join(extFilesBackupDir, backupEntry);
                        const backupSrcIsDir = (await fs.lstat(backupSrc)).isDirectory();
                        const backupDest = path.join(path.dirname(extFilesBackupDir), backupEntry);
                        const backupDestExists = await fs.exists(backupDest);
                        const backupDestIsDir = backupDestExists && (await fs.lstat(backupDest)).isDirectory();

                        if (backupDestIsDir) {
                            if (backupSrcIsDir) {
                                log.info("Merging restored game file backups with existing directory.");

                                await fsPromises.cp(backupSrc, backupDest, { recursive: true });
                            } else {
                                throw new Error("Backup file is not a directory but write dest is. This should not happen.");
                            }
                        } else {
                            if (backupDestExists) {
                                await fs.remove(backupDest);
                            }

                            if (profile.modLinkMode && !backupSrcIsDir) {
                                // Use hardlinks for faster file restoration in link mode
                                // TODO - Recursively do this when encountering directories
                                await fs.link(backupSrc, backupDest);
                            } else {
                                await fs.copy(backupSrc, backupDest);
                            }
                        }
                    }
                }
            }

            // If all undeploy operations succeeded, remove deployment metadata file
            const metadataFilePath = path.join(gameModDir, AppConstants.PROFILE_METADATA_FILE);
            if (fs.existsSync(metadataFilePath)) {
                fs.rmSync(path.join(gameModDir, AppConstants.PROFILE_METADATA_FILE));
            }

            // Remove file backup directories
            for (const extFilesBackupDir of extFilesBackupDirs) {
                if (fs.existsSync(extFilesBackupDir)) {
                    fs.removeSync(extFilesBackupDir);
                }
            }
        } catch (err) {
            log.error("Mod undeployment failed: ", err);
            throw err;
        }

        log.info("Mod undeployment succeeded");
    }

    public exportProfilePluginList(profile: AppProfile, pluginListPath: string): void {
        fs.writeFileSync(pluginListPath, this.createProfilePluginList(profile));
    }

    private createProfilePluginList(
        profile: AppProfile,
        listType?: GamePluginListType
    ): string {
        const gameDetails = this.appDataManager.getGameDetails(profile.gameId);

        switch (listType ?? gameDetails?.pluginListType) {
            case "Gamebryo": {
                return this.createProfilePluginListGamebryo(profile);
            }
            case "NetImmerse": {
                return "";
            }
            case "CreationEngine":
            case "Default": {
                return this.createProfilePluginListCreationEngine(profile);
            }
            default: throw new Error("Game has unknown plugin list type.");
        }
    }

    private createProfilePluginListHeader(profile: AppProfile): string {
        return `# This file was generated automatically by ${AppConstants.APP_NAME} for profile "${profile.name}"\n`;
    }

    private createProfilePluginListGamebryo(profile: AppProfile): string {
        const header = this.createProfilePluginListHeader(profile);

        return profile.plugins.reduce((data, pluginRef) => {
            if (pluginRef.enabled) {
                data += pluginRef.plugin;
                data += "\n";
            }
            return data;
        }, header);
    }

    private createProfilePluginListCreationEngine(profile: AppProfile): string {
        const header = this.createProfilePluginListHeader(profile);

        return profile.plugins.reduce((data, pluginRef) => {
            if (pluginRef.enabled) {
                data += "*";
            }

            data += pluginRef.plugin;
            data += "\n";
            return data;
        }, header);
    }
}