import type Electron from "electron";
import type { AppMessageData } from "../app/models/app-message";
import type { AppResource } from "../app/models/app-resource";
import type { AppBaseProfile, AppProfile } from "../app/models/app-profile";
import type { ModImportRequest, ModImportResult } from "../app/models/mod-import-status";
import type { AppSettingsUserCfg } from "../app/models/app-settings-user-cfg";
import type { GameDatabase } from "../app/models/game-database";
import type { GameId } from "../app/models/game-id";
import type { GameInstallation } from "../app/models/game-installation";
import type { GameDetails } from "../app/models/game-details";
import type { GamePluginListType } from "../app/models/game-plugin-list-type";
import type { ModProfileRef } from "../app/models/mod-profile-ref";
import type { ModDeploymentMetadata } from "../app/models/mod-deployment-metadata";
import type { Fomod } from "../app/models/fomod";
import type { ModInstaller } from "../app/models/mod-installer";
import type { GamePluginProfileRef } from "../app/models/game-plugin-profile-ref";
import type { GameAction } from "../app/models/game-action";
import type { ModOverwriteFilesEntry } from "../app/models/mod-overwrite-files";

import * as log from "electron-log/main";
import * as Seven from "node-7z";
import * as sevenBin from "7zip-bin";
import * as which from "which";
import * as xml2js from "xml2js";
import * as mime from "mime-types";
import { default as winVersionInfo } from "win-version-info";
import { default as detectFileEncodingAndLanguage } from "detect-file-encoding-and-language";
import { cloneDeep, isNotNil, omit, orderBy, last, remove, uniq } from "es-toolkit";
import { template } from "es-toolkit/compat";

// TODO - Figure out how to import runtime dependencies below without CommonJS via angular.json:

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeImage } = require("electron") as typeof Electron;
const { exec } = require("child_process") as typeof import("child_process");
const url = require("url") as typeof import("url");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
const fs = require("fs-extra") as typeof import("fs-extra");
const fsPromises = require("fs/promises") as typeof import("fs/promises");

type SymlinkType = "file" | "dir" | "junction";

const DEBUG_MODE = !app.isPackaged;
const ELECTRON_DIR = __dirname;
const APP_DIR = path.join(ELECTRON_DIR, "..");
const BROWSER_DIR = path.join(APP_DIR, "browser");
const BUILD_DATE_FILE = path.join(APP_DIR, "lastbuild.txt");
const PRELOAD_SCRIPT = path.join(ELECTRON_DIR, "scripts.js");

class ElectronLoader {

    static APP_NAME = "Stellar Mod Loader";
    static APP_SHORT_NAME = "Stellar";
    static APP_SETTINGS_FILE = "settings.json";
    static APP_PROFILES_DIR = "profiles";
    static APP_PACKAGE_FILE = path.join(APP_DIR, "package.json");
    static APP_DEPS_INFO_FILE = path.join(APP_DIR, "3rdpartylicenses.json");
    static APP_DEPS_LICENSES_FILE = path.join(BROWSER_DIR, "3rdpartylicenses.txt");
    static APP_ELECTRON_DEPS_LICENSES_FILE = path.join(ELECTRON_DIR, "3rdpartylicenses.txt");
    static APP_ICON_IMG = nativeImage.createFromPath(path.join(BROWSER_DIR, "favicon.png"));
    static APP_PACKAGE = ((): { name: string; version: string; repository: string; } => {
        try {
            return fs.readJSONSync(this.APP_PACKAGE_FILE, { encoding: "utf-8" });
        } catch (err) {
            return { name: this.APP_NAME, version: "master", repository: "" };
        }
    })();
    static APP_VERSION = this.APP_PACKAGE.version;
    static APP_RESOURCES: Record<AppResource, string> = {
        "readme_offline": `file://${process.cwd()}/README.md`,
        "readme_online": `${this.APP_PACKAGE.repository}/blob/${this.APP_VERSION}/README.md`,
        "latest_release": `${this.APP_PACKAGE.repository}/releases/latest`,
        "license": `file://${process.cwd()}/LICENSE`,
        "homepage": this.APP_PACKAGE.repository,
        "issues": `${this.APP_PACKAGE.repository}/issues`,
        "paypal_donation": "https://paypal.me/lVlyke"
    };
    static APP_TMP_DIR = path.resolve(path.join(os.tmpdir(), "SML"));
    static GAME_SCHEMA_VERSION = 1.1;
    static GAME_DB_FILE = path.join(APP_DIR, "game-db.json");
    static GAME_RESOURCES_DIR = path.join(APP_DIR, "resources");
    static PROFILE_SETTINGS_FILE = "profile.json";
    static PROFILE_METADATA_FILE = ".sml.json";
    static PROFILE_MODS_DIR = "mods";
    static PROFILE_CONFIG_DIR = "config";
    static PROFILE_SAVE_DIR = "save";
    static PROFILE_BACKUPS_DIR = "backups";
    static PROFILE_BACKUPS_MOD_ORDER_DIR = "modorder";
    static PROFILE_BACKUPS_PLUGINS_DIR = "plugins";
    static PROFILE_BACKUPS_CONFIG_DIR = "config";
    static PROFILE_MODS_STAGING_DIR = "_tmp";
    static PROFILE_LINK_SUPPORT_TEST_FILE = ".sml_link_test";
    static PROFILE_PATH_CASE_NORMALIZATION_TEST_FILE = ".sml_pcn_test";
    static DEPLOY_EXT_BACKUP_DIR = ".sml.bak";
    static STEAM_DEFAULT_COMPAT_DATA_ROOT = "~/.local/share/Steam/steamapps/compatdata";
    static STEAM_COMPAT_STEAMUSER_DIR = "pfx/drive_c/users/steamuser";

