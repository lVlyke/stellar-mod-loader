import type { AppMessageData } from "../../app/models/app-message";
import type { AppProfile } from "../../app/models/app-profile";
import type { GameInstallation } from "../../app/models/game-installation";

import type Electron from "electron";
import * as log from "electron-log/main";
import * as mime from "mime-types";
import * as Seven from "node-7z";
import { default as winVersionInfo } from "win-version-info";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");
const { ipcMain, dialog, shell } = require("electron") as typeof Electron;

import type { ElectronApp } from "../app";
import type { AppDataManager } from "./app-data-manager";
import type { ProfileDataManager } from "./profile-data-manager";
import type { ProfileModManager } from "./profile-mod-manager";
import type { ProfileDeploymentManager } from "./profile-deployment-manager";
import { AppConstants } from "../constants";
import { PathUtils } from "../util/path-utils";
import { BinUtils } from "../util/bin-utils";
import { SteamUtils } from "../util/steam-utils";

export class RendererEventHandler {

    constructor(
        private readonly app: ElectronApp
    ) {
        ipcMain.handle("app:getInfo", (
            _event: Electron.IpcMainInvokeEvent,
            {}: AppMessageData<"app:getInfo">
        ) => {
            return this.appDataManager.getAppAboutInfo();
        });

        ipcMain.handle("app:syncUiState", (
            _event: Electron.IpcMainInvokeEvent,
            {
                appState,
                modListCols,
                defaultModListCols
            }: AppMessageData<"app:syncUiState">
        ) => {
            // Update window title
            if (appState.activeProfile) {
                const gameId = appState.activeProfile.gameId;
                const gameTitle = appState.gameDb[gameId]?.title ?? gameId ?? "Unknown";

                app.mainWindow!.setTitle(`${appState.activeProfile.name} [${gameTitle}] - ${AppConstants.APP_SHORT_NAME}`);
            }

            // Sync mod list column menu checkbox state
            const activeModListCols = appState.modListColumns ?? defaultModListCols;
            modListCols.forEach((col) => {
                const colMenuItem = app.menu.getMenuItemById(`mod-list-col-${col}`);
                if (colMenuItem) {
                    colMenuItem.checked = activeModListCols.includes(col);
                }
            });

            // Sync profile lock state
            const lockProfilePanelItem = app.menu.getMenuItemById("lock-profile");
            const unlockProfilePanelItem = app.menu.getMenuItemById("unlock-profile");
            if (lockProfilePanelItem) {
                lockProfilePanelItem.visible = !appState.activeProfile?.locked;
            }

            if (unlockProfilePanelItem) {
                unlockProfilePanelItem.visible = !!appState.activeProfile?.locked;
            }
            

            // Sync log panel visibility state
            const toggleLogPanelItem = app.menu.getMenuItemById("show-log-panel");
            if (toggleLogPanelItem) {
                toggleLogPanelItem.checked = !!appState.logPanelEnabled;
            }
            
            const profileActionIds = [
                "export-profile",
                "delete-profile",
                "mods"
            ];

            // Enable/disable profile actions based on lock state
            profileActionIds.forEach((profileActionId) => {
                const menuItem = app.menu.getMenuItemById(profileActionId);
                if (menuItem) {
                    menuItem.enabled = !appState.activeProfile?.locked;
                }
            });
        });

        ipcMain.handle("app:chooseDirectory", async (
            _event: Electron.IpcMainInvokeEvent,
            { baseDir }: AppMessageData<"app:chooseDirectory">
        ) => {
            const result = await dialog.showOpenDialog({
                properties: ["openDirectory"],
                defaultPath: baseDir
            });
            
            return result?.filePaths?.[0];
        });

        ipcMain.handle("app:chooseFilePath", async (
            _event: Electron.IpcMainInvokeEvent,
            { baseDir, fileTypes }: AppMessageData<"app:chooseFilePath">
        ) => {
            const result = await dialog.showOpenDialog({
                filters: fileTypes ? [
                    {
                        name: `Files (${fileTypes.length === 1 ? fileTypes[0] : fileTypes.join(", ")})`,
                        extensions: fileTypes
                    }
                ] : [],
                defaultPath: baseDir
            });
            
            return result?.filePaths?.[0];
        });

        ipcMain.handle("app:verifyPathExists", async (
            _event: Electron.IpcMainInvokeEvent,
            data: AppMessageData<"app:verifyPathExists">
        ) => {
            const paths = Array.isArray(data.path) ? data.path : [data.path]
            return PathUtils.firstValidPath(paths, data.dirname ? (curPath: string) => path.dirname(curPath) : undefined);
        });

        ipcMain.handle("app:openFile", async (
            _event: Electron.IpcMainInvokeEvent,
            data: AppMessageData<"app:openFile">
        ) => {
            data.path = PathUtils.expandPath(path.resolve(data.path));
            const mimeType = mime.contentType(path.extname(data.path));

            const fileData = fs.readFileSync(data.path);

            return {
                mimeType,
                path: data.path,
                data: fileData,
            };
        });

        ipcMain.handle("app:loadProfileList", async (
            _event: Electron.IpcMainInvokeEvent,
            _data: AppMessageData<"app:loadProfileList">
        ) => {
            try {
                return this.appDataManager.loadProfileList();
            } catch (e) {
                log.error(e);
                return null;
            }
        });

        ipcMain.handle("app:loadSettings", async (
            _event: Electron.IpcMainInvokeEvent,
            _data: AppMessageData<"app:loadSettings">
        ) => {
            try {
                return this.appDataManager.loadSettings();
            } catch (e) {
                log.error(e);
                return null;
            }
        });

        ipcMain.handle("app:saveSettings", async (
            _event: Electron.IpcMainInvokeEvent, 
            { settings }: AppMessageData<"app:saveSettings">
        ) => {
           return this.appDataManager.saveSettings(settings);
        });

        ipcMain.handle("app:exportGame", async (
            _event: Electron.IpcMainInvokeEvent,
            { gameDetails }: AppMessageData<"app:exportGame">
        ) => {
            const pickedFile = await dialog.showSaveDialog({
                filters: [
                    { 
                        name: "Game Details", extensions: ["json"]
                    }
                ]
            });
            
            const gamePath = pickedFile?.filePath;
            if (gamePath) {
                return this.appDataManager.exportGameDetails(gameDetails, gamePath);
            }
        });

        ipcMain.handle("app:readGame", async (
            _event: Electron.IpcMainInvokeEvent,
            _data: AppMessageData<"app:readGame">
        ) => {
            const pickedFile = await dialog.showOpenDialog({
                filters: [
                    { 
                        name: "Game Details", extensions: ["json"]
                    }
                ]
            });
            
            const gamePath = pickedFile?.filePaths[0];
            if (gamePath) {
                return [
                    path.parse(gamePath).name,
                    fs.readJSONSync(gamePath)
                ];
            }

            return undefined;
        });

        ipcMain.handle("app:loadGameDatabase", async (
            _event: Electron.IpcMainInvokeEvent,
            { includeCustomGames }: AppMessageData<"app:loadGameDatabase">
        ) => {
            try {
                return this.appDataManager.loadGameDatabase(includeCustomGames);
            } catch (e) {
                log.error(e);
                return null;
            }
        });

        ipcMain.handle("app:resolveResourceUrl", async (
            _event: Electron.IpcMainInvokeEvent,
            { resource }: AppMessageData<"app:resolveResourceUrl">
        ) => {
            return AppConstants.APP_RESOURCES[resource];
        });

        ipcMain.handle("app:loadProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { name, gameId }: AppMessageData<"app:loadProfile">
        ) => {
            return this.profileDataManager.loadProfile(name);
        });

