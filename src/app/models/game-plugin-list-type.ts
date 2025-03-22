export type GamePluginListType = "Default" | "CreationEngine" | "Gamebryo" | "NetImmerse";

export namespace GamePluginListType {

    export function values(): GamePluginListType[] {
        return [
            "Default",
            "CreationEngine",
            "Gamebryo",
            "NetImmerse"
        ];
    }
}