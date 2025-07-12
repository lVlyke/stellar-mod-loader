import type { AppSettingsUserCfg } from "../../app/models/app-settings-user-cfg";
import type { GameInstallation } from "../../app/models/game-installation";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");

import { AppConstants } from "../constants";
import { PathUtils } from "./path-utils";

export namespace SteamUtils {

    export function expandSteamCompatRootPath(dir: string, compatRoot: string): string {
        if (dir.startsWith("$")) {
            dir = dir.replace(/\$/, "");
            dir = path.join(compatRoot, dir);
        }

        return dir;
    }

    export function resolveSteamLibraryDirFromPath(dir: string, steamId: string): string | undefined {
        dir = PathUtils.expandPath(dir);
        
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

            return resolveSteamLibraryDirFromPath(nextDir, steamId);
        }
    }

    export function getSteamCompatRoot(gameInstallation: GameInstallation): string | undefined {
        const gameRootDir = PathUtils.expandPath(gameInstallation.rootDir);

        if (!fs.existsSync(gameRootDir)) {
            return undefined;
        }

        if (!gameInstallation.steamId?.length) {
            return undefined;
        }

        const gameSteamId = gameInstallation.steamId[0];
        const steamDir = resolveSteamLibraryDirFromPath(path.dirname(gameRootDir), gameSteamId);

        if (!steamDir) {
            return undefined;
        }

        return path.join(steamDir, "compatdata", gameSteamId);
    }

    export function getSteamCompatSteamuserDir(gameInstallation: GameInstallation): string | undefined {
        const rootDir = getSteamCompatRoot(gameInstallation);

        if (!rootDir) {
            return undefined;
        }

        return PathUtils.expandPath(path.join(rootDir, AppConstants.STEAM_COMPAT_STEAMUSER_DIR));
    }

    export function getCoreSteamCompatRoot(appSettings: AppSettingsUserCfg, steamId: string): string | undefined {
        const compatDataRoot = appSettings.steamCompatDataRoot || AppConstants.STEAM_DEFAULT_COMPAT_DATA_ROOT;
        
        if (!compatDataRoot) {
            return undefined;
        }

        return PathUtils.expandPath(path.join(compatDataRoot, steamId));
    }

    export function getCoreSteamCompatSteamuserDir(appSettings: AppSettingsUserCfg, steamId: string): string | undefined {
        const rootDir = getCoreSteamCompatRoot(appSettings, steamId);

        if (!rootDir) {
            return undefined;
        }

        return PathUtils.expandPath(path.join(rootDir, AppConstants.STEAM_COMPAT_STEAMUSER_DIR));
    }
}