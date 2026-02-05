import { AppProfile } from "../models/app-profile";
import { GameAction } from "../models/game-action";
import { GamePluginProfileRef } from "../models/game-plugin-profile-ref";

export namespace ProfileUtils {

    export function getDefaultPluginType(pluginRef: GamePluginProfileRef): string | undefined {
        const [[, result]] = pluginRef.plugin.matchAll(/\.([^.]+)$/g) ?? [[undefined, undefined]];
        return result;
    }

    export function getPluginType(pluginRef: GamePluginProfileRef): string | undefined {
        if (pluginRef.promotedType) {
            return pluginRef.promotedType;
        } else {
            return getDefaultPluginType(pluginRef);
        }
    }

    export function getPluginTypeIndex(
        pluginRef: GamePluginProfileRef,
        pluginTypeOrder: string[]
    ): number | undefined {
        const refType = getPluginType(pluginRef);

        return refType ? pluginTypeOrder.indexOf(refType.toLowerCase()) : undefined;
    }

    export function isRelevantDefaultGameAction(profile: AppProfile, action: GameAction): boolean {
        // Hide default actions with same name as custom actions
        return !profile.customGameActions?.some(customAction => customAction.name === action.name);
    }

    export function getRelevantDefaultGameActions(profile: AppProfile): GameAction[] {
        return profile.defaultGameActions?.filter((defaultAction) => {
            return isRelevantDefaultGameAction(profile, defaultAction);
        });
    }

    export function findBestDefaultGameAction(profile: AppProfile): GameAction | undefined {
        return getRelevantDefaultGameActions(profile)[0];
    }
}