export type GameActionType = "script" | "steam_app";

export interface GameAction {
    name: string;
    actionType: GameActionType;
    actionData: string;
    environment?: GameAction.EnvironmentVariable[];
    requiresSteam?: boolean;
}

export namespace GameAction {

    export interface EnvironmentVariable {
        key: string;
        value: string;
        enabled: boolean;
    }
}

export namespace GameActionType {

    export const SCRIPT: GameActionType = "script";
    export const STEAM_APP: GameActionType = "steam_app";
}