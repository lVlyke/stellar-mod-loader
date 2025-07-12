import type Electron from "electron";
import type { AppResource } from "../app/models/app-resource";

const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");
const os = require("os") as typeof import("os");
const { app, nativeImage } = require("electron") as typeof Electron;

export namespace AppConstants {
    
    export const DEBUG_MODE = !app.isPackaged;
    export const ELECTRON_DIR = __dirname;
    export const APP_DIR = path.join(ELECTRON_DIR, "..");
    export const BROWSER_DIR = path.join(APP_DIR, "browser");
    export const BUILD_DATE_FILE = path.join(APP_DIR, "lastbuild.txt");
    export const PRELOAD_SCRIPT = path.join(ELECTRON_DIR, "scripts.js");

    export const APP_NAME = "Stellar Mod Loader";
    export const APP_SHORT_NAME = "Stellar";
    export const APP_SETTINGS_FILE = "settings.json";
    export const APP_PROFILES_DIR = "profiles";
    export const APP_PACKAGE_FILE = path.join(APP_DIR, "package.json");
    export const APP_DEPS_INFO_FILE = path.join(APP_DIR, "3rdpartylicenses.json");
    export const APP_DEPS_LICENSES_FILE = path.join(BROWSER_DIR, "3rdpartylicenses.txt");
    export const APP_ELECTRON_DEPS_LICENSES_FILE = path.join(ELECTRON_DIR, "3rdpartylicenses.txt");
    export const APP_ICON_IMG = nativeImage.createFromPath(path.join(BROWSER_DIR, "favicon.png"));
    export const APP_PACKAGE = ((): { name: string; version: string; repository: string; } => {
        try {
            return fs.readJSONSync(APP_PACKAGE_FILE, { encoding: "utf-8" });
        } catch (err) {
            return { name: APP_NAME, version: "master", repository: "" };
        }
    })();
    export const APP_VERSION = APP_PACKAGE.version;
    export const APP_RESOURCES: Record<AppResource, string> = {
        "readme_offline": `file://${process.cwd()}/README.md`,
        "readme_online": `${APP_PACKAGE.repository}/blob/${APP_VERSION}/README.md`,
        "latest_release": `${APP_PACKAGE.repository}/releases/latest`,
        "license": `file://${process.cwd()}/LICENSE`,
        "homepage": APP_PACKAGE.repository,
        "issues": `${APP_PACKAGE.repository}/issues`,
        "paypal_donation": "https://paypal.me/lVlyke",
        "7zip_home": "https://www.7-zip.org/"
    };
    export const APP_TMP_DIR = path.resolve(path.join(os.tmpdir(), "SML"));
    export const GAME_SCHEMA_VERSION = 1.1;
    export const GAME_DB_FILE = path.join(APP_DIR, "game-db.json");
    export const GAME_RESOURCES_DIR = path.join(APP_DIR, "resources");
    export const PROFILE_SETTINGS_FILE = "profile.json";
    export const PROFILE_METADATA_FILE = ".sml.json";
    export const PROFILE_MODS_DIR = "mods";
    export const PROFILE_CONFIG_DIR = "config";
    export const PROFILE_SAVE_DIR = "save";
    export const PROFILE_BACKUPS_DIR = "backups";
    export const PROFILE_BACKUPS_MOD_ORDER_DIR = "modorder";
    export const PROFILE_BACKUPS_PLUGINS_DIR = "plugins";
    export const PROFILE_BACKUPS_CONFIG_DIR = "config";
    export const PROFILE_MODS_STAGING_DIR = "_tmp";
    export const PROFILE_PATH_CASE_NORMALIZATION_TEST_FILE = ".sml_pcn_test";
    export const DEPLOY_EXT_BACKUP_DIR = ".sml.bak";
    export const STEAM_DEFAULT_COMPAT_DATA_ROOT = "~/.local/share/Steam/steamapps/compatdata";
    export const STEAM_COMPAT_STEAMUSER_DIR = "pfx/drive_c/users/steamuser";
}