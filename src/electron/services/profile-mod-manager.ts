import type { AppBaseProfile, AppProfile } from "../../app/models/app-profile";
import type { ModImportRequest, ModImportResult } from "../../app/models/mod-import-status";
import type { Fomod } from "../../app/models/fomod";
import type { ModInstaller } from "../../app/models/mod-installer";
import type { ModOverwriteFilesEntry } from "../../app/models/mod-overwrite-files";
import type { ModProfileRef } from "../../app/models/mod-profile-ref";

import type Electron from "electron";
import * as log from "electron-log/main";
import * as xml2js from "xml2js";
import * as Seven from "node-7z";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");
const { dialog } = require("electron") as typeof Electron;
const detectFileEncodingAndLanguage = /** @type {typeof import("detect-file-encoding-and-language").default} */ (
    require("detect-file-encoding-and-language/src/index-node.js")
);

import type { ElectronApp } from "../app";
import type { AppDataManager } from "./app-data-manager";
import type { ProfileDataManager } from "./profile-data-manager";
import { PathUtils } from "../util/path-utils";
import { BinUtils } from "../util/bin-utils";
import { AsyncUtils } from "../util/async-utils";

export class ProfileModManager {

    constructor(
        private readonly app: ElectronApp
    ) {}

    private get appDataManager(): AppDataManager {
        return this.app.appDataManager;
    }

    private get profileDataManager(): ProfileDataManager {
        return this.app.profileDataManager;
    }

    public async beginModAdd(profile: AppProfile, root: boolean, modPath?: string): Promise<ModImportRequest | undefined> {
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
            const modDirStagingPath = path.join(this.profileDataManager.getProfileTmpDir(profile), modName);
            let decompressOperation: Promise<boolean>;

            // Clear the staging dir
            fs.rmSync(modDirStagingPath, { recursive: true, force: true });

            switch (fileType.toLowerCase()) {
                case ".7z":
                case ".7zip":
                case ".zip":
                case ".rar": {
                    decompressOperation = new Promise((resolve, _reject) => {
                        const _7zBinaryPath = BinUtils.resolve7zBinaryPath();
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

    public async beginModExternalImport(profile: AppProfile, root: boolean, modPath?: string): Promise<ModImportRequest | undefined> {
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

    public async beginModImport(
        profile: AppProfile,
        root: boolean,
        modName: string,
        modImportPath: string,
        modFilePaths: string[],
        externalImport: boolean
    ): Promise<ModImportRequest> {
        const gameDb = this.appDataManager.loadGameDatabase();
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
                        const versionEl = fomodModuleInfo.fomod.Version?.[0];
                        moduleInfo = {
                            name: fomodModuleInfo.fomod.Name?.[0],
                            author: fomodModuleInfo.fomod.Author ?? [],
                            version: typeof versionEl === "string" ? versionEl : versionEl?._,
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

    public async completeModImport(
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
                fileEntry.filePath = PathUtils.expandPath(fileEntry.filePath);

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
                                let pathMapSrcNorm = PathUtils.expandPath(pathMapSrcRaw).toLowerCase();

                                if (!pathMapSrcNorm.startsWith(modSubdirRoot.toLowerCase())) {
                                    pathMapSrcNorm = path.join(modSubdirRoot, pathMapSrcNorm).toLowerCase();
                                }
        
                                return filEntryMatchesPath(pathMapSrcNorm);
                            });
                        } else {
                            const pathMapSrcNorm = PathUtils.expandPath(pathMapSrcRaw).toLowerCase();
                            return filEntryMatchesPath(pathMapSrcNorm);
                        }
                    });
                    fileEntry.enabled = !!mappedEntry;

                    if (mappedEntry) {
                        const mappedSrcPath = PathUtils.expandPath(mappedEntry[0]);
                        const mappedDestPath = PathUtils.expandPath(mappedEntry[1]);
                        // Map the file path to the destination path, excluding any root data dir
                        if (fileEntry.filePath.toLowerCase().startsWith(mappedSrcPath.toLowerCase())) {
                            fileEntry.mappedFilePath = `${mappedDestPath}${fileEntry.filePath.substring(mappedSrcPath.length)}`;
                            fileEntry.mappedFilePath = fileEntry.mappedFilePath.replace(/^[/\\]+/, "");
                            fileEntry.mappedFilePath = fileEntry.mappedFilePath.replace(/^[Dd]ata[\\/]/, "");

                            // If `mappedFilePath` is empty, put the file in the base mod directory
                            if (fileEntry.mappedFilePath.length === 0) {
                                fileEntry.mappedFilePath = path.basename(fileEntry.filePath);
                            }
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

            const modProfilePath = this.profileDataManager.getProfileOwnModDir(profile, modName);

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

    public verifyProfileMods(root: boolean, profile: AppProfile): AppProfile.CollectedVerificationResult {
        const modsDir = this.profileDataManager.getProfileModsDir(profile);
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
                ? this.profileDataManager.getProfileModsDir(profile.baseProfile!)
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

    public async calculateModOverwriteFiles(
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
            const modDirPath = this.profileDataManager.getProfileModDir(profile, modName, modRef);

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
                await AsyncUtils.batchTaskAsync(modDirFiles, 100, async (modFile) => {
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
}