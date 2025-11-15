import { BasicAction } from "./basic-action";
import { AppData } from "../models/app-data";
import { AppProfile } from "../models/app-profile";
import { AppSettingsUserCfg } from "../models/app-settings-user-cfg";
import { GameDetails } from "../models/game-details";
import { GameId } from "../models/game-id";

export namespace AppActions {

    function createBasicAction<K extends keyof AppData>(property: K, action: string): BasicAction.Constructor<AppData, K> {
        return BasicAction.create<AppData, K>(
            "app",
            action,
            property
        );
    }

    function createUpdateAction<K extends keyof AppData>(property: K): BasicAction.Constructor<AppData, K> {
        return createBasicAction(property, "update");
    }

    export type ActiveProfileAction = BasicAction<AppData, "activeProfile">;
    export type DeployInProgressAction = BasicAction<AppData, "deployInProgress">;
    export type PluginsEnabledAction = BasicAction<AppData, "pluginsEnabled">;
    export type VerifyProfileOnStartAction = BasicAction<AppData, "verifyProfileOnStart">;
    export type GameDbAction = BasicAction<AppData, "gameDb">;
    export type ModListColumnsAction = BasicAction<AppData, "modListColumns">;
    export type LastSteamUserIdAction = BasicAction<AppData, "lastSteamUserId">;

    export const updateActiveProfile = createUpdateAction("activeProfile");
    export const setDeployInProgress = createUpdateAction("deployInProgress");
    export const setPluginsEnabled = createUpdateAction("pluginsEnabled");
    export const setVerifyProfileOnStart = createUpdateAction("verifyProfileOnStart");
    export const updateGameDb = createUpdateAction("gameDb");
    export const updateModListColumns = createUpdateAction("modListColumns");
    export const updateLastSteamUserId = createUpdateAction("lastSteamUserId");

    export class UpdateSettings {
        public static readonly type = `[app] update settings`;

        constructor(
            public settings: Partial<AppData>
        ) {}
    }

    export class UpdateSettingsFromUserCfg {
        public static readonly type = `[app] update from user cfg`;

        constructor(
            public settings: Partial<AppSettingsUserCfg>
        ) {}
    }

    export class SetProfiles {
        public static readonly type = `[app] set profiles`;

        constructor(
            public profiles?: AppProfile.Description[]
        ) {}
    }

    export class AddProfile {
        public static readonly type = `[app] add profile`;

        constructor(
            public profile: AppProfile.Description
        ) {}
    }

    export class DeleteProfile {
        public static readonly type = `[app] delete profile`;

        constructor(
            public profile: AppProfile.Description
        ) {}
    }

    export class ToggleModListColumn {
        public static readonly type = `[app] toggle mod list column`;

        constructor(
            public column: string
        ) {}
    }

    export class ToggleLogPanel {
        public static readonly type = `[app] toggle log panel`;

        constructor(
            public enabled?: boolean
        ) {}
    }

    export class ResetModListColumns {
        public static readonly type = `[app] reset mod list columns`;
    }

    export class UpdateCustomGame {
        public static readonly type = `[app] update custom game`;

        constructor(
            public gameId: GameId,
            public gameDetails: GameDetails
        ) {}
    }

    export class DeleteCustomGame {
        public static readonly type = `[app] delete custom game`;

        constructor(
            public gameId: GameId
        ) {}
    }
}