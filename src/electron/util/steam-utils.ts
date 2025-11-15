import type { AppSettingsUserCfg } from "../../app/models/app-settings-user-cfg";
import type { GameInstallation } from "../../app/models/game-installation";

import * as vdf from "steam-binary-vdf";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");

import { AppConstants } from "../constants";
import { PathUtils } from "./path-utils";

export interface SteamUserShortcut {
    appid: number,
    AppName: string,
    Exe: string,
    StartDir: string,
    icon: string,
    ShortcutPath: string,
    LaunchOptions: string,
    IsHidden: number,
    AllowDesktopConfig: number,
    AllowOverlay: number,
    OpenVR: number,
    Devkit: number,
    DevkitGameID: string,
    DevkitOverrideAppID: number,
    LastPlayTime: number,
    FlatpakAppID: string,
    sortas: string,
    tags: Record<never, unknown>
}

export interface SteamUserShortcutsDb {
    shortcuts: Record<string, SteamUserShortcut>;
}

export namespace SteamUtils {

    const USER_ID_BASELINE = "76561197960265728";
    const APP_SHORTCUT_MIN_ID = 2000000000;
    const APP_SHORTCUT_ID_RANGE = 2000000000;

    export function getSteamBinaryPath(): string {
        switch (process.platform) {
            case "linux": return AppConstants.STEAM_EXECUTABLE_LINUX;
            case "win32": return AppConstants.STEAM_EXECUTABLE_WINDOWS;
            default: throw new Error("getSteamBinaryPath: Unknown platform");
        }
    }

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

    export function loadUserShortcuts(steamUserId: string): SteamUserShortcutsDb | undefined {
        const shortcutFilePath = getShortcutsFileForUser(steamUserId);

        if (!shortcutFilePath) {
            return undefined;
        }

        if (!fs.existsSync(shortcutFilePath)) {
            return undefined;
        }

        return vdf.readVdf(fs.readFileSync(shortcutFilePath)) as unknown as SteamUserShortcutsDb;
    }

    export function updateUserShortcuts(steamUserId: string, config: SteamUserShortcutsDb): void {
        const shortcutFilePath = getShortcutsFileForUser(steamUserId);

        if (!shortcutFilePath) {
            return undefined;
        }

        // Back up existing shortcuts file
        const backupPath = `${shortcutFilePath}.${PathUtils.currentDateTimeAsFileName()}.bak`;
        if (fs.existsSync(shortcutFilePath)) {
            fs.moveSync(shortcutFilePath, backupPath);
        }

        try {
            // Update the shortcuts file
            fs.writeFileSync(shortcutFilePath, vdf.writeVdf(config as any));
        } catch (err) {
            // Restore the original shortcuts file
            if (fs.existsSync(backupPath)) {
                fs.moveSync(backupPath, shortcutFilePath);
            }

            throw err;
        }
    }

    export function getSteamUserdataDir(): string | undefined {
        if (process.platform === "linux") {
            return PathUtils.expandPath(path.join(AppConstants.STEAM_ROOT_LINUX, AppConstants.STEAM_USERDATA_DIR));
        } else if (process.platform === "win32") {
            return PathUtils.expandPath(path.join(AppConstants.STEAM_ROOT_PC, AppConstants.STEAM_USERDATA_DIR));
        } else {
            return undefined;
        }
    }

    export function getDataDirForUser(steamUserId: string): string | undefined {
        const userdataDir = getSteamUserdataDir();

        if (userdataDir) {
            return path.join(userdataDir, resolveSteamUserId32(steamUserId));
        }

        return undefined;
    }

    export function getConfigDirForUser(steamUserId: string): string | undefined {
        const userdataDir = getDataDirForUser(steamUserId);

        if (userdataDir) {
            return path.join(userdataDir, "config");
        }

        return undefined;
    }

    export function getShortcutsFileForUser(steamUserId: string): string | undefined {
        const userdataDir = getConfigDirForUser(steamUserId);

        if (userdataDir) {
            return path.join(userdataDir, "shortcuts.vdf");
        }

        return undefined;
    }

    export function getActiveSteamUserIds(): string[] {
        const userdataDir = getSteamUserdataDir();

        if (!userdataDir || !fs.existsSync(userdataDir)) {
            return [];
        }

        return fs.readdirSync(userdataDir).map((userId32) => {
            return resolveSteamUserId64(userId32);
        });
    }

    export function resolveSteamUserId32(steamUserId: string): string {
        if (steamUserId.length >= 16) {
            // Convert SteamId64 to SteamId32
            return (BigInt(steamUserId) - BigInt(USER_ID_BASELINE)).toString();
        } else {
            return steamUserId;
        }
    }

    export function resolveSteamUserId64(steamUserId: string): string {
        if (steamUserId.length >= 16) {
            return steamUserId;
        } else {
            // Convert SteamId32 to SteamId64
            return (BigInt(steamUserId) + BigInt(USER_ID_BASELINE)).toString();
        }
    }

    export function resolveGameId32(steamGameId: string): string {
        if (steamGameId.length >= 16) {
            return (BigInt(steamGameId) >> BigInt("32")).toString();
        } else {
            return steamGameId;
        }
    }

    export function resolveGameId64(steamGameId: string): string {
        if (steamGameId.length >= 16) {
            return steamGameId;
        } else {
            return (BigInt(steamGameId) << BigInt("32") | BigInt("0x02000000")).toString();
        }
    }

    export function generateAppShortcutId(): number {
        return APP_SHORTCUT_MIN_ID + Math.floor(Math.random() * APP_SHORTCUT_ID_RANGE);
    }
}