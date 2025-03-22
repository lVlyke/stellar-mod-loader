import { AppProfile } from "./app-profile";
import { GameDatabase } from "./game-database";

export interface AppSettingsUserCfg {
    activeProfile?: string | AppProfile.Description;
    pluginsEnabled: boolean;
    normalizePathCasing: boolean;
    modListColumns?: string[];
    verifyProfileOnStart: boolean;
    steamCompatDataRoot?: string;
    logPanelEnabled?: boolean;
    customGameDb?: GameDatabase;
}