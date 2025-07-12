import type { AppProfile } from "../../app/models/app-profile";
import type { AppMessageData } from "../../app/models/app-message";
import type { AppSettingsUserCfg } from "../../app/models/app-settings-user-cfg";
import type { GameDatabase } from "../../app/models/game-database";
import type { GameDetails } from "../../app/models/game-details";
import type { GameAction } from "../../app/models/game-action";
import type { GameId } from "../../app/models/game-id";
import type { GameInstallation } from "../../app/models/game-installation";

import * as log from "electron-log/main";
import { cloneDeep } from "es-toolkit";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");

import type { ElectronApp } from "../app";
import type { ProfileDataManager } from "./profile-data-manager";
import type { ProfileDeploymentManager } from "./profile-deployment-manager";
import { AppConstants } from "../constants";
import { PathUtils } from "../util/path-utils";
import { SteamUtils } from "../util/steam-utils";

export class AppDataManager {

    constructor(
        private readonly app: ElectronApp
    ) {}

    private get profileDataManager(): ProfileDataManager {
        return this.app.profileDataManager;
    }

    private get profileDeploymentManager(): ProfileDeploymentManager {
        return this.app.profileDeploymentManager;
    }

    public loadProfileList(): AppProfile.Description[] {
        if (!fs.existsSync(AppConstants.APP_PROFILES_DIR)) {
            return [];
        }

        const profileNames = fs.readdirSync(AppConstants.APP_PROFILES_DIR).sort();
        return profileNames.map((profileName: string) => {
            const profile = this.profileDataManager.loadProfile(profileName);
            return {
                name: profileName,
                gameId: profile?.gameId ?? "$unknown",
                deployed: profile?.deployed ?? false,
                rootPathOverride: profile?.rootPathOverride,
                invalid: profile ? profile.invalid : true
            };
        });
    }

    public loadSettings(): AppSettingsUserCfg {
        const settingsSrc = fs.readFileSync(AppConstants.APP_SETTINGS_FILE);

        return JSON.parse(settingsSrc.toString("utf8"));
    }

    public saveSettings(settings: AppSettingsUserCfg): void {
        return fs.writeFileSync(
            path.join(AppConstants.APP_SETTINGS_FILE),
            JSON.stringify(settings)
        );
    }

    public loadGameDatabase(includeCustomGames = true): GameDatabase {
        if (!fs.existsSync(AppConstants.GAME_DB_FILE)) {
            return {};
        }

        const dbSrc = fs.readFileSync(AppConstants.GAME_DB_FILE);
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

    public exportGameDetails(gameDetails: GameDetails, gamePath: string): void {
        fs.writeJSONSync(gamePath, {
            ...gameDetails,
            schemaVersion: AppConstants.GAME_SCHEMA_VERSION
        }, { spaces: 4 });
    }

    public getAppAboutInfo(): AppMessageData<"app:showAboutInfo"> {
        let depsLicenseText = "";
        let depsInfo = undefined;

        try {
            depsLicenseText += fs.readFileSync(AppConstants.APP_DEPS_LICENSES_FILE).toString("utf-8");
            depsLicenseText += "\n";
            depsLicenseText += fs.readFileSync(AppConstants.APP_ELECTRON_DEPS_LICENSES_FILE).toString("utf-8");
        } catch (_err) {}

        try {
            depsInfo = fs.readJSONSync(AppConstants.APP_DEPS_INFO_FILE);
        } catch (_err) {}

        return {
            appName: AppConstants.APP_NAME,
            appShortName: AppConstants.APP_SHORT_NAME,
            appVersion: AppConstants.APP_VERSION,
            gameSchemaVersion: AppConstants.GAME_SCHEMA_VERSION,
            depsLicenseText,
            depsInfo
        };
    }

    public async directLaunchProfileByName(profileName: string, actionName?: string): Promise<boolean> {
        const profile = this.profileDataManager.loadProfile(profileName);
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
                await this.profileDeploymentManager.deployProfile(profile, appSettings.pluginsEnabled);
            } catch (err) {
                log.error("Failed to launch profile", profileName, err);
                return false;
            }

            this.profileDataManager.saveProfile(profile);
        }

