import { ModProfileRef } from "../../models/mod-profile-ref";
import { AppProfile } from "../../models/app-profile";
import { BasicAction } from "../basic-action";
import { GamePluginProfileRef } from "../../models/game-plugin-profile-ref";
import { GameAction } from "../../models/game-action";
import { ModSection } from "../../models/mod-section";

export namespace ActiveProfileActions {

    function createBasicAction<K extends keyof AppProfile>(
        property: K,
        action: string
    ): BasicAction.Constructor<AppProfile, K> {
        return BasicAction.create<AppProfile, K>(
            "project",
            action,
            property
        );
    }

    function createUpdateAction<K extends keyof AppProfile>(property: K): BasicAction.Constructor<AppProfile, K> {
        return createBasicAction(property, "update");
    }

    export type DeployedAction = BasicAction<AppProfile, "deployed">;
    export type ManageExternalPluginsAction = BasicAction<AppProfile, "manageExternalPlugins">;
    export type BaseProfileAction = BasicAction<AppProfile, "baseProfile">;
    export type CustomGameActionsAction = BasicAction<AppProfile, "customGameActions">;
    export type ActiveGameActionAction = BasicAction<AppProfile, "activeGameAction">;
    export type InvalidAction = BasicAction<AppProfile, "invalid">;
    export type CalculateModOverwriteFilesAction = BasicAction<AppProfile, "calculateModOverwriteFiles">;

    export const setDeployed = createUpdateAction("deployed");
    export const setBaseProfile = createUpdateAction("baseProfile");
    export const manageExternalPlugins = createUpdateAction("manageExternalPlugins");
    export const setActiveGameAction = createUpdateAction("activeGameAction");
    export const setInvalid = createUpdateAction("invalid");
    export const setCalculateModOverwriteFiles = createUpdateAction("calculateModOverwriteFiles");

    export class AddMod {
        public static readonly type = `[activeProfile] add mod`;

        constructor(
            public root: boolean,
            public name: string,
            public mod: ModProfileRef
        ) {}
    }

    export class DeleteMod {
        public static readonly type = `[activeProfile] delete mod`;

        constructor(
            public root: boolean,
            public name: string
        ) {}
    }

    export class RenameMod {
        public static readonly type = `[activeProfile] rename mod`;

        constructor(
            public root: boolean,
            public curName: string,
            public newName: string
        ) {}
    }

    export class UpdateModVerification {
        public static readonly type = `[activeProfile] update mod verification`;

        constructor(
            public root: boolean,
            public modName: string,
            public verificationResult?: AppProfile.VerificationResult
        ) {}
    }

    export class UpdateModVerifications {
        public static readonly type = `[activeProfile] update mod verifications`;

        constructor(
            public root: boolean,
            public modVerificationResults: AppProfile.CollectedVerificationResult
        ) {}
    }

    export class UpdateExternalFiles {
        public static readonly type = `[activeProfile] update external files`;

        constructor(
            public externalFilesCache: AppProfile.ExternalFiles
        ) {}
    }

    export class ReorderMods {
        public static readonly type = `[activeProfile] reorder mods`;

        constructor(
            public root: boolean,
            public modOrder: string[]
        ) {}
    }

    export class ReconcileModList {
        public static readonly type = `[activeProfile] reconcile mod list`;

        constructor(
            public mods: AppProfile.ModList
        ) {}
    }

    export class ReconcilePluginList {
        public static readonly type = `[activeProfile] reconcile plugin list`;

        constructor(
            public plugins: GamePluginProfileRef[],
            public pluginTypeOrder?: string[]
        ) {}
    }

    export class UpdatePlugins {
        public static readonly type = `[activeProfile] update plugins`;

        constructor(
            public plugins: GamePluginProfileRef[]
        ) {}
    }

    export class UpdatePlugin {
        public static readonly type = `[activeProfile] update plugin`;

        constructor(
            public plugin: GamePluginProfileRef
        ) {}
    }

    export class AddCustomGameAction {
        public static readonly type = `[activeProfile] add custom game action`;

        constructor(
            public gameAction: GameAction
        ) {}
    }

    export class EditCustomGameAction {
        public static readonly type = `[activeProfile] edit custom game action`;

        constructor(
            public gameActionIndex: number,
            public gameAction: GameAction
        ) {}
    }

    export class RemoveCustomGameAction {
        public static readonly type = `[activeProfile] remove custom game action`;

        constructor(
            public gameActionIndex: number
        ) {}
    }

    export class UpdateDefaultGameActions {
        public static readonly type = `[activeProfile] update default game actions`;

        constructor(
            public gameActions: GameAction[]
        ) {}
    }

    export class MoveModToSection {
        public static readonly type = `[activeProfile] move mod to section`;

        constructor(
            public root: boolean,
            public modName: string,
            public section?: ModSection,
            public toTop?: boolean
        ) {}
    }

    export class UpdateModSection {
        public static readonly type = `[activeProfile] update mod section`;

        constructor(
            public root: boolean,
            public newSection: ModSection,
            public oldSection?: ModSection
        ) {}
    }

    export class ReorderModSection {
        public static readonly type = `[activeProfile] reorder mod section`;

        constructor(
            public root: boolean,
            public section: ModSection,
            public modIndexBefore?: number
        ) {}
    }

    export class DeleteModSection {
        public static readonly type = `[activeProfile] delete mod section`;

        constructor(
            public root: boolean,
            public section: ModSection
        ) {}
    }

    export class UpdateModsInSection {
        public static readonly type = `[activeProfile] update mods in section`;

        constructor(
            public root: boolean,
            public section: ModSection,
            public enabled: boolean
        ) {}
    }

    export class ReconcileModSections {
        public static readonly type = `[activeProfile] reconcile mod sections`;
    }

    export class Lock {
        public static readonly type = `[activeProfile] lock`;

        constructor(
            public locked: boolean
        ) {}
    }
}