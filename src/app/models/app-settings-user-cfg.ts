import { AppProfile } from "./app-profile";
import { GameDatabase } from "./game-database";

export interface AppSettingsUserCfg {
    activeProfile?: string | AppProfile.Description;
    pluginsEnabled: boolean;
    modListColumns?: string[];
    verifyProfileOnStart: boolean;
    checkLatestVersionOnStart?: boolean;
    steamCompatDataRoot?: string;
    logPanelEnabled?: boolean;
    customGameDb?: GameDatabase;
    lastSteamUserId?: string;

    /** @deprecated */
    normalizePathCasing?: boolean;
}