        return this.profileDataManager.runGameAction(profile, gameAction);
    }

    public getGameDetails(gameId: GameId): GameDetails | undefined {
        const gameDb = this.loadGameDatabase();
        return gameDb[gameId];
    }

    public isValidGameInstallation(gameInstallation: GameInstallation): boolean {
        return [
            fs.existsSync(gameInstallation.rootDir),
            fs.existsSync(gameInstallation.modDir),
            fs.existsSync(gameInstallation.configFilePath)
        ].every(Boolean);
    }

    public findAvailableGameInstallations(gameId: GameId): GameInstallation[] {
        const result: GameInstallation[] = [];
        const gameDetails = this.getGameDetails(gameId);

        if (!gameDetails) {
            return result;
        }
        
        for (const defaultGameInstallation of gameDetails.installations) {
            result.push(...this.expandGameInstallation(defaultGameInstallation).filter((expandedInstallation) => {
                return this.isValidGameInstallation(expandedInstallation);
            }));
        }

        return result;
    }

    public findAvailableGameInstallationsByRootDir(gameId: GameId, rootDir: string): GameInstallation[] {
        const result: GameInstallation[] = [];
        const gameDetails = this.getGameDetails(gameId);

        if (!gameDetails) {
            return result;
        }

        rootDir = PathUtils.expandPath(rootDir);
        if (!fs.existsSync(rootDir)) {
            return result;
        }

        for (const defaultGameInstallation of gameDetails.installations) {
            const customGameInstallation = cloneDeep(defaultGameInstallation);
            customGameInstallation.rootDir = rootDir;

            result.push(...this.expandGameInstallation(customGameInstallation).filter((expandedInstallation) => {
                return this.isValidGameInstallation(expandedInstallation);
            }));
        }

        return result;
    }

    public expandGameInstallation(gameInstallation: GameInstallation): GameInstallation[] {
        const expandedInstallations: GameInstallation[] = [];

        if (gameInstallation.steamId?.length) {
            for (const steamId of gameInstallation.steamId) {
                const expandedInstallation = cloneDeep(gameInstallation);
                expandedInstallation.steamId = [steamId];
                expandedInstallation.rootDir = PathUtils.expandPath(expandedInstallation.rootDir);

                const compatDataRoot = SteamUtils.getSteamCompatRoot(expandedInstallation);

                if (compatDataRoot) {
                    expandedInstallation.modDir = SteamUtils.expandSteamCompatRootPath(expandedInstallation.modDir, compatDataRoot);
                    expandedInstallation.saveFolderPath = SteamUtils.expandSteamCompatRootPath(expandedInstallation.saveFolderPath, compatDataRoot);

                    if (expandedInstallation.pluginListPath) {
                        expandedInstallation.pluginListPath = SteamUtils.expandSteamCompatRootPath(expandedInstallation.pluginListPath, compatDataRoot);
                    }

                    expandedInstallation.configFilePath = SteamUtils.expandSteamCompatRootPath(expandedInstallation.configFilePath, compatDataRoot);
                }

                expandedInstallations.push(expandedInstallation);
            }
        } else {
            expandedInstallations.push(cloneDeep(gameInstallation));
        }

        expandedInstallations.forEach((gameInstallation) => {
            gameInstallation.rootDir = PathUtils.expandPath(gameInstallation.rootDir);
            gameInstallation.modDir = PathUtils.expandPath(gameInstallation.modDir);
    
            if (!path.isAbsolute(gameInstallation.modDir)) {
                gameInstallation.modDir = path.join(gameInstallation.rootDir, gameInstallation.modDir);
            }
    
            gameInstallation.saveFolderPath = PathUtils.expandPath(gameInstallation.saveFolderPath);
    
            if (!path.isAbsolute(gameInstallation.saveFolderPath)) {
                gameInstallation.saveFolderPath = path.join(gameInstallation.rootDir, gameInstallation.saveFolderPath);
            }
            
            if (gameInstallation.pluginListPath) {
                gameInstallation.pluginListPath = PathUtils.expandPath(gameInstallation.pluginListPath);
    
                if (!path.isAbsolute(gameInstallation.pluginListPath)) {
                    gameInstallation.pluginListPath = path.join(gameInstallation.rootDir, gameInstallation.pluginListPath);
                }
            }
    
            gameInstallation.configFilePath = PathUtils.expandPath(gameInstallation.configFilePath);

            if (!path.isAbsolute(gameInstallation.configFilePath)) {
                gameInstallation.configFilePath = path.join(gameInstallation.rootDir, gameInstallation.configFilePath);
            }
        });

        return expandedInstallations;
    }
}