        ipcMain.handle("app:loadExternalProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profilePath, directImport }: AppMessageData<"app:loadExternalProfile">
        ) => {
            if (!profilePath) {
                const allowedExtensions = ["json"];

                // Allow importing from archive if not doing a direct import
                if (!directImport) {
                    allowedExtensions.push("7z", "7zip", "zip", "rar")
                }

                const pickedFile = (await dialog.showOpenDialog({
                    properties: ["openFile"],
                    filters: [{
                        name: "SML Profile",
                        extensions: allowedExtensions
                    }]
                }));
                
                profilePath = pickedFile?.filePaths[0];
            }

            if (!profilePath) {
                return null;
            }

            // If profile is uncompressed, use the dirname
            if (profilePath.endsWith(".json")) {
                profilePath = path.dirname(profilePath);
            } else {
                const archivePath = profilePath;
                const profileName = path.basename(archivePath, path.extname(archivePath));

                try {
                    const stagingDir = path.resolve(path.join(AppConstants.APP_TMP_DIR, profileName));
                    const _7zBinaryPath = BinUtils.resolve7zBinaryPath();

                    // Clean the tmp staging dir
                    await fs.remove(stagingDir);

                    // Decompress profile to staging dir
                    await new Promise((resolve, reject) => {
                        const decompressStream = Seven.extractFull(archivePath, stagingDir, { $bin: _7zBinaryPath });
                        decompressStream.on("end", () => resolve(true));
                        decompressStream.on("error", (e: unknown) => reject(e));
                    });

                    profilePath = stagingDir;
                } catch (e) {
                    log.error("Failed to load external profile from path:", profilePath, e);
                    return null;
                }
            }

            // Attempt to load the profile
            if (profilePath) {
                profilePath = path.resolve(profilePath); // Make sure path is absolute
                const loadedProfile = this.profileDataManager.loadProfileFromPath(profilePath, profilePath);

                if (!loadedProfile) {
                    log.error("Failed to load external profile from path:", profilePath);
                }

                return loadedProfile;
            }

            return null;
        });

        ipcMain.handle("app:saveProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"app:saveProfile">
        ) => {
            return this.profileDataManager.saveProfile(profile);
        });

        ipcMain.handle("app:exportProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"app:exportProfile">
        ) => {
            const profileDir = this.profileDataManager.getProfileDir(profile);
            const defaultProfileDir = this.profileDataManager.getDefaultProfileDir(profile.name);

            // Choose path to save profile archive
            const exportFilePath = (await dialog.showSaveDialog({
                defaultPath: profile.name,
                filters: [{
                    name: "Exported Profile",
                    extensions: ["7z"]
                }]
            }))?.filePath;

            if (!exportFilePath) {
                return undefined;
            }

            const initialCwd = process.cwd();
            // Compress the profile data to archive
            try {
                const _7zBinaryPath = BinUtils.resolve7zBinaryPath();

                process.chdir(path.resolve(profileDir));

                await new Promise((resolve, reject) => {
                    const compressStream = Seven.add(exportFilePath, ".", {
                        $bin: _7zBinaryPath,
                        recursive: true
                    });

                    compressStream.on("end", () => resolve(true));
                    compressStream.on("error", (e: unknown) => reject(e));
                });
            } catch (e) {
                log.error("Failed to export profile: ", e);
                return undefined;
            } finally {
                process.chdir(initialCwd);
            }

            // Remove profile from SML and back up files to app tmp dir
            const backupDir = path.join(AppConstants.APP_TMP_DIR, `${profile.name}.bak_${PathUtils.asFileName(new Date().toISOString())}`);
            await fs.move(profileDir, backupDir, { overwrite: true });

            // Remove any symlinks to profile
            if (profileDir !== defaultProfileDir) {
                await fs.remove(defaultProfileDir);
            }

            return exportFilePath;
        });

        ipcMain.handle("app:deleteProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"app:deleteProfile">
        ) => {
            return this.profileDataManager.deleteProfile(profile);
        });

        ipcMain.handle("app:copyProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { srcProfile, destProfile }: AppMessageData<"app:copyProfile">
        ) => {
            function shouldCopyDir(srcPath: string, destPath: string) {
                return fs.existsSync(srcPath) && (!fs.existsSync(destPath) || fs.realpathSync(srcPath) !== fs.realpathSync(destPath));
            }

            log.info("Copying profile src: ", srcProfile.name, " dest: ", destProfile.name);

            const srcModsDir = this.profileDataManager.getProfileModsDir(srcProfile);
            const destModsDir = this.profileDataManager.getProfileModsDir(destProfile);

            // Copy profile mods
            if (shouldCopyDir(srcModsDir, destModsDir)) {
                fs.mkdirpSync(destModsDir);
                fs.copySync(srcModsDir, destModsDir);
            }

            const srcConfigDir = this.profileDataManager.getProfileConfigDir(srcProfile);
            const destConfigDir = this.profileDataManager.getProfileConfigDir(destProfile);

            // Copy config files
            if (shouldCopyDir(srcConfigDir, destConfigDir)) {
                fs.mkdirpSync(destConfigDir);
                fs.copySync(srcConfigDir, destConfigDir);
            }

            const srcSaveDir = this.profileDataManager.getProfileSaveDir(srcProfile);
            const destSaveDir = this.profileDataManager.getProfileSaveDir(destProfile);

            // Copy save files
            if (shouldCopyDir(srcSaveDir, destSaveDir)) {
                fs.mkdirpSync(destSaveDir);
                fs.copySync(srcSaveDir, destSaveDir);
            }

            const srcBackupsDir = this.profileDataManager.getProfileBackupsDir(srcProfile);
            const destBackupsDir = this.profileDataManager.getProfileBackupsDir(destProfile);

            // Copy plugin order backups
            if (shouldCopyDir(srcBackupsDir, destBackupsDir)) {
                fs.mkdirpSync(destBackupsDir);
                fs.copySync(srcBackupsDir, destBackupsDir);
            }
        });

        ipcMain.handle("app:verifyProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"app:verifyProfile">
        ): Promise<AppProfile.VerificationResults> => {
            const VERIFY_SUCCESS = { error: false, found: true };
            const VERIFY_FAIL = { error: true, found: false };
            const gameDb = this.appDataManager.loadGameDatabase();

            const gameIdResult = profile.gameId !== undefined && !!gameDb[profile.gameId]
                ? VERIFY_SUCCESS
                : VERIFY_FAIL;
            const profileExistsResult = this.profileDataManager.verifyProfilePathExists(
                this.profileDataManager.getProfileDir(profile)
            );
            const modResult = this.profileModManager.verifyProfileMods(false, profile);
            const rootModResult = this.profileModManager.verifyProfileMods(true, profile);
            const baseProfileResult = profile.baseProfile
                ? this.profileDataManager.verifyProfilePathExists(this.profileDataManager.getProfileDir(profile.baseProfile))
                : VERIFY_SUCCESS;
            const gameModDirResult = "gameInstallation" in profile
                ? this.profileDataManager.verifyProfilePathExists(profile.gameInstallation.modDir)
                : VERIFY_SUCCESS;
            const gameRootDirResult = "gameInstallation" in profile
                ? this.profileDataManager.verifyProfilePathExists(profile.gameInstallation.rootDir)
                : VERIFY_SUCCESS;
            const gamePluginListPathResult = "gameInstallation" in profile && profile.gameInstallation.pluginListPath
                ? this.profileDataManager.verifyProfilePathExists(path.dirname(profile.gameInstallation.pluginListPath))
                : VERIFY_SUCCESS;
            const gameConfigFilePathResult = "gameInstallation" in profile && profile.gameInstallation.configFilePath
                ? this.profileDataManager.verifyProfilePathExists(profile.gameInstallation.configFilePath)
                : VERIFY_SUCCESS;
            const gameSaveFolderPathResult = "gameInstallation" in profile && profile.gameInstallation.saveFolderPath
                ? this.profileDataManager.verifyProfilePathExists(profile.gameInstallation.saveFolderPath)
                : VERIFY_SUCCESS;
            const rootPathOverrideResult = profile.rootPathOverride
                ? this.profileDataManager.verifyProfilePathExists(profile.rootPathOverride)
                : VERIFY_SUCCESS;
            const modsPathOverrideResult = profile.modsPathOverride
                ? this.profileDataManager.verifyProfilePathExists(profile.modsPathOverride)
                : VERIFY_SUCCESS;
            const configPathOverrideResult = profile.configPathOverride
                ? this.profileDataManager.verifyProfilePathExists(profile.configPathOverride)
                : VERIFY_SUCCESS;
            const savesPathOverrideResult = profile.savesPathOverride
                ? this.profileDataManager.verifyProfilePathExists(profile.savesPathOverride)
                : VERIFY_SUCCESS;
            const backupsPathOverrideResult = profile.backupsPathOverride
                ? this.profileDataManager.verifyProfilePathExists(profile.backupsPathOverride)
                : VERIFY_SUCCESS;
            const modLinkModeResult = ("gameModDir" in profile && profile.modLinkMode)
                ? (this.profileDataManager.checkProfileLinkSupported(
                    profile,
                    "modsPathOverride",
                    ["modDir", "rootDir"],
                    false,
                    undefined,
                    true) ? VERIFY_SUCCESS : VERIFY_FAIL)
                : VERIFY_SUCCESS;
            const configLinkModeResult = ("gameInstallation" in profile && profile.configLinkMode)
                ? (PathUtils.checkLinkSupported(
                    this.profileDataManager.getProfileDirByKey(profile, "configPathOverride") ?? "",
                    [this.profileDataManager.getProfileDirByKey(profile, "configFilePath") ?? ""],
                    true,
                    "file") ? VERIFY_SUCCESS : VERIFY_FAIL)
                : VERIFY_SUCCESS;
            const manageSaveFilesResult = ("gameInstallation" in profile && profile.manageSaveFiles)
                ? ((profile.deployed || PathUtils.checkLinkSupported(
                    this.profileDataManager.getProfileDirByKey(profile, "savesPathOverride") ?? "",
                    // Use `gameSaveFolderPath` parent dir in case a deploy is active
                    [path.join(this.profileDataManager.getProfileDirByKey(profile, "saveFolderPath") ?? "", "..")], 
                    true,
                    "junction")) ? VERIFY_SUCCESS : VERIFY_FAIL)
                : VERIFY_SUCCESS;
            
            if (!profile.deployed || !profile.plugins?.length) {
                gamePluginListPathResult.error = false;
            }

            const preparedResult = {
                name: VERIFY_SUCCESS,
                gameId: gameIdResult,
                invalid: VERIFY_SUCCESS,
                gameInstallation: {
                    results: {
                        rootDir: gameRootDirResult,
                        modDir: gameModDirResult,
                        pluginListPath: gamePluginListPathResult,
                        configFilePath: gameConfigFilePathResult,
                        saveFolderPath: gameSaveFolderPathResult
                    }
                },
                steamCustomGameId: VERIFY_SUCCESS, // TODO
                rootPathOverride: rootPathOverrideResult,
                modsPathOverride: modsPathOverrideResult,
                configPathOverride: configPathOverrideResult,
                savesPathOverride: savesPathOverrideResult,
                backupsPathOverride: backupsPathOverrideResult,
                mods: modResult,
                rootMods: rootModResult,
                plugins: { results: {} }, // TODO
                externalFilesCache: VERIFY_SUCCESS,
                manageExternalPlugins: VERIFY_SUCCESS,
                manageConfigFiles: VERIFY_SUCCESS,
                manageSaveFiles: manageSaveFilesResult,
                manageSteamCompatSymlinks: VERIFY_SUCCESS, // TODO
                modLinkMode: modLinkModeResult,
                configLinkMode: configLinkModeResult,
                deployed: VERIFY_SUCCESS,
                locked: VERIFY_SUCCESS,
                baseProfile: baseProfileResult,
                defaultGameActions: VERIFY_SUCCESS, // TODO
                customGameActions: VERIFY_SUCCESS, // TODO
                activeGameAction: VERIFY_SUCCESS, // TODO
                rootModSections: VERIFY_SUCCESS, // TODO
                modSections: VERIFY_SUCCESS, // TODO
                calculateModOverwriteFiles: VERIFY_SUCCESS,
                normalizePathCasing: VERIFY_SUCCESS
            };

            function hasVerificationError(result: AppProfile.VerificationResult | AppProfile.CollectedVerificationResult): boolean {
                return "results" in result
                    ? Object.values(result.results).some((result) => {
                        return hasVerificationError(result);
                    })
                    : result.error;
            }

            return {
                properties: preparedResult,
                error: hasVerificationError({ results: preparedResult }),
                found: profileExistsResult.found
            };
        });

        ipcMain.handle("app:queryWarnings", async (
            _event: Electron.IpcMainInvokeEvent,
            {}: AppMessageData<"app:queryWarnings">
        ) => {
            const settings = this.appDataManager.loadSettings();
            const symlinksDisabled = !PathUtils.checkLinkSupported(".", ["."], true, "file");

            return {
                symlinksDisabled
            };
        });

        ipcMain.handle("app:findGameInstallations", async (
            _event: Electron.IpcMainInvokeEvent,
            { gameId }: AppMessageData<"app:findGameInstallations">
        ): Promise<GameInstallation[]> => {
            return this.appDataManager.findAvailableGameInstallations(gameId);
        });

        ipcMain.handle("app:findGameInstallationsByRootDir", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                gameId,
                rootDir
            }: AppMessageData<"app:findGameInstallationsByRootDir">
        ): Promise<GameInstallation[]> => {
            return this.appDataManager.findAvailableGameInstallationsByRootDir(gameId, rootDir);
        });

        ipcMain.handle("app:checkLinkSupported", (
            _event: Electron.IpcMainInvokeEvent,
            { targetPath, destPaths, symlink, symlinkType }: AppMessageData<"app:checkLinkSupported">
        ) => {
            return PathUtils.checkLinkSupported(targetPath, destPaths, symlink, symlinkType);
        });

        ipcMain.handle("profile:resolvePath", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, pathKeys }: AppMessageData<"profile:resolvePath">
        ) => {
            return pathKeys.map((pathKey) => {
                const profilePath = this.profileDataManager.getProfileDirByKey(profile, pathKey);
                return profilePath ? PathUtils.expandPath(profilePath) : profilePath;
            });
        });

        ipcMain.handle("profile:moveFolder", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                pathKey,
                oldProfile,
                newProfile,
                overwrite,
                destructive
            }: AppMessageData<"profile:moveFolder">
        ) => {
            const oldPath = this.profileDataManager.getProfileDirByKey(oldProfile, pathKey);
            const newPath = this.profileDataManager.getProfileDirByKey(newProfile, pathKey);

            if (!oldPath || !newPath) {
                throw new Error("Unable to move folder, could not resolve one or more paths.");
            }

            // Move files
            if (oldPath !== newPath) {
                if (fs.existsSync(newPath)) {
                    if (overwrite || fs.lstatSync(newPath).isSymbolicLink()) {
                        fs.removeSync(newPath);
                        fs.copySync(oldPath, newPath);
                    } else {
                        fs.readdirSync(oldPath).forEach((pathData: string) => fs.copySync(
                            path.join(oldPath, pathData),
                            path.join(newPath, pathData),
                            { overwrite }
                        ));
                    }

                    if (destructive) {
                        fs.removeSync(oldPath);
                    }
                } else {
                    if (destructive) {
                        fs.moveSync(oldPath, newPath);
                    } else {
                        fs.copySync(oldPath, newPath);
                    }
                }
            }

            if (pathKey === "rootPathOverride") {
                const defaultPath = this.profileDataManager.getDefaultProfileDir(newProfile.name);

                if (newPath !== defaultPath) {
                    fs.removeSync(defaultPath);
                    fs.ensureSymlinkSync(newPath, path.resolve(defaultPath), "dir");
                }
            }
        });

        ipcMain.handle("profile:findExternalFiles", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:findExternalFiles">
        ) => {
            return this.profileDataManager.findProfileExternalFiles(profile);
        });

        ipcMain.handle("profile:calculateModOverwriteFilesStart", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile,
                root,
                nonce
            }: AppMessageData<"profile:calculateModOverwriteFilesStart">
        ) => {
            // Return results asynchronously to avoid blocking the renderer thread
            this.profileModManager.calculateModOverwriteFiles(profile, root, async (modOverwriteFiles, modName, _modRef, completed) => {
                // Send progress update to renderer
                if (modOverwriteFiles.length > 0 || completed) {
                    app.mainWindow!.webContents.send("profile:calculateModOverwriteFilesUpdate", {
                        profile,
                        root,
                        nonce,
                        completed,
                        overwriteFiles: modOverwriteFiles.length > 0 ? { [modName]: modOverwriteFiles } : {}
                    });
                }
            });
        });

        ipcMain.handle("profile:findDeployedProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { refProfile }: AppMessageData<"profile:findDeployedProfile">
        ) => {
            return this.profileDataManager.readProfileDeploymentMetadata(refProfile)?.profile;
        });

        ipcMain.handle("profile:beginModAdd", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modPath, root }: AppMessageData<"profile:beginModAdd">
        ) => {
            if (modPath) {
                log.info("Adding mod: ", modPath);
            } else {
                log.info("Adding new mod");
            }

            return this.profileModManager.beginModAdd(profile, root ?? false, modPath);
        });

        ipcMain.handle("profile:beginModExternalImport", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modPath, root }: AppMessageData<"profile:beginModExternalImport">
        ) => {
            if (modPath) {
                log.info("Importing mod: ", modPath);
            } else {
                log.info("Importing new mod");
            }
            
            return this.profileModManager.beginModExternalImport(profile, root ?? false, modPath);
        });

        ipcMain.handle("profile:completeModImport", async (
            _event: Electron.IpcMainInvokeEvent,
            { importRequest }: AppMessageData<"profile:completeModImport">
        ) => {
            return this.profileModManager.completeModImport(importRequest);
        });

        ipcMain.handle("profile:deleteMod", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modName }: AppMessageData<"profile:deleteMod">
        ) => {
            const modDirPath = this.profileDataManager.getProfileOwnModDir(profile, modName);
            log.info("Deleting mod: ", modDirPath);

            await fs.remove(modDirPath);
        });

        ipcMain.handle("profile:renameMod", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modCurName, modNewName }: AppMessageData<"profile:renameMod">
        ) => {
            const modCurDir = this.profileDataManager.getProfileOwnModDir(profile, modCurName);
            const modNewDir = this.profileDataManager.getProfileOwnModDir(profile, modNewName);

            await fs.move(modCurDir, modNewDir);
        });

        ipcMain.handle("profile:readModFilePaths", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile,
                modName,
                modRef,
                normalizePaths
            }: AppMessageData<"profile:readModFilePaths">
        ) => {
            return this.profileDataManager.readModFilePaths(profile, modName, modRef, normalizePaths);
        });

        ipcMain.handle("profile:readDataSubdirs", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile
            }: AppMessageData<"profile:readDataSubdirs">
        ) => {
            const modDir = this.profileDataManager.getProfileDirByKey(profile, "modDir");
            if (modDir === undefined || !fs.existsSync(modDir)) {
                return [];
            }

            return fs.readdirSync(modDir, { recursive: true })
                .filter(file => fs.lstatSync(path.join(modDir, file as string)).isDirectory());
        });

        ipcMain.handle("profile:findPluginFiles", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:findPluginFiles">
        ) => {
            return this.profileDataManager.findPluginFiles(profile);
        });

        ipcMain.handle("profile:findModFiles", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:findModFiles">
        ) => {
            return this.profileDataManager.findModFiles(profile);
        });

        ipcMain.handle("profile:importModOrderBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupPath }: AppMessageData<"profile:importModOrderBackup">
        ) => {
            if (!backupPath) {
                const pickedFile = (await dialog.showOpenDialog({
                    filters: [
                        { 
                            name: "Mod Order Backup", extensions: ["json"]
                        }
                    ]
                }));
                
                backupPath = pickedFile?.filePaths[0];
            }

            if (!backupPath) {
                return undefined;
            }

            return this.profileDataManager.importProfileModOrderBackup(profile, backupPath);
        })

        ipcMain.handle("profile:createModOrderBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupName }: AppMessageData<"profile:createModOrderBackup">
        ) => {
            return this.profileDataManager.createProfileModOrderBackup(profile, backupName);
        });

        ipcMain.handle("profile:readModOrderBackups", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readModOrderBackups">
        ) => {
            return this.profileDataManager.readProfileModOrderBackups(profile);
        });

        ipcMain.handle("profile:deleteModOrderBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupFile }: AppMessageData<"profile:deleteModOrderBackup">
        ) => {
            return this.profileDataManager.deleteProfileModOrderBackup(profile, backupFile);
        });

        ipcMain.handle("profile:importPluginBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupPath }: AppMessageData<"profile:importPluginBackup">
        ) => {
            if (!backupPath) {
                const pickedFile = (await dialog.showOpenDialog({
                    filters: [
                        { 
                            name: "Plugin List Backup", extensions: ["json"]
                        }
                    ]
                }));
                
                backupPath = pickedFile?.filePaths[0];
            }

            if (!backupPath) {
                return undefined;
            }

            return this.profileDataManager.importProfilePluginBackup(profile, backupPath);
        });

        ipcMain.handle("profile:createPluginBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupName }: AppMessageData<"profile:createPluginBackup">
        ) => {
            return this.profileDataManager.createProfilePluginBackup(profile, backupName);
        });

        ipcMain.handle("profile:deletePluginBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupFile }: AppMessageData<"profile:deletePluginBackup">
        ) => {
            return this.profileDataManager.deleteProfilePluginBackup(profile, backupFile);
        });

        ipcMain.handle("profile:readPluginBackups", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readPluginBackups">
        ) => {
            return this.profileDataManager.readProfilePluginBackups(profile);
        });

        ipcMain.handle("profile:exportPluginList", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:exportPluginList">
        ) => {
            const pickedFile = await dialog.showSaveDialog({
                filters: [
                    { 
                        name: "Plugin List", extensions: ["txt", "*"]
                    }
                ]
            });
            
            const pluginListPath = pickedFile?.filePath;
            if (pluginListPath) {
                return this.profileDeploymentManager.exportProfilePluginList(profile, pluginListPath);
            }
        });

        ipcMain.handle("profile:importConfigBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupPath }: AppMessageData<"profile:importConfigBackup">
        ) => {
            if (!backupPath) {
                const pickedFile = (await dialog.showOpenDialog({
                    properties: ["openDirectory"]
                }));
                
                backupPath = pickedFile?.filePaths[0];
            }

            if (!backupPath) {
                return undefined;
            }

            return this.profileDataManager.importProfileConfigBackup(profile, backupPath);
        });

        ipcMain.handle("profile:createConfigBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupName }: AppMessageData<"profile:createConfigBackup">
        ) => {
            return this.profileDataManager.createProfileConfigBackup(profile, backupName);
        });

        ipcMain.handle("profile:readConfigBackups", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readConfigBackups">
        ) => {
            return this.profileDataManager.readProfileConfigBackups(profile);
        });

        ipcMain.handle("profile:deleteConfigBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupFile }: AppMessageData<"profile:deleteConfigBackup">
        ) => {
            return this.profileDataManager.deleteProfileConfigBackup(profile, backupFile);
        });

        ipcMain.handle("profile:checkArchiveInvalidationEnabled", async (
            _event: Electron.IpcMainInvokeEvent,
            {profile}: AppMessageData<"profile:checkArchiveInvalidationEnabled">
        ) => {
            return this.profileDataManager.checkArchiveInvalidationEnabled(profile);
        });

        ipcMain.handle("profile:setArchiveInvalidationEnabled", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, enabled }: AppMessageData<"profile:setArchiveInvalidationEnabled">
        ) => {
            return this.profileDataManager.setArchiveInvalidationEnabled(profile, enabled);
        });

        ipcMain.handle("profile:deploy", async (_event: Electron.IpcMainInvokeEvent, {
            profile, deployPlugins
        }: AppMessageData<"profile:deploy">) => {
                return this.profileDeploymentManager.deployProfile(profile, deployPlugins);
        });

        ipcMain.handle("profile:undeploy", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:undeploy">
        ) => {
            return this.profileDeploymentManager.undeployProfile(profile);
        });

        ipcMain.handle("profile:showModInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modName, modRef }: AppMessageData<"profile:showModInFileExplorer">
        ) => {
            const modDirPath = this.profileDataManager.getProfileModDir(profile, modName, modRef);

            shell.openPath(path.resolve(modDirPath));
        });

        ipcMain.handle("profile:showProfileDirInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, profileKey }: AppMessageData<"profile:showProfileDirInFileExplorer">
        ) => {
            const profileDir = this.profileDataManager.getProfileDirByKey(profile, profileKey);

            if (!profileDir) {
                return; // TODO - Error
            }

            shell.openPath(path.resolve(PathUtils.expandPath(profileDir)));
        });

        ipcMain.handle("profile:showProfileModOrderBackupsInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:showProfileModOrderBackupsInFileExplorer">
        ) => {
            const backupDir = this.profileDataManager.getProfileModOrderBackupsDir(profile);

            shell.openPath(path.resolve(backupDir));
        });

        ipcMain.handle("profile:showProfilePluginBackupsInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:showProfilePluginBackupsInFileExplorer">
        ) => {
            const backupDir = this.profileDataManager.getProfilePluginBackupsDir(profile);

            shell.openPath(path.resolve(backupDir));
        });

        ipcMain.handle("profile:showProfileConfigBackupsInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:showProfileConfigBackupsInFileExplorer">
        ) => {
            const backupDir = this.profileDataManager.getProfileConfigBackupsDir(profile);

            shell.openPath(path.resolve(backupDir));
        });

        ipcMain.handle("profile:runGameAction", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, gameAction }: AppMessageData<"profile:runGameAction">
        ) => {
            this.profileDataManager.runGameAction(profile, gameAction);
        });

        ipcMain.handle("profile:resolveDefaultGameActions", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:resolveDefaultGameActions">
        ) => {
            return this.profileDataManager.resolveDefaultGameActions(profile);
        });

        ipcMain.handle("profile:openProfileConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile,
                configFileName,
                includeGameFiles
            }: AppMessageData<"profile:openProfileConfigFile">
        ) => {
            const profileConfigFilePath = this.profileDataManager.resolveGameConfigFilePath(profile, configFileName, !!includeGameFiles);

            if (!!profileConfigFilePath && fs.existsSync(profileConfigFilePath)) {
                return shell.openPath(path.resolve(profileConfigFilePath));
            }

            return undefined;
        });

        ipcMain.handle("profile:deleteProfileConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, configFileName }: AppMessageData<"profile:deleteProfileConfigFile">
        ) => {
            const profileConfigFilePath = this.profileDataManager.resolveGameConfigFilePath(profile, configFileName, false);

            if (!!profileConfigFilePath && fs.existsSync(profileConfigFilePath)) {
                fs.rmSync(path.resolve(profileConfigFilePath));
            }

            return profile;
        });

        ipcMain.handle("profile:dirLinkSupported", (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile,
                srcDir,
                destDirs,
                symlink,
                symlinkType,
                checkBaseProfile
            }: AppMessageData<"profile:dirLinkSupported">
        ) => {
            return this.profileDataManager.checkProfileLinkSupported(
                profile,
                srcDir,
                destDirs,
                symlink,
                symlinkType,
                checkBaseProfile
            );
        });

        ipcMain.handle("profile:normalizePathCasingRecommended", (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:normalizePathCasingRecommended">
        ) => {
            if (!profile.gameInstallation?.modDir) {
                return false;
            }

            if (!fs.existsSync(profile.gameInstallation.modDir)) {
                return false;
            }

            const testFilePathLower = path.join(
                profile.gameInstallation.modDir,
                AppConstants.PROFILE_PATH_CASE_NORMALIZATION_TEST_FILE.toLowerCase()
            );

            const testFilePathUpper = path.join(
                profile.gameInstallation.modDir,
                AppConstants.PROFILE_PATH_CASE_NORMALIZATION_TEST_FILE.toUpperCase()
            );

            try {
                fs.createFileSync(testFilePathLower);

                // Check if directory is case-sensitive
                return !fs.existsSync(testFilePathUpper);
            } catch (e) {
                return false;
            } finally {
                fs.removeSync(testFilePathLower);
            }
        });

        ipcMain.handle("profile:steamCompatSymlinksSupported", (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:steamCompatSymlinksSupported">
        ) => {
            if (!profile.gameInstallation?.steamId?.length || !profile.steamCustomGameId) {
                return false;
            }

            const appSettings = this.appDataManager.loadSettings();
            const gameCompatSteamuserDir = SteamUtils.getSteamCompatSteamuserDir(profile.gameInstallation);
            const customCompatSteamuserDir = SteamUtils.getCoreSteamCompatSteamuserDir(appSettings, profile.steamCustomGameId);

            if (!gameCompatSteamuserDir || !customCompatSteamuserDir || !fs.existsSync(gameCompatSteamuserDir) || !fs.existsSync(customCompatSteamuserDir)) {
                return false;
            }

            return PathUtils.checkLinkSupported(gameCompatSteamuserDir, [customCompatSteamuserDir], true, "dir");
        });

        ipcMain.handle("profile:readConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, fileName, loadDefaults }: AppMessageData<"profile:readConfigFile">
        ) => {
            return this.profileDataManager.readProfileConfigFile(profile, fileName, loadDefaults);
        });

        ipcMain.handle("profile:readSaveFiles", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readSaveFiles">
        ) => {
            return this.profileDataManager.readProfileSaveFiles(profile);
        });

        ipcMain.handle("profile:updateConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, fileName, data }: AppMessageData<"profile:updateConfigFile">
        ) => {
            this.profileDataManager.updateProfileConfigFile(profile, fileName, data);
        });

        ipcMain.handle("profile:deleteSaveFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, save }: AppMessageData<"profile:deleteSaveFile">
        ) => {
            return this.profileDataManager.deleteProfileSaveFile(profile, save);
        });

        ipcMain.handle("profile:resolveGameBinaryVersion", (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:resolveGameBinaryVersion">
        ) => {
            if (!profile.gameInstallation.rootDir) {
                return undefined;
            }

            const gameDetails = this.appDataManager.getGameDetails(profile.gameId);
            if (!gameDetails) {
                return undefined;
            }

            const gameBinaryName = gameDetails.gameBinary.find(binaryName => fs.existsSync(path.join(profile.gameInstallation.rootDir, binaryName)));
            if (!gameBinaryName) {
                return undefined;
            }

            const gameBinaryPath = path.join(profile.gameInstallation.rootDir, gameBinaryName);
            const gameBinaryVersionInfo = winVersionInfo(gameBinaryPath);
            
            return gameBinaryVersionInfo?.FileVersion;
        });
    }

    private get appDataManager(): AppDataManager {
        return this.app.appDataManager;
    }

    private get profileDataManager(): ProfileDataManager {
        return this.app.profileDataManager;
    }

    private get profileModManager(): ProfileModManager {
        return this.app.profileModManager;
    }

    private get profileDeploymentManager(): ProfileDeploymentManager {
        return this.app.profileDeploymentManager;
    }
}