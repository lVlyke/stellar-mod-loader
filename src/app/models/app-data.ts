import type { AppProfile } from "./app-profile";
import type { AppTheme } from "./app-theme";
import type { GameDatabase } from "./game-database";

export interface AppData {
    profiles: AppProfile.Description[];
    activeProfile?: AppProfile; // TODO - Change type to `AppProfile | AppBaseProfile`
    theme: AppTheme;
    gameDb: GameDatabase;
    pluginsEnabled: boolean;
    normalizePathCasing: boolean;
    verifyProfileOnStart: boolean;
    modListColumns?: string[];
    deployInProgress?: boolean;
    steamCompatDataRoot?: string;
    logPanelEnabled?: boolean;
    customGameDb?: GameDatabase;
}

export namespace AppData {

    export const DEFAULT_MOD_LIST_COLUMNS = [
        "enabled",
        "name",
        "order"
    ];

    export const DEFAULT_MOD_LIST_COLUMN_ORDER = [
        "enabled",
        "name",
        "updatedDate",
        "order"
    ];
}