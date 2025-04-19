import type { GamePluginListType } from "./game-plugin-list-type";
import type { GameInstallation } from "./game-installation";

export interface GameDetails {
    title: string;
    bkgColor: string;
    fgColor: string;
    installations: GameInstallation[];
    gameBinary: string[];
    pluginFormats: string[];
    saveFormats: string[];
    requireExternalPlugins: boolean;
    pluginListType?: GamePluginListType;
    pinnedPlugins?: GameDetails.PinnedPlugin[];
    gameConfigFiles?: string[];
    scriptExtenders?: GameDetails.ScriptExtender[];
    resources?: GameDetails.Resources;
    archiveInvalidation?: GameDetails.ArchiveInvalidationConfig;
}

export interface ExportedGameDetails extends GameDetails {
    schemaVersion: number;
}

export namespace GameDetails {

    export type ArchiveInvalidationConfig = Record<string, string>;

    export interface ScriptExtender {
        name: string;
        binaries: string[];
        modPaths: string[];
    }

    export interface PinnedPlugin {
        plugin: string;
        required?: boolean;
    }
    export interface Resources {
        mods: Record<string, string>;
    }

    export function empty(title: string = ""): GameDetails {
        return {
            title,
            bkgColor: "",
            fgColor: "",
            installations: [],
            pluginFormats: [],
            saveFormats: [],
            requireExternalPlugins: false,
            gameBinary: []
        };
    }

    export function hasPluginListPath(details: GameDetails): boolean {
        return details.installations.some(installation => "pluginListPath" in installation);
    }
}