    #CLI_COMMAND_EXECUTORS: Record<string, (...args: any[]) => Promise<boolean>> = {
        "-l": async (...args: any[]) => this.directLaunchProfileByName(args[0], args[1]),
        "--launch": async (...args: any[]) => this.directLaunchProfileByName(args[0], args[1]),
    }
    
    private mainWindow?: Electron.BrowserWindow;
    private menu: Electron.Menu;

    constructor() {
        log.initialize();
        
        log.transports.console.level = false;
        log.transports.ipc.level = false;
        log.transports.file.level = DEBUG_MODE ? "debug" : "info";
        log.transports.file.resolvePathFn = () => "app.log";

        this.enableConsoleLogHook();

        this.menu = this.createMenu();
        Menu.setApplicationMenu(this.menu);

        // This method will be called when Electron has finished
        // initialization and is ready to create browser windows.
        // Some APIs can only be used after this event occurs.
        app.whenReady().then(async () => {
            // Check for any launch commands
            await this.#checkCliCommands();

            this.#initWindow();

            app.on('activate', () => {
                // On macOS it's common to re-create a window in the app when the
                // dock icon is clicked and there are no other windows open.
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.#initWindow();
                }
            });

            // Send all log entries to the renderer process
            log.hooks.push((message: any, transport: any) => {
                if (transport === log.transports.file) {
                    this.mainWindow!.webContents.send("app:log", {
                        level: message.level,
                        text: this.#formatLogData(message.data),
                        timestamp: message.date
                    });
                }
    
                return message;
            });
        });

        // Quit when all windows are closed, except on macOS. There, it's common
        // for applications and their menu bar to stay active until the user quits
        // explicitly with Cmd + Q.
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        ipcMain.handle("app:getInfo", (
            _event: Electron.IpcMainInvokeEvent,
            {}: AppMessageData<"app:getInfo">
        ) => {
            return this.getAppAboutInfo();
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

                this.mainWindow!.setTitle(`${appState.activeProfile.name} [${gameTitle}] - ${ElectronLoader.APP_SHORT_NAME}`);
            }

            // Sync mod list column menu checkbox state
            const activeModListCols = appState.modListColumns ?? defaultModListCols;
            modListCols.forEach((col) => {
                const colMenuItem = this.menu.getMenuItemById(`mod-list-col-${col}`);
                if (colMenuItem) {
                    colMenuItem.checked = activeModListCols.includes(col);
                }
            });

            // Sync profile lock state
            const lockProfilePanelItem = this.menu.getMenuItemById("lock-profile");
            const unlockProfilePanelItem = this.menu.getMenuItemById("unlock-profile");
            if (lockProfilePanelItem) {
                lockProfilePanelItem.visible = !appState.activeProfile?.locked;
            }

            if (unlockProfilePanelItem) {
                unlockProfilePanelItem.visible = !!appState.activeProfile?.locked;
            }
            

            // Sync log panel visibility state
            const toggleLogPanelItem = this.menu.getMenuItemById("show-log-panel");
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
                const menuItem = this.menu.getMenuItemById(profileActionId);
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
            return this.#firstValidPath(paths, data.dirname ? (curPath: string) => path.dirname(curPath) : undefined);
        });

        ipcMain.handle("app:openFile", async (
            _event: Electron.IpcMainInvokeEvent,
            data: AppMessageData<"app:openFile">
        ) => {
            data.path = this.#expandPath(path.resolve(data.path));
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
                return this.loadProfileList();
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
                return this.loadSettings();
            } catch (e) {
                log.error(e);
                return null;
            }
        });

        ipcMain.handle("app:saveSettings", async (
            _event: Electron.IpcMainInvokeEvent, 
            { settings }: AppMessageData<"app:saveSettings">
        ) => {
           return this.saveSettings(settings);
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
                return this.exportGameDetails(gameDetails, gamePath);
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
                return this.loadGameDatabase(includeCustomGames);
            } catch (e) {
                log.error(e);
                return null;
            }
        });

        ipcMain.handle("app:resolveResourceUrl", async (
            _event: Electron.IpcMainInvokeEvent,
            { resource }: AppMessageData<"app:resolveResourceUrl">
        ) => {
            return ElectronLoader.APP_RESOURCES[resource];
        });

        ipcMain.handle("app:loadProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { name, gameId }: AppMessageData<"app:loadProfile">
        ) => {
            return this.loadProfile(name);
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
                    const stagingDir = path.resolve(path.join(ElectronLoader.APP_TMP_DIR, profileName));
                    const _7zBinaryPath = this.#resolve7zBinaryPath();

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
                const loadedProfile = this.loadProfileFromPath(profilePath, profilePath);

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
            return this.saveProfile(profile);
        });

        ipcMain.handle("app:exportProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"app:exportProfile">
        ) => {
            const profileDir = this.getProfileDir(profile);
            const defaultProfileDir = this.getDefaultProfileDir(profile.name);

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
                const _7zBinaryPath = this.#resolve7zBinaryPath();

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
            const backupDir = path.join(ElectronLoader.APP_TMP_DIR, `${profile.name}.bak_${this.#asFileName(new Date().toISOString())}`);
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
            return this.deleteProfile(profile);
        });

        ipcMain.handle("app:copyProfile", async (
            _event: Electron.IpcMainInvokeEvent,
            { srcProfile, destProfile }: AppMessageData<"app:copyProfile">
        ) => {
            function shouldCopyDir(srcPath: string, destPath: string) {
                return fs.existsSync(srcPath) && (!fs.existsSync(destPath) || fs.realpathSync(srcPath) !== fs.realpathSync(destPath));
            }

            log.info("Copying profile src: ", srcProfile.name, " dest: ", destProfile.name);

            const srcModsDir = this.getProfileModsDir(srcProfile);
            const destModsDir = this.getProfileModsDir(destProfile);

            // Copy profile mods
            if (shouldCopyDir(srcModsDir, destModsDir)) {
                fs.mkdirpSync(destModsDir);
                fs.copySync(srcModsDir, destModsDir);
            }

            const srcConfigDir = this.getProfileConfigDir(srcProfile);
            const destConfigDir = this.getProfileConfigDir(destProfile);

            // Copy config files
            if (shouldCopyDir(srcConfigDir, destConfigDir)) {
                fs.mkdirpSync(destConfigDir);
                fs.copySync(srcConfigDir, destConfigDir);
            }

            const srcSaveDir = this.getProfileSaveDir(srcProfile);
            const destSaveDir = this.getProfileSaveDir(destProfile);

            // Copy save files
            if (shouldCopyDir(srcSaveDir, destSaveDir)) {
                fs.mkdirpSync(destSaveDir);
                fs.copySync(srcSaveDir, destSaveDir);
            }

            const srcBackupsDir = this.getProfileBackupsDir(srcProfile);
            const destBackupsDir = this.getProfileBackupsDir(destProfile);

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
            const gameDb = this.loadGameDatabase();

            const gameIdResult = profile.gameId !== undefined && !!gameDb[profile.gameId]
                ? VERIFY_SUCCESS
                : VERIFY_FAIL;
            const profileExistsResult = this.verifyProfilePathExists(this.getProfileDir(profile));
            const modResult = this.verifyProfileMods(false, profile);
            const rootModResult = this.verifyProfileMods(true, profile);
            const baseProfileResult = profile.baseProfile
                ? this.verifyProfilePathExists(this.getProfileDir(profile.baseProfile))
                : VERIFY_SUCCESS;
            const gameModDirResult = "gameInstallation" in profile
                ? this.verifyProfilePathExists(profile.gameInstallation.modDir)
                : VERIFY_SUCCESS;
            const gameRootDirResult = "gameInstallation" in profile
                ? this.verifyProfilePathExists(profile.gameInstallation.rootDir)
                : VERIFY_SUCCESS;
            const gamePluginListPathResult = "gameInstallation" in profile && profile.gameInstallation.pluginListPath
                ? this.verifyProfilePathExists(path.dirname(profile.gameInstallation.pluginListPath))
                : VERIFY_SUCCESS;
            const gameConfigFilePathResult = "gameInstallation" in profile && profile.gameInstallation.configFilePath
                ? this.verifyProfilePathExists(profile.gameInstallation.configFilePath)
                : VERIFY_SUCCESS;
            const gameSaveFolderPathResult = "gameInstallation" in profile && profile.gameInstallation.saveFolderPath
                ? this.verifyProfilePathExists(profile.gameInstallation.saveFolderPath)
                : VERIFY_SUCCESS;
            const rootPathOverrideResult = profile.rootPathOverride
                ? this.verifyProfilePathExists(profile.rootPathOverride)
                : VERIFY_SUCCESS;
            const modsPathOverrideResult = profile.modsPathOverride
                ? this.verifyProfilePathExists(profile.modsPathOverride)
                : VERIFY_SUCCESS;
            const configPathOverrideResult = profile.configPathOverride
                ? this.verifyProfilePathExists(profile.configPathOverride)
                : VERIFY_SUCCESS;
            const savesPathOverrideResult = profile.savesPathOverride
                ? this.verifyProfilePathExists(profile.savesPathOverride)
                : VERIFY_SUCCESS;
            const backupsPathOverrideResult = profile.backupsPathOverride
                ? this.verifyProfilePathExists(profile.backupsPathOverride)
                : VERIFY_SUCCESS;
            const modLinkModeResult = ("gameModDir" in profile && profile.modLinkMode) ? (this.checkLinkSupported(
                profile,
                "modsPathOverride",
                ["modDir", "rootDir"],
                false,
                undefined,
                true
            ) ? VERIFY_SUCCESS : VERIFY_FAIL) : VERIFY_SUCCESS;
            const configLinkModeResult = ("gameInstallation" in profile && profile.configLinkMode) ? (this.#checkLinkSupported(
                this.getProfileDirByKey(profile, "configPathOverride") ?? "",
                [this.getProfileDirByKey(profile, "configFilePath") ?? ""],
                true,
                "file"
            ) ? VERIFY_SUCCESS : VERIFY_FAIL) : VERIFY_SUCCESS;
            const manageSaveFilesResult = ("gameInstallation" in profile && profile.manageSaveFiles) ? ((profile.deployed || this.#checkLinkSupported(
                this.getProfileDirByKey(profile, "savesPathOverride") ?? "",
                // Use `gameSaveFolderPath` parent dir in case a deploy is active
                [path.join(this.getProfileDirByKey(profile, "saveFolderPath") ?? "", "..")], 
                true,
                "junction"
            )) ? VERIFY_SUCCESS : VERIFY_FAIL) : VERIFY_SUCCESS;
            
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
            const settings = this.loadSettings();
            const symlinksDisabled = !this.#checkLinkSupported(".", ["."], true, "file");

            return {
                symlinksDisabled
            };
        });

        ipcMain.handle("app:findGameInstallations", async (
            _event: Electron.IpcMainInvokeEvent,
            { gameId }: AppMessageData<"app:findGameInstallations">
        ): Promise<GameInstallation[]> => {
            return this.#findAvailableGameInstallations(gameId);
        });

        ipcMain.handle("app:findGameInstallationsByRootDir", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                gameId,
                rootDir
            }: AppMessageData<"app:findGameInstallationsByRootDir">
        ): Promise<GameInstallation[]> => {
            return this.#findAvailableGameInstallationsByRootDir(gameId, rootDir);
        });

        ipcMain.handle("app:checkLinkSupported", (
            _event: Electron.IpcMainInvokeEvent,
            { targetPath, destPaths, symlink, symlinkType }: AppMessageData<"app:checkLinkSupported">
        ) => {
            return this.#checkLinkSupported(targetPath, destPaths, symlink, symlinkType);
        });

        ipcMain.handle("profile:resolvePath", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, pathKeys }: AppMessageData<"profile:resolvePath">
        ) => {
            return pathKeys.map((pathKey) => {
                const profilePath = this.getProfileDirByKey(profile, pathKey);
                return profilePath ? this.#expandPath(profilePath) : profilePath;
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
            const oldPath = this.getProfileDirByKey(oldProfile, pathKey);
            const newPath = this.getProfileDirByKey(newProfile, pathKey);

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
                const defaultPath = this.getDefaultProfileDir(newProfile.name);

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
            return this.findProfileExternalFiles(profile);
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
            this.calculateModOverwriteFiles(profile, root, async (modOverwriteFiles, modName, _modRef, completed) => {
                // Send progress update to renderer
                if (modOverwriteFiles.length > 0 || completed) {
                    this.mainWindow!.webContents.send("profile:calculateModOverwriteFilesUpdate", {
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
            return this.readProfileDeploymentMetadata(refProfile)?.profile;
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

            return this.beginModAdd(profile, root ?? false, modPath);
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
            
            return this.beginModExternalImport(profile, root ?? false, modPath);
        });

        ipcMain.handle("profile:completeModImport", async (
            _event: Electron.IpcMainInvokeEvent,
            { importRequest }: AppMessageData<"profile:completeModImport">
        ) => {
            return this.completeModImport(importRequest);
        });

        ipcMain.handle("profile:deleteMod", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modName }: AppMessageData<"profile:deleteMod">
        ) => {
            const modDirPath = this.getProfileOwnModDir(profile, modName);
            log.info("Deleting mod: ", modDirPath);

            await fs.remove(modDirPath);
        });

        ipcMain.handle("profile:renameMod", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modCurName, modNewName }: AppMessageData<"profile:renameMod">
        ) => {
            const modCurDir = this.getProfileOwnModDir(profile, modCurName);
            const modNewDir = this.getProfileOwnModDir(profile, modNewName);

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
            return this.readModFilePaths(profile, modName, modRef, normalizePaths);
        });

        ipcMain.handle("profile:readDataSubdirs", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile
            }: AppMessageData<"profile:readDataSubdirs">
        ) => {
            const modDir = this.getProfileDirByKey(profile, "modDir");
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
            return this.findPluginFiles(profile);
        });

        ipcMain.handle("profile:findModFiles", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:findModFiles">
        ) => {
            return this.findModFiles(profile);
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

            return this.importProfileModOrderBackup(profile, backupPath);
        })

        ipcMain.handle("profile:createModOrderBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupName }: AppMessageData<"profile:createModOrderBackup">
        ) => {
            return this.createProfileModOrderBackup(profile, backupName);
        });

        ipcMain.handle("profile:readModOrderBackups", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readModOrderBackups">
        ) => {
            return this.readProfileModOrderBackups(profile);
        });

        ipcMain.handle("profile:deleteModOrderBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupFile }: AppMessageData<"profile:deleteModOrderBackup">
        ) => {
            return this.deleteProfileModOrderBackup(profile, backupFile);
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

            return this.importProfilePluginBackup(profile, backupPath);
        });

        ipcMain.handle("profile:createPluginBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupName }: AppMessageData<"profile:createPluginBackup">
        ) => {
            return this.createProfilePluginBackup(profile, backupName);
        });

        ipcMain.handle("profile:deletePluginBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupFile }: AppMessageData<"profile:deletePluginBackup">
        ) => {
            return this.deleteProfilePluginBackup(profile, backupFile);
        });

        ipcMain.handle("profile:readPluginBackups", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readPluginBackups">
        ) => {
            return this.readProfilePluginBackups(profile);
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
                return this.exportProfilePluginList(profile, pluginListPath);
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

            return this.importProfileConfigBackup(profile, backupPath);
        });

        ipcMain.handle("profile:createConfigBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupName }: AppMessageData<"profile:createConfigBackup">
        ) => {
            return this.createProfileConfigBackup(profile, backupName);
        });

        ipcMain.handle("profile:readConfigBackups", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readConfigBackups">
        ) => {
            return this.readProfileConfigBackups(profile);
        });

        ipcMain.handle("profile:deleteConfigBackup", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, backupFile }: AppMessageData<"profile:deleteConfigBackup">
        ) => {
            return this.deleteProfileConfigBackup(profile, backupFile);
        });

        ipcMain.handle("profile:checkArchiveInvalidationEnabled", async (
            _event: Electron.IpcMainInvokeEvent,
            {profile}: AppMessageData<"profile:checkArchiveInvalidationEnabled">
        ) => {
            return this.checkArchiveInvalidationEnabled(profile);
        });

        ipcMain.handle("profile:setArchiveInvalidationEnabled", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, enabled }: AppMessageData<"profile:setArchiveInvalidationEnabled">
        ) => {
            return this.setArchiveInvalidationEnabled(profile, enabled);
        });

        ipcMain.handle("profile:deploy", async (_event: Electron.IpcMainInvokeEvent, {
            profile, deployPlugins
        }: AppMessageData<"profile:deploy">) => {
                return this.deployProfile(profile, deployPlugins);
        });

        ipcMain.handle("profile:undeploy", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:undeploy">
        ) => {
            return this.undeployProfile(profile);
        });

        ipcMain.handle("profile:showModInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, modName, modRef }: AppMessageData<"profile:showModInFileExplorer">
        ) => {
            const modDirPath = this.getProfileModDir(profile, modName, modRef);

            shell.openPath(path.resolve(modDirPath));
        });

        ipcMain.handle("profile:showProfileDirInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, profileKey }: AppMessageData<"profile:showProfileDirInFileExplorer">
        ) => {
            const profileDir = this.getProfileDirByKey(profile, profileKey);

            if (!profileDir) {
                return; // TODO - Error
            }

            shell.openPath(path.resolve(this.#expandPath(profileDir)));
        });

        ipcMain.handle("profile:showProfileModOrderBackupsInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:showProfileModOrderBackupsInFileExplorer">
        ) => {
            const backupDir = this.getProfileModOrderBackupsDir(profile);

            shell.openPath(path.resolve(backupDir));
        });

        ipcMain.handle("profile:showProfilePluginBackupsInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:showProfilePluginBackupsInFileExplorer">
        ) => {
            const backupDir = this.getProfilePluginBackupsDir(profile);

            shell.openPath(path.resolve(backupDir));
        });

        ipcMain.handle("profile:showProfileConfigBackupsInFileExplorer", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:showProfileConfigBackupsInFileExplorer">
        ) => {
            const backupDir = this.getProfileConfigBackupsDir(profile);

            shell.openPath(path.resolve(backupDir));
        });

        ipcMain.handle("profile:runGameAction", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, gameAction }: AppMessageData<"profile:runGameAction">
        ) => {
            this.runGameAction(profile, gameAction);
        });

        ipcMain.handle("profile:resolveDefaultGameActions", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:resolveDefaultGameActions">
        ) => {
            return this.resolveDefaultGameActions(profile);
        });

        ipcMain.handle("profile:openProfileConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            {
                profile,
                configFileName,
                includeGameFiles
            }: AppMessageData<"profile:openProfileConfigFile">
        ) => {
            const profileConfigFilePath = this.resolveGameConfigFilePath(profile, configFileName, !!includeGameFiles);

            if (!!profileConfigFilePath && fs.existsSync(profileConfigFilePath)) {
                return shell.openPath(path.resolve(profileConfigFilePath));
            }

            return undefined;
        });

        ipcMain.handle("profile:deleteProfileConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, configFileName }: AppMessageData<"profile:deleteProfileConfigFile">
        ) => {
            const profileConfigFilePath = this.resolveGameConfigFilePath(profile, configFileName, false);

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
            return this.checkLinkSupported(
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
                ElectronLoader.PROFILE_PATH_CASE_NORMALIZATION_TEST_FILE.toLowerCase()
            );

            const testFilePathUpper = path.join(
                profile.gameInstallation.modDir,
                ElectronLoader.PROFILE_PATH_CASE_NORMALIZATION_TEST_FILE.toUpperCase()
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

            const gameCompatSteamuserDir = this.#getSteamCompatSteamuserDir(profile.gameInstallation);
            const customCompatSteamuserDir = this.#getCoreSteamCompatSteamuserDir(profile.steamCustomGameId);

            if (!gameCompatSteamuserDir || !customCompatSteamuserDir || !fs.existsSync(gameCompatSteamuserDir) || !fs.existsSync(customCompatSteamuserDir)) {
                return false;
            }

            return this.#checkLinkSupported(gameCompatSteamuserDir, [customCompatSteamuserDir], true, "dir");
        });

        ipcMain.handle("profile:readConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, fileName, loadDefaults }: AppMessageData<"profile:readConfigFile">
        ) => {
            return this.readProfileConfigFile(profile, fileName, loadDefaults);
        });

        ipcMain.handle("profile:readSaveFiles", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:readSaveFiles">
        ) => {
            return this.readProfileSaveFiles(profile);
        });

        ipcMain.handle("profile:updateConfigFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, fileName, data }: AppMessageData<"profile:updateConfigFile">
        ) => {
            this.updateProfileConfigFile(profile, fileName, data);
        });

        ipcMain.handle("profile:deleteSaveFile", async (
            _event: Electron.IpcMainInvokeEvent,
            { profile, save }: AppMessageData<"profile:deleteSaveFile">
        ) => {
            return this.deleteProfileSaveFile(profile, save);
        });

        ipcMain.handle("profile:resolveGameBinaryVersion", (
            _event: Electron.IpcMainInvokeEvent,
            { profile }: AppMessageData<"profile:resolveGameBinaryVersion">
        ) => {
            if (!profile.gameInstallation.rootDir) {
                return undefined;
            }

            const gameDetails = this.#getGameDetails(profile.gameId);
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

    #initWindow() {
        // Create the browser window
        this.mainWindow = new BrowserWindow({
            title: ElectronLoader.APP_NAME,
            icon: ElectronLoader.APP_ICON_IMG,
            width: 1280,
            height: 720,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: PRELOAD_SCRIPT
            }
        });

        // Enable HMR in debug mode
        if (DEBUG_MODE) {
            this.enableHotReload();
        }

        // Load the web app
        this.loadApp();

        // Disable page navigation
        this.mainWindow!.webContents.on("will-navigate", (event) => {
            event.preventDefault();
        });

        // Open all renderer links in the user's browser instead of the app
        this.mainWindow!.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: "deny" };
        });
    }

    async #checkCliCommands() {
        const cliArgNames = Object.keys(this.#CLI_COMMAND_EXECUTORS);

        // Check if any known commands were issued
        for (let argi = 1; argi < process.argv.length; ++argi) {
            const argToken = process.argv[argi].toLowerCase();

            if (cliArgNames.includes(argToken)) {
                const cliExecutor = this.#CLI_COMMAND_EXECUTORS[argToken];
                const startArgi = argi;

                while (++argi < process.argv.length) {
                    const nextToken = process.argv[argi];

                    if (cliArgNames.includes(nextToken.toLowerCase())) {
                        break;
                    }
                }

                const params = process.argv.slice(startArgi + 1, argi);

                console.log(argToken, ...params);
                const result = await cliExecutor(...params);
                if (!result) {
                    log.error("Failed to run CLI command", argToken, ...params);
                }
            }
        }
    }

    loadApp() {
        // load the index.html of the app.
        this.mainWindow!.loadURL(
            url.format({
                pathname: path.join(BROWSER_DIR, `index.html`),
                protocol: "file:",
                slashes: true,
            })
        );
    }

    enableConsoleLogHook() {
        const originalConsole = console;

        console = Object.assign({}, console, {
            log: (...params: any[]) => (originalConsole.log(...params), log.log(...params)),
            info: (...params: any[]) => (originalConsole.info(...params), log.info(...params)),
            warn: (...params: any[]) => (originalConsole.warn(...params), log.warn(...params)),
            error: (...params: any[]) => (originalConsole.error(...params), log.error(...params)),
            debug: (...params: any[]) => (originalConsole.debug(...params), log.debug(...params)),
        });
    }

    enableHotReload() {
        const chokidar = require("chokidar");

        chokidar.watch(BUILD_DATE_FILE, {
            interval: 500,
            usePolling: true,
            awaitWriteFinish: true,
            ignoreInitial: true
        }).on("change", () => {
            console.info("Changes detected, reloading app...");
    
            this.loadApp();

            console.info("App reloaded");
        });
    }

    createMenu() {
        return Menu.buildFromTemplate([
            {
                label: 'File',
                submenu: [
                    {
                        label: "Preferences",
                        click: () => this.mainWindow!.webContents.send("app:showPreferences")
                    },
                    {
                        label: "Manage Games",
                        click: () => this.mainWindow!.webContents.send("app:showManageGames")
                    },
                    {
                        type: "separator"
                    },
                    {
                        label: "View Project Homepage",
                        click: () => shell.openExternal(ElectronLoader.APP_RESOURCES["homepage"])
                    },
                    {
                        label: "Check for Updates",
                        click: () => this.mainWindow!.webContents.send("app:checkLatestVersion")
                    },
                    {
                        type: "separator"
                    },
                    {
                        role: "quit"
                    }
                ]
            },

            {
                label: "Profile",
                submenu: [
                    {
                        id: "new-profile",
                        label: "New Profile",
                        click: () => this.mainWindow!.webContents.send("app:newProfile")
                    },
                    {
                        id: "add-external-profile",
                        label: "Add External Profile",
                        click: () => this.mainWindow!.webContents.send("app:importProfile", { directImport: true })
                    },
                    {
                        id: "import-profile",
                        label: "Import Profile",
                        click: () => this.mainWindow!.webContents.send("app:importProfile", { directImport: false })
                    },
                    {
                        id: "copy-profile",
                        label: "Copy Profile",
                        click: () => this.mainWindow!.webContents.send("app:copyProfile")
                    },
                    {
                        id: "export-profile",
                        label: "Export Profile",
                        click: () => this.mainWindow!.webContents.send("app:exportProfile")
                    },
                    {
                        id: "delete-profile",
                        label: "Delete Profile",
                        click: () => this.mainWindow!.webContents.send("app:deleteProfile")
                    },
                    {
                        id: "lock-profile",
                        label: "Lock Profile",
                        click: () => this.mainWindow!.webContents.send("profile:toggleLockState")
                    },
                    {
                        id: "unlock-profile",
                        label: "Unlock Profile",
                        click: () => this.mainWindow!.webContents.send("profile:toggleLockState")
                    },
                    {
                        type: "separator"
                    },
                    {
                        id: "mods",
                        label: "Mods",
                        submenu: [
                            {
                                label: "Add Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModAdd")
                            },
                            {
                                label: "Import Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModExternalImport")
                            },
                            {
                                label: "Add Mod Section",
                                click: () => this.mainWindow!.webContents.send("profile:addModSection")
                            },
                            {
                                label: "Add Root Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModAdd", { root: true })
                            },
                            {
                                label: "Import Root Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModExternalImport", { root: true })
                            },
                            {
                                label: "Add Root Mod Section",
                                click: () => this.mainWindow!.webContents.send("profile:addModSection", { root: true })
                            },
                        ]
                    },
                    {
                        id: "profile-settings",
                        label: "Profile Settings",
                        click: () => this.mainWindow!.webContents.send("profile:settings")
                    },
                ]
            },

            {
                label: "View",
                submenu: [
                    {
                        label: "Mod List Columns",
                        submenu: [
                            {
                                id: "mod-list-col-enabled",
                                type: "checkbox",
                                label: "Mod Enabled",
                                checked: false,
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { column: "enabled" })
                            },
                            {
                                id: "mod-list-col-name",
                                type: "checkbox",
                                label: "Mod Name",
                                checked: false,
                                enabled: false,
                            },
                            {
                                id: "mod-list-col-updatedDate",
                                type: "checkbox",
                                label: "Mod Updated Date",
                                checked: false,
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { column: "updatedDate" })
                            },
                            {
                                id: "mod-list-col-order",
                                type: "checkbox",
                                label: "Mod Order",
                                checked: false,
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { column: "order" })
                            },
                            {
                                type: "separator"
                            },
                            {
                                label: "Reset Defaults",
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { reset: true })
                            }
                        ]
                    },
                    {
                        id: "show-log-panel",
                        label: "Show Log Panel",
                        type: "checkbox",
                        checked: false,
                        click: () => this.mainWindow!.webContents.send("app:toggleLogPanel")
                    },
                    ...this.createDebugMenuOption({
                        type: "separator"
                     }),
                     ...this.createDebugMenuOption({
                        role: "toggleDevTools"
                     })
                ]
            },

            {
                label: "Help",
                submenu: [
                    {
                        label: "View README",
                        click: () => shell.openExternal(ElectronLoader.APP_RESOURCES["readme_online"])
                    },
                    {
                        label: `About ${ElectronLoader.APP_SHORT_NAME}`,
                        click: () => this.showAppAboutInfo()
                    },
                    {
                        type: "separator"
                    },
                    {
                        label: `Support ${ElectronLoader.APP_SHORT_NAME}`,
                        click: () => this.showAppSupportInfo()
                    },
                ]
            }
        ]);
    }

    createDebugMenuOption(menuOption: Record<any, any>): [Record<any, any>] | [] {
        return DEBUG_MODE ? [menuOption] : [];
    }

    loadProfileList(): AppProfile.Description[] {
        if (!fs.existsSync(ElectronLoader.APP_PROFILES_DIR)) {
            return [];
        }

        const profileNames = fs.readdirSync(ElectronLoader.APP_PROFILES_DIR).sort();
        return profileNames.map((profileName: string) => {
            const profile = this.loadProfile(profileName);
            return {
                name: profileName,
                gameId: profile?.gameId ?? "$unknown",
                deployed: profile?.deployed ?? false,
                rootPathOverride: profile?.rootPathOverride,
                invalid: profile ? profile.invalid : true
            };
        });
    }

    loadSettings(): AppSettingsUserCfg {
        const settingsSrc = fs.readFileSync(ElectronLoader.APP_SETTINGS_FILE);

        return JSON.parse(settingsSrc.toString("utf8"));
    }

    saveSettings(settings: AppSettingsUserCfg): void {
        return fs.writeFileSync(
            path.join(ElectronLoader.APP_SETTINGS_FILE),
            JSON.stringify(settings)
        );
    }

    loadGameDatabase(includeCustomGames = true): GameDatabase {
        if (!fs.existsSync(ElectronLoader.GAME_DB_FILE)) {
            return {};
        }

        const dbSrc = fs.readFileSync(ElectronLoader.GAME_DB_FILE);
        const result = JSON.parse(dbSrc.toString("utf8"));
        delete result.$schema;

        if (includeCustomGames) {
            const appSettings = this.loadSettings();
            if (appSettings?.customGameDb) {
                Object.assign(result, appSettings.customGameDb);
            }
        }

        return result;
    }

    exportGameDetails(gameDetails: GameDetails, gamePath: string): void {
        fs.writeJSONSync(gamePath, {
            ...gameDetails,
            schemaVersion: ElectronLoader.GAME_SCHEMA_VERSION
        }, { spaces: 4 });
    }

    getDefaultProfileDir(profileNameOrPath: string): string {
        return path.isAbsolute(profileNameOrPath)
            ? profileNameOrPath
            : this.#expandPath(path.join(ElectronLoader.APP_PROFILES_DIR, profileNameOrPath));
    }

    getProfileDir(profile: AppProfile | AppBaseProfile): string {
        return profile.rootPathOverride ?? this.getDefaultProfileDir(profile.name);
    }

    getProfileConfigDir(profile: AppProfile | AppBaseProfile): string {
        return isNotNil(profile.configPathOverride)
            ? this.#resolveFullProfileDir(profile, profile.configPathOverride)
            : path.join(this.getProfileDir(profile), ElectronLoader.PROFILE_CONFIG_DIR);
    }

    getProfileSaveDir(profile: AppProfile | AppBaseProfile): string {
        return isNotNil(profile.savesPathOverride)
            ? this.#resolveFullProfileDir(profile, profile.savesPathOverride)
            : path.join(this.getProfileDir(profile), ElectronLoader.PROFILE_SAVE_DIR);
    }

    getProfileModsDir(profile: AppProfile | AppBaseProfile): string {
        return isNotNil(profile.modsPathOverride)
            ? this.#resolveFullProfileDir(profile, profile.modsPathOverride)
            : path.join(this.getProfileDir(profile), ElectronLoader.PROFILE_MODS_DIR);
    }

    getProfileTmpDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(this.getProfileDir(profile), ElectronLoader.PROFILE_MODS_STAGING_DIR);
    }

    getProfileOwnModDir(profile: AppProfile | AppBaseProfile, modName: string): string {
        return path.join(this.getProfileModsDir(profile), modName);
    }

    getProfileModDir(profile: AppProfile | AppBaseProfile, modName: string, modRef: ModProfileRef): string {
        const modProfile = (modRef.baseProfile && "baseProfile" in profile && profile.baseProfile)
            ? profile.baseProfile
            : profile;
        return this.getProfileOwnModDir(modProfile, modName);
    }

    getProfileBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return profile.backupsPathOverride !== undefined
            ? this.#resolveFullProfileDir(profile, profile.backupsPathOverride)
            : path.join(this.getProfileDir(profile), ElectronLoader.PROFILE_BACKUPS_DIR);
    }

    getProfileModOrderBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(
            this.getProfileBackupsDir(profile),
            ElectronLoader.PROFILE_BACKUPS_MOD_ORDER_DIR
        );
    }

    getProfilePluginBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(
            this.getProfileBackupsDir(profile),
            ElectronLoader.PROFILE_BACKUPS_PLUGINS_DIR
        );
    }

    getProfileConfigBackupsDir(profile: AppProfile | AppBaseProfile): string {
        return path.join(
            this.getProfileBackupsDir(profile),
            ElectronLoader.PROFILE_BACKUPS_CONFIG_DIR
        );
    }

    getProfileDirByKey(
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
    };

    loadProfile(profileNameOrPath: string): AppProfile | AppBaseProfile | null {
        return this.loadProfileFromPath(profileNameOrPath, this.getDefaultProfileDir(profileNameOrPath));
    }

    loadProfileFromPath(profileName: string, profilePath: string): AppProfile | AppBaseProfile | null {
        const profileSettingsName = ElectronLoader.PROFILE_SETTINGS_FILE;
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
                    const gameDetails = this.#getGameDetails(profile.gameId);
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
            if (this.loadSettings()?.normalizePathCasing) {
                profile.normalizePathCasing = true;
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

    saveProfile(profile: AppProfile, options = undefined): void {
        const profileDir = this.getProfileDir(profile);
        const defaultProfileDir = this.getDefaultProfileDir(profile.name);
        const profileSettingsName = ElectronLoader.PROFILE_SETTINGS_FILE;
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

    deleteProfile(profile: AppProfile): void {
        const profileDir = this.getProfileDir(profile);
        const defaultProfileDir = this.getDefaultProfileDir(profile.name);

        if (defaultProfileDir !== profileDir) {
            if (fs.existsSync(defaultProfileDir)) {
                fs.removeSync(defaultProfileDir);
            }
        }

        return fs.rmSync(profileDir, { recursive: true });
    }

    readProfileConfigFile(
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

    readProfileSaveFiles(profile: AppProfile): AppProfile.Save[] {
        const profileSaveDir = this.getProfileSaveDir(profile);
        
        if (!fs.existsSync(profileSaveDir)) {
            return [];
        }

        const gameDb = this.loadGameDatabase();
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

    updateProfileConfigFile(profile: AppProfile, fileName: string, data?: string): void {
        const profileConfigDir = this.getProfileConfigDir(profile);
        const profileConfigFilePath = path.join(profileConfigDir, fileName);
        
        fs.mkdirpSync(profileConfigDir);
        fs.writeFileSync(profileConfigFilePath, data ?? "", "utf8");
    }

    deleteProfileSaveFile(profile: AppProfile, save: AppProfile.Save): boolean {
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

    importProfileModOrderBackup(profile: AppProfile, backupPath: string): AppProfile {
        backupPath = this.#expandPath(backupPath);
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

    importProfilePluginBackup(profile: AppProfile, backupPath: string): AppProfile {
        backupPath = this.#expandPath(backupPath);
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

    importProfileConfigBackup(profile: AppProfile, backupPath: string): AppProfile {
        backupPath = this.#expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileConfigBackupsDir(profile), backupPath);
        }

        if (!fs.existsSync(backupPath)) {
            throw new Error("Invalid backup.");
        }

        const gameDetails = this.#getGameDetails(profile.gameId);
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

    createProfileModOrderBackup(profile: AppProfile, backupName?: string): void {
        const backupsDir = this.getProfileModOrderBackupsDir(profile);
        const backupFileName = `${this.#asFileName(backupName || this.#currentDateTimeAsFileName())}.json`;

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

    createProfilePluginBackup(profile: AppProfile, backupName?: string): void {
        const backupsDir = this.getProfilePluginBackupsDir(profile);
        const backupFileName = `${this.#asFileName(backupName || this.#currentDateTimeAsFileName())}.json`;

        fs.mkdirpSync(backupsDir);

        fs.writeJSONSync(
            path.join(backupsDir, backupFileName),
            profile.plugins,
            { spaces: 4 }
        );
    }

    createProfileConfigBackup(profile: AppProfile, backupName?: string): void {
        backupName = this.#asFileName(backupName || this.#currentDateTimeAsFileName());
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

    deleteProfileModOrderBackup(profile: AppProfile, backupPath: string): void {
        backupPath = this.#expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileModOrderBackupsDir(profile), backupPath);
        }

        fs.rmSync(backupPath);
    }

    deleteProfilePluginBackup(profile: AppProfile, backupPath: string): void {
        backupPath = this.#expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfilePluginBackupsDir(profile), backupPath);
        }

        fs.rmSync(backupPath);
    }

    deleteProfileConfigBackup(profile: AppProfile, backupPath: string): void {
        backupPath = this.#expandPath(backupPath);
        if (!path.isAbsolute(backupPath)) {
            backupPath = path.join(this.getProfileConfigBackupsDir(profile), backupPath);
        }

        fs.removeSync(backupPath);
    }

    readProfileModOrderBackups(profile: AppProfile): AppProfile.BackupEntry[] {
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

    readProfilePluginBackups(profile: AppProfile): AppProfile.BackupEntry[] {
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

    readProfileConfigBackups(profile: AppProfile): AppProfile.BackupEntry[] {
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

    exportProfilePluginList(profile: AppProfile, pluginListPath: string): void {
        fs.writeFileSync(pluginListPath, this.#createProfilePluginList(profile));
    }

    async beginModAdd(profile: AppProfile, root: boolean, modPath?: string): Promise<ModImportRequest | undefined> {
        if (!modPath) {
            const pickedFile = (await dialog.showOpenDialog({
                filters: [
                    { 
                        name: "Mod", extensions: [
                            "zip",
                            "rar",
                            "7z",
                            "7zip",
                        ]
                    }
                ]
            }));
            
            modPath = pickedFile?.filePaths[0];
        }
        
        const filePath = modPath ?? "";
        if (!!filePath) {
            if (fs.lstatSync(filePath).isDirectory()) {
                return this.beginModExternalImport(profile, root, filePath);
            }

            const fileType = path.extname(filePath);
            const modName = path.basename(filePath, fileType);
            const modDirStagingPath = path.join(this.getProfileTmpDir(profile), modName);
            let decompressOperation: Promise<boolean>;

            // Clear the staging dir
            fs.rmSync(modDirStagingPath, { recursive: true, force: true });

            switch (fileType.toLowerCase()) {
                case ".7z":
                case ".7zip":
                case ".zip":
                case ".rar": {
                    decompressOperation = new Promise((resolve, _reject) => {
                        const _7zBinaryPath = this.#resolve7zBinaryPath();
                        const decompressStream = Seven.extractFull(filePath, modDirStagingPath, { $bin: _7zBinaryPath });
                        decompressStream.on("end", () => resolve(true));
                        decompressStream.on("error", (e) => {
                            log.error(e);
                            resolve(false);
                        });
                    });
                } break;
                default: {
                    log.error("Unrecognized mod format", fileType);
                    decompressOperation = Promise.resolve(false);
                } break;
            }

            if (await decompressOperation) {
                try {
                    const modFilePaths = fs.readdirSync(modDirStagingPath, { encoding: "utf-8", recursive: true });
                    return await this.beginModImport(profile, root, modName, modDirStagingPath, modFilePaths, false);
                } catch (err) {
                    log.error(`Error occurred while adding mod ${modName}: `, err);

                    // Erase the staging data
                    await fs.remove(modDirStagingPath);

                    throw err;
                }
            }
        }

        return undefined;
    }

    async beginModExternalImport(profile: AppProfile, root: boolean, modPath?: string): Promise<ModImportRequest | undefined> {
        if (!modPath) {
            const pickedModFolder = await dialog.showOpenDialog({
                properties: ["openDirectory"]
            });
            
            modPath = pickedModFolder?.filePaths[0];
        }

        const folderPath = modPath ?? "";
        if (!!folderPath) {
            if (fs.lstatSync(folderPath).isFile()) {
                return this.beginModAdd(profile, root, folderPath);
            }

            const modName = path.basename(folderPath);
            const modFilePaths = await fs.readdir(folderPath, { encoding: "utf-8", recursive: true });

            return this.beginModImport(profile, root, modName, folderPath, modFilePaths, true);
        }

        return undefined;
    }

    async beginModImport(
        profile: AppProfile,
        root: boolean,
        modName: string,
        modImportPath: string,
        modFilePaths: string[],
        externalImport: boolean
    ): Promise<ModImportRequest> {
        const gameDb = this.loadGameDatabase();
        const gameDetails = gameDb[profile.gameId];
        const gamePluginFormats = gameDetails?.pluginFormats ?? [];
        let foundModSubdirRoot = "";
        
        if (!root && profile.gameInstallation) {
            const modDirRelName = path.relative(profile.gameInstallation.rootDir, profile.gameInstallation.modDir);
            // If mod dir is child of root dir, determine if mod is packaged relative to root dir
            if (!modDirRelName.startsWith(".") && !path.isAbsolute(modDirRelName)) {
                if (fs.existsSync(path.join(modImportPath, modDirRelName))) {
                    foundModSubdirRoot = modDirRelName;
                }
            }
        }

        const modPreparedFilePaths = modFilePaths
            .filter(filePath => !fs.lstatSync(path.join(modImportPath, filePath)).isDirectory())
            .map(filePath => ({
                filePath: filePath.replace(/[\\/]/g, path.sep),
                enabled: true
            }));

        const modPlugins: string[] = [];
        modPreparedFilePaths.forEach(({ filePath }) => {
            if (gamePluginFormats.some(pluginFormat => filePath.toLowerCase().endsWith(pluginFormat))) {
                modPlugins.push(filePath);
            }
        });

        let installer = undefined;

        // Check if this mod is packaged as a FOMOD installer
        const fomodModuleInfoFile = modPreparedFilePaths.find(({ filePath }) => filePath.toLowerCase().endsWith(`fomod${path.sep}info.xml`));
        const fomodModuleConfigFile = modPreparedFilePaths.find(({ filePath }) => filePath.toLowerCase().endsWith(`fomod${path.sep}moduleconfig.xml`));
        if (!!fomodModuleInfoFile || !!fomodModuleConfigFile) {
            do {
                
                const xmlParser = new xml2js.Parser({
                    mergeAttrs: true,
                    trim: true,
                    emptyTag: undefined
                });
                let fomodModuleInfo: Fomod.ModuleInfo | undefined;
                let fomodModuleConfig: Fomod.ModuleConfig | undefined;

                // Parse info.xml (optional)
                if (fomodModuleInfoFile) {
                    try {
                        const fullInfoFilePath =  path.join(modImportPath, fomodModuleInfoFile.filePath);
                        const fileInfo = await detectFileEncodingAndLanguage(fullInfoFilePath);
                        const fileEncoding = (fileInfo.encoding?.toLowerCase() ?? "utf-8") as BufferEncoding;
                        const moduleInfoXml = fs.readFileSync(
                            fullInfoFilePath,
                            { encoding: fileEncoding }
                        );
                        fomodModuleInfo = await xmlParser.parseStringPromise(moduleInfoXml);
                    } catch (err) {
                        log.error(`${modName} - Failed to read FOMOD info.xml: `, err);
                    }
                }

                // Parse ModuleConfig.xml (optional)
                if (fomodModuleConfigFile) {
                    try {
                        const fullConfigFilePath =  path.join(modImportPath, fomodModuleConfigFile.filePath);
                        const fileInfo = await detectFileEncodingAndLanguage(fullConfigFilePath);
                        const fileEncoding = (fileInfo.encoding?.toLowerCase() ?? "utf-8") as BufferEncoding;
                        const moduleConfigXml = fs.readFileSync(
                            fullConfigFilePath,
                            { encoding: fileEncoding }
                        );
                        fomodModuleConfig = await xmlParser.parseStringPromise(moduleConfigXml);
                    } catch (err) {
                        log.error(`${modName} - Failed to read FOMOD ModuleConfig.xml: `, err);
                        break;
                    }

                    if (!fomodModuleConfig) {
                        log.error(`${modName} - Failed to read FOMOD ModuleConfig.xml`);
                        break;
                    }
                }

                // Map FOMOD installer to SML format
                try {
                    let moduleInfo: ModInstaller.ModuleInfo | undefined = undefined;
                    if (fomodModuleInfo) {
                        moduleInfo = {
                            name: fomodModuleInfo.fomod.Name?.[0],
                            author: fomodModuleInfo.fomod.Author ?? [],
                            version: Array.isArray(fomodModuleInfo.fomod.Version)
                                ? fomodModuleInfo.fomod.Version[0]
                                : fomodModuleInfo.fomod.Version?._,
                            description: fomodModuleInfo.fomod.Description?.[0],
                            website: fomodModuleInfo.fomod.Website?.[0],
                            id: fomodModuleInfo.fomod.Id?.[0],
                            categoryId: fomodModuleInfo.fomod.CategoryId ?? []
                        };
                    }

                    let moduleConfig: ModInstaller.ModuleConfig | undefined = undefined;
                    if (fomodModuleConfig) {
                        moduleConfig = {
                            moduleName: fomodModuleConfig.config.moduleName[0],
                            moduleDependencies: fomodModuleConfig.config.moduleDependencies ?? [],
                            requiredInstallFiles: fomodModuleConfig.config.requiredInstallFiles ?? [],
                            installSteps: fomodModuleConfig.config.installSteps?.[0],
                            conditionalFileInstalls: fomodModuleConfig.config.conditionalFileInstalls?.[0],
                            moduleImage: fomodModuleConfig.config.moduleImage?.[0]
                        };
                    }
                    
                    installer = {
                        info: moduleInfo,
                        config: moduleConfig,
                        zeroConfig: !moduleConfig?.installSteps
                    };
                }  catch (err) {
                    log.error(`${modName} - Failed to parse FOMOD data: `, err);
                    break;
                }

                log.info(`${installer.info?.name ?? modName} - Found FOMOD installer`);

                // Update the root subdir to the parent dir of the `fomod` folder
                const fomodFilePath = (fomodModuleInfoFile ?? fomodModuleConfigFile)?.filePath;
                if (fomodFilePath) {
                    foundModSubdirRoot = path.dirname(path.dirname(fomodFilePath));
                    if (foundModSubdirRoot === ".") {
                        foundModSubdirRoot = "";
                    }
                }
            } while(false);
        }

        return {
            profile,
            root,
            modName,
            externalImport,
            importStatus: "PENDING",
            mergeStrategy: "REPLACE",
            modPlugins,
            modFilePaths: modPreparedFilePaths,
            modPath: modImportPath,
            filePathSeparator: path.sep,
            modSubdirRoots: foundModSubdirRoot ? [foundModSubdirRoot] : [],
            installer
        };
    }

    async completeModImport(
        {
            profile,
            root,
            modName,
            modPath,
            externalImport,
            importStatus,
            mergeStrategy,
            modFilePaths,
            modFilePrefix,
            modSubdirRoots,
            modPlugins,
            modFilePathMapFilter
        }: ModImportRequest
    ): Promise<ModImportResult | undefined> {
        try {
            // If the import status is anything except `PENDING`, an error occurred. 
            if (importStatus !== "PENDING") {
                return undefined;
            }

            // Collect all enabled mod files, K = file dest, V = file src
            const enabledModFiles: Map<string, string> = modFilePaths.reduce((enabledModFiles, fileEntry) => {
                fileEntry.filePath = this.#expandPath(fileEntry.filePath);

                if (modFilePathMapFilter) {
                    function filEntryMatchesPath(pathMapSrcNorm: string): boolean {
                        // Check if the mapping src is a direct match for the file
                        if (fileEntry.filePath.toLowerCase() === pathMapSrcNorm) {
                            return true;
                        }

                        if (!pathMapSrcNorm.endsWith(path.sep)) {
                            pathMapSrcNorm += path.sep;
                        }

                        // Check if the file is inside the mapping src dir
                        return fileEntry.filePath.toLowerCase().startsWith(pathMapSrcNorm);
                    }

                    // Check if a mapping entry exists for the current file path
                    const mappedEntry = Object.entries(modFilePathMapFilter).find(([pathMapSrcRaw]) => {
                        if (modSubdirRoots.length > 0) {
                            return modSubdirRoots.some((modSubdirRoot) => {
                                let pathMapSrcNorm = this.#expandPath(pathMapSrcRaw).toLowerCase();

                                if (!pathMapSrcNorm.startsWith(modSubdirRoot.toLowerCase())) {
                                    pathMapSrcNorm = path.join(modSubdirRoot, pathMapSrcNorm).toLowerCase();
                                }
        
                                return filEntryMatchesPath(pathMapSrcNorm);
                            });
                        } else {
                            const pathMapSrcNorm = this.#expandPath(pathMapSrcRaw).toLowerCase();
                            return filEntryMatchesPath(pathMapSrcNorm);
                        }
                    });
                    fileEntry.enabled = !!mappedEntry;

                    if (mappedEntry) {
                        const mappedSrcPath = this.#expandPath(mappedEntry[0]);
                        const mappedDestPath = this.#expandPath(mappedEntry[1]);
                        // Map the file path to the destination path, excluding any root data dir
                        if (fileEntry.filePath.toLowerCase().startsWith(mappedSrcPath.toLowerCase())) {
                            fileEntry.mappedFilePath = `${mappedDestPath}${fileEntry.filePath.substring(mappedSrcPath.length)}`;
                            fileEntry.mappedFilePath = fileEntry.mappedFilePath.replace(/^[/\\]+/, "");
                            fileEntry.mappedFilePath = fileEntry.mappedFilePath.replace(/^[Dd]ata[\\/]/, "");
                        }
                    }
                } else if (modSubdirRoots.length > 0) {
                    fileEntry.enabled = fileEntry.enabled && modSubdirRoots.some((modSubdirRoot) => {
                        return fileEntry.filePath.toLowerCase().startsWith(modSubdirRoot.toLowerCase())
                    });
                }

                if (fileEntry.enabled) {
                    const destFilePath = fileEntry.mappedFilePath ?? fileEntry.filePath;
                    const existingEntry = enabledModFiles.get(destFilePath);
                    if (existingEntry) {
                        log.warn(
                            `${modName} - Installer provides multiple files that map to the same path: "${destFilePath}"`,
                            "\r\n",
                            `Overwriting "${existingEntry}" with "${fileEntry.filePath}"`
                        );
                    }

                    enabledModFiles.set(destFilePath, fileEntry.filePath);
                }

                return enabledModFiles;
            }, new Map());

            const modProfilePath = this.getProfileOwnModDir(profile, modName);

            if (mergeStrategy === "REPLACE") {
                // Clear the mod dir for the profile
                fs.rmSync(modProfilePath, { recursive: true, force: true });
            }

            if (enabledModFiles.size > 0) {
                const overwriteExistingFiles = mergeStrategy === "OVERWRITE" || mergeStrategy === "REPLACE";
                const modFileOperations = [];

                for (let [destBasePath, srcFilePath] of enabledModFiles) {
                    srcFilePath = path.join(modPath, srcFilePath);

                    if (!fs.lstatSync(srcFilePath).isDirectory()) {
                        let rootFilePath = destBasePath;

                        // Normalize path to its mod subdir root, if any
                        for (const modSubdirRoot of modSubdirRoots) {
                            const modSubdirPrefix = `${modSubdirRoot}${path.sep}`.toLowerCase();
                            if (rootFilePath.toLowerCase().startsWith(modSubdirPrefix)) {
                                rootFilePath = rootFilePath.slice(modSubdirPrefix.length);
                                break;
                            }
                        }
                        
                        const destFilePath = path.join(modProfilePath, modFilePrefix ?? "", rootFilePath);
                        
                        // Copy all enabled files to the final mod folder
                        if (externalImport) {
                            // Copy files from external imports
                            modFileOperations.push(fs.copy(srcFilePath, destFilePath, {
                                errorOnExist: false,
                                overwrite: overwriteExistingFiles
                            }));
                        } else {
                            // Move files from the temp staging path for non-external imports
                            modFileOperations.push(fs.move(srcFilePath, destFilePath, {
                                overwrite: overwriteExistingFiles
                            }));
                        }

                        // Write files sequentially if more than one root in order to preserve write order (i.e. BAIN mods)
                        if (modSubdirRoots.length > 1) {
                            await Promise.all(modFileOperations);
                        }
                    }
                }

                await Promise.all(modFileOperations);
            } else {
                fs.mkdirpSync(modProfilePath);
            }

            return {
                root,
                modName,
                modRef: {
                    enabled: true,
                    updatedDate: new Date().toISOString()
                }
            };
        } catch (err) {
            log.error("Mod import failed: ", err);
            throw err;
        } finally {
            if (!externalImport) {
                try {
                    // Erase the staging data if this was added via archive
                    await fs.remove(modPath);
                } catch (err) {
                    log.error(`${modName} - Failed to clean-up temporary installation files: `, err);

                    // Ignore temp file clean-up errors
                }
            }
        }
    }

    verifyProfileMods(root: boolean, profile: AppProfile): AppProfile.CollectedVerificationResult {
        const modsDir = this.getProfileModsDir(profile);
        const modList = root ? profile.rootMods : profile.mods;
        const baseProfileModList = root ? profile.baseProfile?.rootMods ?? [] : profile.baseProfile?.mods ?? [];

        function recordResult(
            results: AppProfile.VerificationResultRecord<string>,
            modName: string, 
            result: AppProfile.VerificationResult
        ) {
            const existingResult = (results[modName] ?? {
                error: false,
                found: true
            }) as AppProfile.VerificationResult;
            existingResult.error ||= result.error;
            existingResult.found &&= result.found;
            
            if (result.error && result.reason) {
                existingResult.reason = existingResult.reason ? `${existingResult.reason}; ${result.reason}` : result.reason;
            }
            
            results[modName] = existingResult;
        }

        let profileCheckResults = modList.reduce((result, [modName, mod]) => {
            // Check if mods exist on the filesystem
            const modExists = fs.existsSync(path.join(mod.baseProfile
                ? this.getProfileModsDir(profile.baseProfile!)
                : modsDir,
            modName));

            recordResult(result, modName, {
                error: !modExists,
                found: modExists,
                reason: "The files for this mod are missing"
            });

            // Check if profile has any mods that conflict with the base profile
            const modConflictsWithBase = !mod.baseProfile && !!baseProfileModList.find(([baseModName]) => baseModName === modName); 

            recordResult(result, modName, {
                error: modConflictsWithBase,
                found: true,
                reason: `Mod "${modName}" already exists in base profile "${profile.baseProfile?.name}"`
            });
            return result;
        }, {} as AppProfile.VerificationResultRecord<string>);

        // Check if any filesystem mods are missing from the profile
        const fsMods = fs.readdirSync(modsDir);
        profileCheckResults = fsMods.reduce((result, modName) => {
            const modExistsInProfile = [
                profile.rootMods,
                profile.mods
            ].some(modList => modList.find(([profileModName]) => modName === profileModName));
            const modHasError = !modExistsInProfile;

            recordResult(result, modName, {
                error: modHasError,
                found: true,
                reason: "Mod files were found but is missing from profile"
            });

            return result;
        }, profileCheckResults);

        return { results: profileCheckResults };
    }

    verifyProfilePathExists(pathToVerify: string): AppProfile.VerificationResult {
        const pathExists = fs.existsSync(this.#expandPath(pathToVerify));
        return {
            error: !pathExists,
            found: pathExists
        };
    }

    /** 
     * @description Determines whether or not **any** profile is deployed in the `gameModDir` of `profile`.
     */
    isSimilarProfileDeployed(profile: AppProfile): boolean {
        const metaFilePath = this.#expandPath(path.join(profile.gameInstallation.modDir, ElectronLoader.PROFILE_METADATA_FILE));
        return fs.existsSync(metaFilePath);
    }

    /** 
     * @description Determines whether or the specific profile is deployed in the `gameModDir` of `profile`.
     */
    isProfileDeployed(profile: AppProfile): boolean {
        return this.isSimilarProfileDeployed(profile) && this.readProfileDeploymentMetadata(profile)?.profile === profile.name;
    }

    readProfileDeploymentMetadata(profile: AppProfile): ModDeploymentMetadata | undefined {
        const metaFilePath = this.#expandPath(path.join(profile.gameInstallation.modDir, ElectronLoader.PROFILE_METADATA_FILE));
        const metaFileExists = fs.existsSync(metaFilePath);

        if (!metaFileExists) {
            return undefined;
        }

        return JSON.parse(fs.readFileSync(metaFilePath).toString("utf-8"));
    }

    writeProfileDeploymentMetadata(profile: AppProfile, deploymentMetadata: ModDeploymentMetadata): void {
        const metaFilePath = this.#expandPath(path.join(profile.gameInstallation.modDir, ElectronLoader.PROFILE_METADATA_FILE));

        return fs.writeFileSync(metaFilePath, JSON.stringify(deploymentMetadata));
    }

    async calculateModOverwriteFiles(
        profile: AppProfile | AppBaseProfile,
        root: boolean,
        task: (modOverwriteFiles: ModOverwriteFilesEntry[], modName: string, modRef: ModProfileRef, completed: boolean) => Promise<unknown>
    ): Promise<void> {
        const fileCache: ModOverwriteFilesEntry[] = [];
        const modsList = root ? profile.rootMods : profile.mods;

        // Add external files to cache
        if ("externalFilesCache" in profile) {
            const externalFiles = (root
                ? profile.externalFilesCache?.gameDirFiles
                : profile.externalFilesCache?.modDirFiles) ?? [];

            if (root && profile.externalFilesCache?.modDirFiles && "gameInstallation" in profile) {
                const modDirRelName = path.relative(profile.gameInstallation.rootDir, profile.gameInstallation.modDir);

                // Add mod dir files if mod dir is a child of root dir
                if (!modDirRelName.startsWith("..") && !path.isAbsolute(modDirRelName)) {
                    externalFiles.push(...profile.externalFilesCache.modDirFiles.map((modFile) => {
                        return path.join(modDirRelName, modFile);
                    }));
                }
            }

            fileCache.push({ files: externalFiles });
        }

        for (let modIndex = 0; modIndex < modsList.length; ++modIndex) {
            const [modName, modRef] = modsList[modIndex];
            const modDirPath = this.getProfileModDir(profile, modName, modRef);

            if (await fs.exists(modDirPath)) {
                const modDirEntries = await fs.readdir(modDirPath, { encoding: "utf-8", recursive: true });
                const modDirFiles = [];

                // Get all mod files
                for (const modDirEntry of modDirEntries) {
                    if ((await fs.lstat(path.join(modDirPath, modDirEntry))).isFile()) {
                        modDirFiles.push(modDirEntry);
                    }
                }

                const modOverwriteFiles: ModOverwriteFilesEntry[] = [];
                await this.#batchTaskAsync(modDirFiles, 100, async (modFile) => {
                    // TODO - Normalize path case if enabled
                    const overwrittenFiles = fileCache.filter(fileEntry => fileEntry.files.includes(modFile));
                    
                    // Record any overwritten files
                    if (overwrittenFiles.length > 0) {
                        for (const overwrittenFile of overwrittenFiles) {
                            const overwriteEntry = modOverwriteFiles.find((fileEntry) => {
                                return fileEntry.modName === overwrittenFile.modName;
                            });
                            
                            if (!!overwriteEntry) {
                                overwriteEntry.files.push(modFile);
                            } else {
                                modOverwriteFiles.push({ modName: overwrittenFile.modName, files: [modFile] });
                            }
                        }
                    }
                });

                // Add files to cache
                fileCache.push({ modName, files: modDirFiles });

                // Notify of new overwrite files
                await task(modOverwriteFiles, modName, modRef, modIndex === modsList.length - 1);
            }
        }
    }

    async findProfileExternalFilesInDir(
        profile: AppProfile,
        dirPath: string,
        recursiveSearch: boolean
    ): Promise<Array<string>> {
        dirPath = path.resolve(this.#expandPath(dirPath));
        if (!fs.existsSync(dirPath)) {
            return [];
        }

        let modDirFiles = await fs.readdir(dirPath, { encoding: "utf-8", recursive: recursiveSearch });

        // Filter out directories and deployment metadata
        modDirFiles = modDirFiles.filter((file) => {
            return !fs.lstatSync(path.join(dirPath, file)).isDirectory()
                && !file.startsWith(ElectronLoader.DEPLOY_EXT_BACKUP_DIR)
                && file !== ElectronLoader.PROFILE_METADATA_FILE;
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

    async findProfileExternalPluginFiles(profile: AppProfile): Promise<Array<string>> {
        const gameDetails = this.#getGameDetails(profile.gameId);
        let gamePluginDir = this.#expandPath(profile.gameInstallation.modDir);

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

    async findProfileExternalFiles(profile: AppProfile): Promise<AppProfile.ExternalFiles> {
        if (!!profile.gameInstallation) {
            // Scan game dir for external files
            return {
                modDirFiles: await this.findProfileExternalFilesInDir(profile, profile.gameInstallation.modDir, true),
                gameDirFiles: await this.findProfileExternalFilesInDir(profile, profile.gameInstallation.rootDir, false),
                pluginFiles: await this.findProfileExternalPluginFiles(profile)
            };
        } else {
            // Use default plugin list from game db
            const gameDb = this.loadGameDatabase();
            const gameDetails = gameDb[profile.gameId];
            const defaultPlugins = (gameDetails?.pinnedPlugins ?? []).map(pinnedPlugin => pinnedPlugin.plugin);
            return {
                modDirFiles: [],
                gameDirFiles: [],
                pluginFiles: defaultPlugins
            }
        }
    }

    readModFilePaths(
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
            files = files.map(file => this.#expandPath(file));
        }

        return files;
    }

    resolveDefaultGameActions(profile: AppProfile): GameAction[] {
        const gameDetails = this.#getGameDetails(profile.gameId);

        // Find available game binaries and add them as actions
        return gameDetails?.gameBinary.reverse().reduce((gameActions, gameBinary) => {
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
                gameActions.push({
                    name: `Start ${path.parse(gameBinary).name}`,
                    actionScript: gameBinary
                });
            }

            return gameActions;
        }, [] as GameAction[]) ?? [];
    }

    resolveGameConfigFilePath(
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

    async checkArchiveInvalidationEnabled(profile: AppProfile | AppBaseProfile | AppProfile.Form): Promise<boolean> {
        const gameDetails = this.#getGameDetails(profile.gameId);
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

    async setArchiveInvalidationEnabled(profile: AppProfile, enabled: boolean): Promise<void> {
        if (await this.checkArchiveInvalidationEnabled(profile) === enabled) {
            return;
        }

        const gameDetails = this.#getGameDetails(profile.gameId);
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

    async deployGameResources(profile: AppProfile): Promise<string[]> {
        const profileModFiles: string[] = [];
        const gameDetails = this.#getGameDetails(profile.gameId);

        if (gameDetails?.resources?.mods) {
            Object.entries(gameDetails.resources.mods).forEach(([resourceSrc, resourceDest]) => {
                const srcFilePath = path.join(ElectronLoader.GAME_RESOURCES_DIR, resourceSrc);

                if (profile.normalizePathCasing) {
                    // TODO - Apply normalization rules to `resourceDest`
                }

                const destFilePath = this.#expandPath(path.join(profile.gameInstallation.modDir, resourceDest));

                if (fs.existsSync(destFilePath)) {
                    return;
                }

                const linkMode = this.#checkLinkSupported(srcFilePath, [destFilePath], false);
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
    
    findPluginFiles(profile: AppProfile): GamePluginProfileRef[] {
        const gameDb = this.loadGameDatabase();
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

    findModFiles(profile: AppProfile): AppProfile.ModList {
        const profileModsDir = this.getProfileModsDir(profile);

        if (!fs.existsSync(profileModsDir)) {
            return [];
        }

        const profileModDirs = fs.readdirSync(profileModsDir);
        return profileModDirs.map(modName => [modName, { enabled: true }]);
    }

    runGameAction(profile: AppProfile, gameAction: GameAction): boolean {
        const gameDetails = this.#getGameDetails(profile.gameId);
        // Substitute variables for profile
        const gameActionCmd = template(gameAction.actionScript)({ ...profile, gameDetails });

        log.info("Running game action: ", gameActionCmd);
        
        // Run the action
        try {
            exec(gameActionCmd, { cwd: profile.gameInstallation.rootDir });
        } catch(error) {
            log.error(error);
            return false;
        }

        return true;
    }

    async directLaunchProfileByName(profileName: string, actionName?: string): Promise<boolean> {
        const profile = this.loadProfile(profileName);
        if (!profile) {
            return false;
        }

        if (!("gameInstallation" in profile)) {
            return false;
        }

        let gameAction: GameAction | undefined;
        if (actionName !== undefined) {
            gameAction = profile.customGameActions?.find((action) => action.name === actionName)
                      ?? profile.defaultGameActions.find((action) => action.name === actionName);
        } else {
            gameAction = profile.activeGameAction ?? profile.defaultGameActions[0];
        }

        if (!gameAction) {
            return false;
        }

        if (!profile.deployed) {
            const appSettings = this.loadSettings();

            try {
                await this.deployProfile(profile, appSettings.pluginsEnabled);
            } catch (err) {
                log.error("Failed to launch profile", profileName, err);
                return false;
            }

            this.saveProfile(profile);
        }

        return this.runGameAction(profile, gameAction);
    }

    async deployMods(profile: AppProfile, root: boolean): Promise<string[]> {
        const profileModFiles = [];
        const relModDir = this.#expandPath(root ? profile.gameInstallation.rootDir : profile.gameInstallation.modDir);
        const gameModDir = path.resolve(relModDir);
        const extFilesBackupDir = path.join(relModDir, ElectronLoader.DEPLOY_EXT_BACKUP_DIR);
        const extFilesList = await this.findProfileExternalFilesInDir(profile, relModDir, !root);
        const gameDb = this.loadGameDatabase();
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
                const modDirPath = this.getProfileModDir(profile, modName, mod);
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

    async writePluginList(profile: AppProfile): Promise<string> {
        const pluginListPath = profile.gameInstallation.pluginListPath ? path.resolve(this.#expandPath(profile.gameInstallation.pluginListPath)) : undefined;

        if (pluginListPath) {
            const pluginListDir = path.dirname(pluginListPath);
            fs.mkdirpSync(pluginListDir);
            
            // Backup any existing plugins file
            if (fs.existsSync(pluginListPath)) {
                const backupDir = path.join(pluginListDir, ElectronLoader.DEPLOY_EXT_BACKUP_DIR);

                fs.mkdirpSync(backupDir);
                fs.copyFileSync(pluginListPath, path.join(backupDir, path.parse(pluginListPath).base));
            }

            // Write the plugin list
            try {
                fs.writeFileSync(pluginListPath, this.#createProfilePluginList(profile));
            } catch (err: any) {
                throw new Error(`Unable to write plugins list: ${err.toString()}`);
            }

            return pluginListPath;
        } else {
            throw new Error(`Unable to write plugins list: Plugin list path not defined in profile "${profile.name}"`);
        }
    }

    async writeConfigFiles(profile: AppProfile): Promise<string[]> {
        const deployConfigDir = profile.gameInstallation.configFilePath ? this.#expandPath(profile.gameInstallation.configFilePath) : undefined;

        if (!deployConfigDir || !fs.existsSync(deployConfigDir)) {
            throw new Error(`Unable to write config files: Profile's Game Config File Path "${profile.gameInstallation.configFilePath}" is not valid.`);
        }

        const gameDetails = this.#getGameDetails(profile.gameId);
        const backupDir = path.join(deployConfigDir, ElectronLoader.DEPLOY_EXT_BACKUP_DIR);
        const profileConfigDir = this.getProfileConfigDir(profile);

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
            const configSrcPath = path.resolve(this.resolveGameConfigFilePath(profile, configFileName, false) ?? rawConfigSrcPath);
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
                    backupFile += `_${this.#currentDateTimeAsFileName()}`;
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

    async writeSaveFiles(profile: AppProfile): Promise<string[]> {
        const deploySaveDir = profile.gameInstallation.saveFolderPath ? path.resolve(this.#expandPath(profile.gameInstallation.saveFolderPath)) : undefined;

        if (!deploySaveDir || !fs.existsSync(deploySaveDir)) {
            throw new Error(`Unable to write save files: Profile's Save Folder Path "${profile.gameInstallation.saveFolderPath}" is not valid.`);
        }

        const rootBackupDir = path.join(path.dirname(deploySaveDir), ElectronLoader.DEPLOY_EXT_BACKUP_DIR);
        const savesBackupDir = path.join(rootBackupDir, path.basename(deploySaveDir));
        const profileSaveDir = path.resolve(this.getProfileSaveDir(profile));

        // Backup existing saves
        if (fs.existsSync(deploySaveDir)) {
            fs.moveSync(deploySaveDir, savesBackupDir);
        }

        // Make sure profile save folder exists
        fs.mkdirpSync(profileSaveDir);

        if (this.#checkLinkSupported(profileSaveDir, [deploySaveDir], true, "junction")) {
            await fs.symlink(profileSaveDir, deploySaveDir, "junction");
        } else {
            log.error("Cannot deploy profile save files, symlink not supported for path from", profileSaveDir, "to", deploySaveDir);
            throw new Error("Cannot deploy profile save files, symlink not supported for path.");
        }

        // Create helper symlink for easy access to backed up saves
        const backupDirHelperLink = `${deploySaveDir.replace(/[/\\]$/, "")}.original`;
        if (this.#checkLinkSupported(path.resolve(savesBackupDir), [path.resolve(backupDirHelperLink)], true, "dir")) {
            if (fs.existsSync(savesBackupDir)) {
                await fs.symlink(path.resolve(savesBackupDir), path.resolve(backupDirHelperLink), "dir");
            }
        }

        return [deploySaveDir, backupDirHelperLink];
    }

    async writeSteamCompatSymlinks(profile: AppProfile): Promise<string[]> {
        if (!profile.gameInstallation.steamId?.length || !profile.steamCustomGameId) {
            return [];
        }

        const gameCompatSteamuserDir = this.#getSteamCompatSteamuserDir(profile.gameInstallation);
        const customCompatSteamuserDir = this.#getCoreSteamCompatSteamuserDir(profile.steamCustomGameId);

        if (!gameCompatSteamuserDir || !customCompatSteamuserDir || !fs.existsSync(gameCompatSteamuserDir) || !fs.existsSync(customCompatSteamuserDir)) {
            return [];
        }

        if (gameCompatSteamuserDir === customCompatSteamuserDir) {
            return [];
        }

        const customCompatRoot = this.#getCoreSteamCompatRoot(profile.steamCustomGameId);
        if (!customCompatRoot) {
            return [];
        }

        const rootBackupDir = path.join(customCompatRoot, ElectronLoader.DEPLOY_EXT_BACKUP_DIR);
        const userDirBackupDir = path.join(rootBackupDir, ElectronLoader.STEAM_COMPAT_STEAMUSER_DIR);

        // Backup existing steamuser dir
        fs.mkdirpSync(rootBackupDir);
        fs.moveSync(customCompatSteamuserDir, userDirBackupDir);

        // Symlink the user steamuser dir to the game steamuser dir
        fs.ensureSymlinkSync(gameCompatSteamuserDir, customCompatSteamuserDir, "dir");

        return [path.resolve(customCompatSteamuserDir)];
    }

    async processDeployedFiles(profile: AppProfile, _profileModFiles: string[]): Promise<string[]> {
        const gameDetails = this.#getGameDetails(profile.gameId);
        const timestampedPluginTypes: GamePluginListType[] = ["Gamebryo", "NetImmerse"];

        // Some games require processing of plugin file timestamps to enforce load order
        if (!!gameDetails?.pluginListType && profile.plugins && timestampedPluginTypes.includes(gameDetails.pluginListType)) {
            let gamePluginDir = this.#expandPath(profile.gameInstallation.modDir);

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

    async deployProfile(profile: AppProfile, deployPlugins: boolean): Promise<void> {
        const profileModFiles: string[] = [];
        let deploymentError = undefined;

        try {
            // Ensure the mod base dir exists
            fs.mkdirpSync(this.#expandPath(profile.gameInstallation.modDir));

            if (this.isSimilarProfileDeployed(profile)) {
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

    async undeployProfile(profile: AppProfile): Promise<void> {
        try {
            if (!this.isSimilarProfileDeployed(profile)) {
                return;
            }

            const deploymentMetadata = this.readProfileDeploymentMetadata(profile);
            if (!deploymentMetadata) {
                log.error("Mod undeployment failed unexpectedly.");
                return;
            }

            // A deployed profile is orphaned if it is not known by the running instance of the application
            let orphanedDeploy = false;

            if (deploymentMetadata.profile !== profile.name) {
                const originalProfile = this.loadProfile(deploymentMetadata.profile) as AppProfile;
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

            const gameModDir = this.#expandPath(profile.gameInstallation.modDir);
            const gameRootDir = this.#expandPath(profile.gameInstallation.rootDir);

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
                ? this.#getCoreSteamCompatRoot(profile.steamCustomGameId)
                : undefined;

            const extFilesBackupDirs = uniq([
                path.join(gameModDir, ElectronLoader.DEPLOY_EXT_BACKUP_DIR),
                path.join(gameRootDir, ElectronLoader.DEPLOY_EXT_BACKUP_DIR),
                ... profile.gameInstallation.configFilePath ? [path.join(profile.gameInstallation.configFilePath, ElectronLoader.DEPLOY_EXT_BACKUP_DIR)] : [],
                ... profile.gameInstallation.saveFolderPath ? [path.join(path.dirname(profile.gameInstallation.saveFolderPath), ElectronLoader.DEPLOY_EXT_BACKUP_DIR)] : [],
                ... profile.gameInstallation.pluginListPath ? [path.join(path.dirname(profile.gameInstallation.pluginListPath), ElectronLoader.DEPLOY_EXT_BACKUP_DIR)] : [],
                ... customSteamCompatRoot ? [path.join(customSteamCompatRoot, ElectronLoader.DEPLOY_EXT_BACKUP_DIR)] : [],
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
            const metadataFilePath = path.join(gameModDir, ElectronLoader.PROFILE_METADATA_FILE);
            if (fs.existsSync(metadataFilePath)) {
                fs.rmSync(path.join(gameModDir, ElectronLoader.PROFILE_METADATA_FILE));
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

    getAppAboutInfo(): AppMessageData<"app:showAboutInfo"> {
        let depsLicenseText = "";
        let depsInfo = undefined;

        try {
            depsLicenseText += fs.readFileSync(ElectronLoader.APP_DEPS_LICENSES_FILE).toString("utf-8");
            depsLicenseText += "\n";
            depsLicenseText += fs.readFileSync(ElectronLoader.APP_ELECTRON_DEPS_LICENSES_FILE).toString("utf-8");
        } catch (_err) {}

        try {
            depsInfo = fs.readJSONSync(ElectronLoader.APP_DEPS_INFO_FILE);
        } catch (_err) {}

        return {
            appName: ElectronLoader.APP_NAME,
            appShortName: ElectronLoader.APP_SHORT_NAME,
            appVersion: ElectronLoader.APP_VERSION,
            gameSchemaVersion: ElectronLoader.GAME_SCHEMA_VERSION,
            depsLicenseText,
            depsInfo
        };
    }
    
    showAppAboutInfo() {
        this.mainWindow!.webContents.send("app:showAboutInfo", this.getAppAboutInfo());
    }

    showAppSupportInfo() {
        this.mainWindow!.webContents.send("app:showSupportInfo", this.getAppAboutInfo());
    }

    checkLinkSupported(
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
        result = this.#checkLinkSupported(
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
                    result = this.#checkLinkSupported(
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

    #getGameDetails(gameId: GameId): GameDetails | undefined {
        const gameDb = this.loadGameDatabase();
        return gameDb[gameId];
    }

    #expandSteamCompatRootPath(dir: string, compatRoot: string): string {
        if (dir.startsWith("$")) {
            dir = dir.replace(/\$/, "");
            dir = path.join(compatRoot, dir);
        }

        return dir;
    }

    #isValidGameInstallation(gameInstallation: GameInstallation): boolean {
        return [
            fs.existsSync(gameInstallation.rootDir),
            fs.existsSync(gameInstallation.modDir),
            fs.existsSync(gameInstallation.configFilePath)
        ].every(Boolean);
    }

    #findAvailableGameInstallations(gameId: GameId): GameInstallation[] {
        const result: GameInstallation[] = [];
        const gameDetails = this.#getGameDetails(gameId);

        if (!gameDetails) {
            return result;
        }
        
        for (const defaultGameInstallation of gameDetails.installations) {
            result.push(...this.#expandGameInstallation(defaultGameInstallation).filter((expandedInstallation) => {
                return this.#isValidGameInstallation(expandedInstallation);
            }));
        }

        return result;
    }

    #findAvailableGameInstallationsByRootDir(gameId: GameId, rootDir: string): GameInstallation[] {
        const result: GameInstallation[] = [];
        const gameDetails = this.#getGameDetails(gameId);

        if (!gameDetails) {
            return result;
        }

        rootDir = this.#expandPath(rootDir);
        if (!fs.existsSync(rootDir)) {
            return result;
        }

        for (const defaultGameInstallation of gameDetails.installations) {
            const customGameInstallation = cloneDeep(defaultGameInstallation);
            customGameInstallation.rootDir = rootDir;

            result.push(...this.#expandGameInstallation(customGameInstallation).filter((expandedInstallation) => {
                return this.#isValidGameInstallation(expandedInstallation);
            }));
        }

        return result;
    }

    #expandGameInstallation(gameInstallation: GameInstallation): GameInstallation[] {
        const expandedInstallations: GameInstallation[] = [];

        if (gameInstallation.steamId?.length) {
            for (const steamId of gameInstallation.steamId) {
                const expandedInstallation = cloneDeep(gameInstallation);
                expandedInstallation.steamId = [steamId];
                expandedInstallation.rootDir = this.#expandPath(expandedInstallation.rootDir);

                const compatDataRoot = this.#getSteamCompatRoot(expandedInstallation);

                if (compatDataRoot) {
                    expandedInstallation.modDir = this.#expandSteamCompatRootPath(expandedInstallation.modDir, compatDataRoot);
                    expandedInstallation.saveFolderPath = this.#expandSteamCompatRootPath(expandedInstallation.saveFolderPath, compatDataRoot);

                    if (expandedInstallation.pluginListPath) {
                        expandedInstallation.pluginListPath = this.#expandSteamCompatRootPath(expandedInstallation.pluginListPath, compatDataRoot);
                    }

                    expandedInstallation.configFilePath = this.#expandSteamCompatRootPath(expandedInstallation.configFilePath, compatDataRoot);
                }

                expandedInstallations.push(expandedInstallation);
            }
        } else {
            expandedInstallations.push(cloneDeep(gameInstallation));
        }

        expandedInstallations.forEach((gameInstallation) => {
            gameInstallation.rootDir = this.#expandPath(gameInstallation.rootDir);
            gameInstallation.modDir = this.#expandPath(gameInstallation.modDir);
    
            if (!path.isAbsolute(gameInstallation.modDir)) {
                gameInstallation.modDir = path.join(gameInstallation.rootDir, gameInstallation.modDir);
            }
    
            gameInstallation.saveFolderPath = this.#expandPath(gameInstallation.saveFolderPath);
    
            if (!path.isAbsolute(gameInstallation.saveFolderPath)) {
                gameInstallation.saveFolderPath = path.join(gameInstallation.rootDir, gameInstallation.saveFolderPath);
            }
            
            if (gameInstallation.pluginListPath) {
                gameInstallation.pluginListPath = this.#expandPath(gameInstallation.pluginListPath);
    
                if (!path.isAbsolute(gameInstallation.pluginListPath)) {
                    gameInstallation.pluginListPath = path.join(gameInstallation.rootDir, gameInstallation.pluginListPath);
                }
            }
    
            gameInstallation.configFilePath = this.#expandPath(gameInstallation.configFilePath);

            if (!path.isAbsolute(gameInstallation.configFilePath)) {
                gameInstallation.configFilePath = path.join(gameInstallation.rootDir, gameInstallation.configFilePath);
            }
        });

        return expandedInstallations;
    }

    #resolveSteamLibraryDirFromPath(dir: string, steamId: string): string | undefined {
        dir = this.#expandPath(dir);
        
        if (!fs.existsSync(dir)) {
            return undefined;
        }

        // TODO - Better way to check if we're in a Steam library folder
        const compatdata = fs.readdirSync(dir).find((relPath: string) => relPath === `appmanifest_${steamId}.acf`);

        if (compatdata) {
            return dir;
        } else {
            const nextDir = path.dirname(dir);
            if (nextDir === dir) {
                return undefined;
            }

            return this.#resolveSteamLibraryDirFromPath(nextDir, steamId);
        }
    }

    #getSteamCompatRoot(gameInstallation: GameInstallation): string | undefined {
        const gameRootDir = this.#expandPath(gameInstallation.rootDir);

        if (!fs.existsSync(gameRootDir)) {
            return undefined;
        }

        if (!gameInstallation.steamId?.length) {
            return undefined;
        }

        const gameSteamId = gameInstallation.steamId[0];
        const steamDir = this.#resolveSteamLibraryDirFromPath(path.dirname(gameRootDir), gameSteamId);

        if (!steamDir) {
            return undefined;
        }

        return path.join(steamDir, "compatdata", gameSteamId);
    }

    #getSteamCompatSteamuserDir(gameInstallation: GameInstallation): string | undefined {
        const rootDir = this.#getSteamCompatRoot(gameInstallation);

        if (!rootDir) {
            return undefined;
        }

        return this.#expandPath(path.join(rootDir, ElectronLoader.STEAM_COMPAT_STEAMUSER_DIR));
    }

    #getCoreSteamCompatRoot(steamId: string): string | undefined {
        const appSettings = this.loadSettings();
        const compatDataRoot = appSettings.steamCompatDataRoot || ElectronLoader.STEAM_DEFAULT_COMPAT_DATA_ROOT;
        
        if (!compatDataRoot) {
            return undefined;
        }

        return this.#expandPath(path.join(compatDataRoot, steamId));
    }

    #getCoreSteamCompatSteamuserDir(steamId: string): string | undefined {
        const rootDir = this.#getCoreSteamCompatRoot(steamId);

        if (!rootDir) {
            return undefined;
        }

        return this.#expandPath(path.join(rootDir, ElectronLoader.STEAM_COMPAT_STEAMUSER_DIR));
    }

    #createProfilePluginList(
        profile: AppProfile,
        listType?: GamePluginListType
    ): string {
        const gameDetails = this.#getGameDetails(profile.gameId);

        switch (listType ?? gameDetails?.pluginListType) {
            case "Gamebryo": {
                return this.#createProfilePluginListGamebryo(profile);
            }
            case "NetImmerse": {
                return "";
            }
            case "CreationEngine":
            case "Default": {
                return this.#createProfilePluginListCreationEngine(profile);
            }
            default: throw new Error("Game has unknown plugin list type.");
        }
    }

    #createProfilePluginListHeader(profile: AppProfile): string {
        return `# This file was generated automatically by ${ElectronLoader.APP_NAME} for profile "${profile.name}"\n`;
    }

    #createProfilePluginListGamebryo(profile: AppProfile): string {
        const header = this.#createProfilePluginListHeader(profile);

        return profile.plugins.reduce((data, pluginRef) => {
            if (pluginRef.enabled) {
                data += pluginRef.plugin;
                data += "\n";
            }
            return data;
        }, header);
    }

    #createProfilePluginListCreationEngine(profile: AppProfile): string {
        const header = this.#createProfilePluginListHeader(profile);

        return profile.plugins.reduce((data, pluginRef) => {
            if (pluginRef.enabled) {
                data += "*";
            }

            data += pluginRef.plugin;
            data += "\n";
            return data;
        }, header);
    }

    #expandPath(_path: string): string {

        // Normalize separators for the current platform
        _path = _path.replace(/[\\/]/g, path.sep);

        // Expand home dir
        if (_path[0] === "~") {
            _path = _path.replace(/~/, os.homedir());
        }

        // Expand Windows env vars
        return this.#resolveWindowsEnvironmentVariables(_path);
    }

    #firstValidPath(
        paths: string[],
        pathCheckTransformer: ((path: string) => string) | undefined
    ): string | undefined {
        return paths
                .map(_path => this.#expandPath(_path))
                .find(_path => fs.existsSync(pathCheckTransformer ? pathCheckTransformer(_path) : _path));
    }

    // Credit: https://stackoverflow.com/a/57253723
    /**
    * Replaces all environment variables with their actual value.
    * Keeps intact non-environment variables using '%'.
    * @param  filePath The input file path with percents
    * @return          The resolved file path
    */
    #resolveWindowsEnvironmentVariables(filePath: string): string {
        if (!filePath || typeof (filePath) !== "string") {
            return "";
        }

        /**
         * @param withPercents    "%USERNAME%"
         * @param withoutPercents "USERNAME"
         */
        filePath = filePath.replace(/%([^%]+)%/g, (withPercents: string, withoutPercents: string): string => {
            return process.env[withoutPercents] || withPercents;
        });

        return filePath;
    }

    #asFileName(text: string): string {
        return text.replace(/[*?"<>|:./\\]/g, "_");
    }

    #currentDateTimeAsFileName(): string {
        return this.#asFileName(new Date().toISOString());
    }

    #resolveFullProfileDir(profile: AppProfile | AppBaseProfile | AppProfile.Form, profileDir: string): string {
        profileDir = this.#expandPath(profileDir);

        return path.isAbsolute(profileDir)
            ? profileDir
            : path.join(this.getProfileDir(profile), profileDir)
    }

    async #batchTaskAsync<T>(
        items: T[],
        batchSize: number,
        task: (item: T, index: number) => Promise<unknown>
    ): Promise<void> {
        let curIndex = 0;
        while (curIndex < items.length) {
            await new Promise(async (resolve) => {
                for (let j = 0; j < Math.min(batchSize, items.length - curIndex); ++j, ++curIndex) {
                    await task(items[curIndex], curIndex);
                }

                setTimeout(() => resolve(undefined));
            });
        }
    }

    #checkLinkSupported(
        targetPath: string,
        destPaths: string[],
        symlink: boolean,
        symlinkType?: SymlinkType
    ) {
        if (!targetPath || !destPaths || destPaths.length === 0) {
            return false;
        }
        
        let srcTestFile = "";
        let srcCreatedDir = "";

        try {
            if (!fs.existsSync(targetPath)) {
                srcCreatedDir = this.#mkdirpSync(targetPath);
            }

            if (fs.lstatSync(targetPath).isFile()) {
                targetPath = path.dirname(targetPath);
            }

            srcTestFile = path.resolve(path.join(targetPath, ElectronLoader.PROFILE_LINK_SUPPORT_TEST_FILE));
        
            if (!fs.existsSync(srcTestFile)) {
                fs.writeFileSync(srcTestFile, "");
            }

            return destPaths.every((destPath) => {
                let destTestFile = "";
                let destCreatedDir = "";

                try {
                    if (!destPath) {
                        return false;
                    }

                    if (!fs.existsSync(destPath)) {
                        destCreatedDir = this.#mkdirpSync(destPath);
                    }

                    if (fs.lstatSync(destPath).isFile()) {
                        destPath = path.dirname(destPath);
                    }

                    destTestFile = path.resolve(path.join(destPath, ElectronLoader.PROFILE_LINK_SUPPORT_TEST_FILE));

                    // Allow link tests to the same dir if symlink type is file
                    if (srcTestFile === destTestFile && (!symlinkType || symlinkType === "file")) {
                        destTestFile = `${destTestFile}.1`;
                    }
    
                    // Create a test link
                    if (symlink) {
                        fs.symlinkSync(srcTestFile, destTestFile, symlinkType ?? null);
                    } else {
                        fs.linkSync(srcTestFile, destTestFile);
                    }
    
                    return true;
                } catch (err) {
                    return false;
                } finally {
                    if (destTestFile) {
                        try {
                            fs.removeSync(destTestFile);
                        } catch (err) {}
                    }

                    if (destCreatedDir) {
                        try {
                            fs.removeSync(destCreatedDir);
                        } catch (err) {}
                    }
                }

                return false;
            });
        } catch(err) {
            return false;
        } finally {
            if (srcTestFile) {
                try {
                    fs.removeSync(srcTestFile);
                } catch (err) {}
            }

            if (srcCreatedDir) {
                try {
                    fs.removeSync(srcCreatedDir);
                } catch (err) {}
            }
        }

        return false;
    }

    /** @return The outermost directory that was created. */ 
    #mkdirpSync(pathToCreate: string): string {
        const pathParts = pathToCreate.split(path.sep);

        for (let i = 0, curPath = ""; i < pathParts.length; ++i) {
            let pathPart = pathParts[i];
            if (pathPart.length === 0) {
                pathPart = path.sep;
            }

            curPath = curPath.length === 0 ? pathPart : path.join(curPath, pathPart);

            if (!fs.existsSync(curPath)) {
                fs.mkdirpSync(pathToCreate);
                return curPath;
            }
        }

        return "";
    }

    #resolve7zBinaryPath(): string {
        // Look for 7-Zip installed on system
        const _7zBinaries = [
            "7zzs",
            "7zz",
            "7z",
            "7z.exe"
        ];

        const _7zBinaryLocations = [
            "C:\\Program Files\\7-Zip\\7z.exe",
            "C:\\Program Files (x86)\\7-Zip\\7z.exe"
        ];

        let _7zBinaryPath = _7zBinaryLocations.find(_7zPath => fs.existsSync(_7zPath));
        
        if (!_7zBinaryPath) {
            _7zBinaryPath = _7zBinaries.reduce((_7zBinaryPath, _7zBinaryPathGuess) => {
                try {
                    const which7zBinaryPath = which.sync(_7zBinaryPathGuess);
                    _7zBinaryPath = (Array.isArray(which7zBinaryPath)
                        ? which7zBinaryPath[0]
                        : which7zBinaryPath
                    ) ?? undefined;
                } catch (_err) {}

                return _7zBinaryPath;
            }, _7zBinaryPath);
        }

        if (!_7zBinaryPath) {
            // Fall back to bundled 7-Zip binary if it's not found on system
            // TODO - Warn user about opening RARs if 7-Zip not installed on machine
            _7zBinaryPath = sevenBin.path7za;

            log.warn("7-Zip binary was not found on this machine. Falling back to bundled binary.");
            log.warn("NOTE: RAR archives can not be read using the bundled binary. Install 7-Zip to read RAR archives.");
        } else {
            log.info("Found 7-Zip binary: ", _7zBinaryPath);
        }

        return _7zBinaryPath!;
    }

    #formatLogData(logData: any[]): string {
        return logData?.map(arg => this.#formatLogArg(arg)).join(" ") ?? "";
    }

    #formatLogArg(arg: any): string {
        if (arg === undefined) {
            return "undefined";
        } else if (arg === null) {
            return "null";
        } else if (arg instanceof Error) {
            return arg.toString();
        } else if (arg !== undefined && arg !== null && typeof arg === "object") {
            return JSON.stringify(arg);
        } else {
            return arg?.toString();
        }
    }
}

// Load the app
const loader = new ElectronLoader();