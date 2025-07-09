import { cloneDeep, pick } from "es-toolkit";
import { find, uniqBy } from "es-toolkit/compat";
import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext } from "@ngxs/store";
import { AppProfile } from "../../models/app-profile";
import { ActiveProfileActions } from "./active-profile.actions";
import { ProfileUtils } from "../../util/profile-utils";
import { GamePluginProfileRef } from "../../models/game-plugin-profile-ref";
import { GameAction } from "../../models/game-action";
import { RelativeOrderedMap } from "../../util/relative-ordered-map";
import { log } from "../../util/logger";
import { LangUtils } from "../../util/lang-utils";
import { ModSection } from "../../models/mod-section";

@State<ActiveProfileState.Model>({
    name: "activeProfile",
    defaults: null,
    children: []
})
@Injectable()
export class ActiveProfileState {

    @Selector()
    public static getExternalFilesCache(state: ActiveProfileState.Model): AppProfile.ExternalFiles | undefined {
        return state?.externalFilesCache;
    }

    @Selector()
    public static getPlugins(state: ActiveProfileState.Model): GamePluginProfileRef[] | undefined {
        return state?.plugins;
    }

    @Selector()
    public static getActiveGameAction(state: ActiveProfileState.Model): GameAction | undefined {
        return state?.activeGameAction;
    }

    @Selector()
    public static isDeployed(state: ActiveProfileState.Model): boolean {
        return !!state?.deployed;
    }

    @Selector()
    public static isManageConfigFiles(state: ActiveProfileState.Model): boolean {
        return !!state?.manageConfigFiles;
    }

    @Selector()
    public static isManageSaveFiles(state: ActiveProfileState.Model): boolean {
        return !!state?.manageSaveFiles;
    }

    @Action(ActiveProfileActions.Lock)
    public lock(context: ActiveProfileState.Context, state: ActiveProfileActions.Lock): void {
        context.patchState(cloneDeep(state));
    }

    @Action(ActiveProfileActions.AddMod)
    public addMod(context: ActiveProfileState.Context, { root, name, mod }: ActiveProfileActions.AddMod): void {
        const state = cloneDeep(context.getState()!);

        if (root) {
            RelativeOrderedMap.insert(state.rootMods, name, mod);
        } else{
            RelativeOrderedMap.insert(state.mods, name, mod);
        }
        
        context.setState(state);
    }

    @Action(ActiveProfileActions.DeleteMod)
    public deleteMod(context: ActiveProfileState.Context, { root, name }: ActiveProfileActions.DeleteMod): void {
        const state = cloneDeep(context.getState()!);
        const modList = root ? state.rootMods : state.mods;
        const modSections = root ? state.rootModSections : state.modSections;
        const modIndex = RelativeOrderedMap.indexOf(modList, name);

        // Adjust any Section indicies as needed
        if (!!modSections && modIndex !== undefined) {
            for (const modSection of modSections) {
                if (modSection.modIndexBefore !== undefined && modSection.modIndexBefore >= modIndex) {
                    --modSection.modIndexBefore;
                }
            }
        }

        // Remove the mod
        RelativeOrderedMap.erase(modList, name);

        context.setState(state);
    }

    @Action(ActiveProfileActions.RenameMod)
    public renameMod(context: ActiveProfileState.Context, { root, curName, newName }: ActiveProfileActions.RenameMod): void {
        const state = cloneDeep(context.getState()!);
        const modList = root ? state.rootMods : state.mods;

        RelativeOrderedMap.forEach(modList, (mod, modName) => {
            RelativeOrderedMap.erase(modList, modName);

            if (mod) {
                // Rename the selected mod, preserving the prior load order
                RelativeOrderedMap.insert(modList, modName === curName ? newName : modName, mod);
            }
        });

        context.setState(state);
    }

    @Action(ActiveProfileActions.UpdateModVerification)
    public updateModVerification(
        context: ActiveProfileState.Context,
        { root, modName, verificationResult }: ActiveProfileActions.UpdateModVerification
    ): void {
        this._updateModVerifications(context, root, verificationResult ? { [modName]: verificationResult } : {});
    }

    @Action(ActiveProfileActions.UpdateModVerifications)
    public updateModVerifications(
        context: ActiveProfileState.Context,
        { root, modVerificationResults }: ActiveProfileActions.UpdateModVerifications
    ): void {
        this._updateModVerifications(context, root, modVerificationResults.results);
    }

    @Action(ActiveProfileActions.UpdateExternalFiles)
    public updateExternalFilesCache(
        context: ActiveProfileState.Context,
        state: ActiveProfileActions.UpdateExternalFiles
    ): void {
        context.patchState(state);
    }

    @Action(ActiveProfileActions.ReorderMods)
    public reorderMods(context: ActiveProfileState.Context, { root, modOrder }: ActiveProfileActions.ReorderMods): void {
        const state = cloneDeep(context.getState()!);
        const modList = root ? state.rootMods : state.mods;

        modOrder.forEach((modName) => {
            const mod = RelativeOrderedMap.get(modList, modName);

            RelativeOrderedMap.erase(modList, modName);

            if (mod) {
                RelativeOrderedMap.insert(modList, modName, mod);
            }
        });

        context.setState(state);
    }

    @Action(ActiveProfileActions.ReconcileModList)
    public reconcileModList(
        context: ActiveProfileState.Context,
        { mods }: ActiveProfileActions.ReconcileModList
    ): void {
        const MOD_LIST_KEYS = ["rootMods", "mods"] as const;
        const state = cloneDeep(context.getState()!);

        if (!!state.baseProfile) {
            MOD_LIST_KEYS.forEach((listKey) => {
                const profileMods = state[listKey];
                const baseProfileMods = state.baseProfile![listKey] ?? [];
                // Start with a copy of the base profile's mod list
                const mergedProfileMods: AppProfile.ModList = baseProfileMods.map(([modName, modRef]) => [modName, {
                    ...modRef,
                    baseProfile: state.baseProfile!.name
                }]);

                // Merge this profile's mods in relative to their previous order
                RelativeOrderedMap.forEach(profileMods, (existingMod, existingModName, existingModIndex) => {
                    if (!existingMod.baseProfile) {
                        if (existingModIndex === 0) {
                            RelativeOrderedMap.insertAt(mergedProfileMods, existingModName, existingMod, 0);
                        } else if (existingModIndex === profileMods.length - 1) {
                            RelativeOrderedMap.insert(mergedProfileMods, existingModName, existingMod);
                        } else {
                            const lastMod = RelativeOrderedMap.previous(profileMods, existingModName);
                            if (lastMod && RelativeOrderedMap.has(mergedProfileMods, lastMod[0])) {
                                RelativeOrderedMap.insertAfter(mergedProfileMods, existingModName, existingMod, lastMod[0]);
                            } else {
                                const nextMod = RelativeOrderedMap.next(profileMods, existingModName);
                                if (nextMod && RelativeOrderedMap.has(mergedProfileMods, nextMod[0])) {
                                    RelativeOrderedMap.insertBefore(mergedProfileMods, existingModName, existingMod, nextMod[0]);
                                } else {
                                    RelativeOrderedMap.insert(mergedProfileMods, existingModName, existingMod);
                                }
                            }
                        }
                    }
                });

                state[listKey] = mergedProfileMods;
            });

            // Add missing profile mods (this shouldn't normally be needed unless someone added mods manually)
            RelativeOrderedMap.forEach(mods, (externalMod, externalModName) => {
                if (!RelativeOrderedMap.has(state.mods, externalModName) && !RelativeOrderedMap.has(state.rootMods, externalModName)) {
                    log.warn("Missing mod found:", externalModName, " (Note: If this was a root mod it will be demoted to standard mod.)");
                    RelativeOrderedMap.insert(state.mods, externalModName, externalMod);
                }
            });
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.ReconcilePluginList)
    public reconcilePluginList(
        context: ActiveProfileState.Context,
        { plugins, pluginTypeOrder }: ActiveProfileActions.ReconcilePluginList
    ): void {
        const state = cloneDeep(context.getState()!);
        const modList = RelativeOrderedMap.entries(state.mods);

        // TODO - Scan root mods?

        // NOTE: This function assumes mod list has already been reconciled

        // BC:<v0.4.0
        if (!state.plugins) {
            state.plugins = [];
        }

        // Filter any plugins that are from disabled mods
        plugins = plugins.filter(plugin => plugin.modId === undefined || modList.find(([modId]) => plugin.modId === modId)?.[1].enabled);

        // Calculate available external plugins
        const externalPlugins = (state.manageExternalPlugins && state.externalFilesCache) ? state.externalFilesCache.pluginFiles.map((externalPluginFile) => ({
            modId: undefined,
            plugin: externalPluginFile,
            enabled: true
        })) : [];

        // Remove deleted external plugins and add missing external plugins
        let orderedPlugins = state.plugins
            .filter(plugin => plugin.modId !== undefined || externalPlugins.some(externalPlugin => externalPlugin.plugin === plugin.plugin))
            .concat(externalPlugins.filter(externalPlugin => !state.plugins.some(plugin => plugin.plugin === externalPlugin.plugin)));

        orderedPlugins = orderedPlugins
            .map((plugin) => {
                // Preserve previous plugin order while using latest plugin data and add new plugins
                let activePlugin = plugins.findLast(activePlugin => plugin.plugin === activePlugin.plugin);

                // Ensure external mods are preserved
                if (plugin.modId === undefined) {
                    activePlugin ??= plugin;
                }    

                // Preserve plugin enabled and promotion state of existing plugins
                return activePlugin ? Object.assign(activePlugin,
                    pick<GamePluginProfileRef, keyof GamePluginProfileRef>(plugin, ["enabled", "promotedType"])
                ) : undefined;
            })
            .filter((plugin): plugin is GamePluginProfileRef => !!plugin)
            // Add all remaining plugins that didn't exist previously
            .concat(plugins.filter(plugin => !orderedPlugins.some(activePlugin => plugin.plugin === activePlugin.plugin)))

        if (!!state.baseProfile) {
            const baseProfilePlugins = state.baseProfile.plugins ?? [];

            // Start with a copy of the base profile's plugins list
            let mergedPlugins = baseProfilePlugins.slice(0);

            // Add profile plugins
            orderedPlugins.forEach((activePlugin) => {
                const modEntry = activePlugin.modId !== undefined ? modList.find(([modId]) => activePlugin.modId === modId) : undefined;
                if (activePlugin.modId === undefined || (modEntry && !modEntry[1].baseProfile && modEntry[1].enabled)) {
                    const basePlugin = find(mergedPlugins, { plugin: activePlugin.plugin });

                    if (!basePlugin) {
                        // Add the missing plugin relative to its previous order
                        const oldPluginIndex = state.plugins.findIndex(oldPlugin => oldPlugin.plugin === activePlugin.plugin);
                        if (oldPluginIndex === 0) {
                            mergedPlugins = [activePlugin].concat(mergedPlugins);
                        } else if (oldPluginIndex === -1 || oldPluginIndex === state.plugins.length - 1) {
                            mergedPlugins.push(activePlugin);
                        } else {
                            const lastPlugin = state.plugins[oldPluginIndex - 1];
                            const lastPluginIndex = lastPlugin ? mergedPlugins.findIndex(plugin => plugin.plugin === lastPlugin.plugin) : -1;
                            if (lastPluginIndex !== -1) {
                                mergedPlugins.splice(lastPluginIndex + 1, 0, activePlugin);
                            } else {
                                const nextPlugin = state.plugins[oldPluginIndex + 1];
                                const nextPluginIndex = nextPlugin ? mergedPlugins.findIndex(plugin => plugin.plugin === nextPlugin.plugin) : -1;
                                if (nextPluginIndex !== -1) {
                                    mergedPlugins.splice(nextPluginIndex, 0, activePlugin);
                                } else {
                                    mergedPlugins.push(activePlugin);
                                }
                            }
                        }
                    } else if (activePlugin.modId !== undefined) {
                        // Update the modId of the plugin to the last mod in the load order
                        basePlugin.modId = activePlugin.modId;
                    }
                }
            });

            orderedPlugins = mergedPlugins;
        }

        // Remove duplicate plugins
        orderedPlugins = uniqBy(orderedPlugins, "plugin");

        // Sort plugins by type order (if required)
        if (pluginTypeOrder) {
            orderedPlugins = orderedPlugins.sort((aRef, bRef) => {
                const aIndex = ProfileUtils.getPluginTypeIndex(aRef, pluginTypeOrder!),
                      bIndex = ProfileUtils.getPluginTypeIndex(bRef, pluginTypeOrder!);

                if (aIndex !== undefined && bIndex !== undefined) {
                    return aIndex - bIndex;
                } else {
                    return 0;
                }
            });
        }

        state.plugins = orderedPlugins;
        context.setState(state);
    }

    @Action(ActiveProfileActions.UpdatePlugins)
    public updatePlugins(context: ActiveProfileState.Context, state: ActiveProfileActions.UpdatePlugins): void {
        context.patchState(cloneDeep(state));
    }

    @Action(ActiveProfileActions.UpdatePlugin)
    public updatePlugin(context: ActiveProfileState.Context, { plugin }: ActiveProfileActions.UpdatePlugin): void {
        const state = cloneDeep(context.getState()!);

        const existingPlugin = state.plugins.find((curPlugin) => curPlugin.plugin === plugin.plugin);
        if (existingPlugin) {
            Object.assign(existingPlugin, plugin);
        } else {
            state.plugins.push(plugin);
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.MoveModToSection)
    public moveModToSection(
        context: ActiveProfileState.Context,
        { root, modName, section, toTop }: ActiveProfileActions.MoveModToSection
    ): void {
        const state = cloneDeep(context.getState()!);
        const modList = root ? state.rootMods : state.mods;
        const modSections = (root ? state.rootModSections : state.modSections) ?? [];
        const modIndex = RelativeOrderedMap.indexOf(modList, modName);

        if (modIndex === undefined) {
            return;
        }

        if (!section) {
            // Find the current Section
            modSections.forEach((curSection) => {
                if (curSection.modIndexBefore !== undefined && curSection.modIndexBefore < modIndex) {
                    if (!section || modIndex - curSection.modIndexBefore < modIndex - section.modIndexBefore!) {
                        section = curSection;
                    }
                }
            });
        }

        const [modRef] = modList.splice(modIndex, 1);

        if (toTop) {
            let topIndex = 0;
            if (section) {
                topIndex = section.modIndexBefore !== undefined ? section.modIndexBefore + 1 : 0;
            }

            // Move mod to top of section
            modList.splice(topIndex, 0, modRef);
        } else {
            // Get next section
            section = section ? this._getNextModSection(state, root, section) : undefined;

            let bottomIndex = modList.length;
            if (section) {
                bottomIndex = section.modIndexBefore ?? 0;
            }

            // Move mod to bottom of section
            modList.splice(bottomIndex, 0, modRef);
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.ReconcileModSections)
    public reconcileModSections(
        context: ActiveProfileState.Context,
        {}: ActiveProfileActions.ReconcileModSections
    ): void {
        const SECTION_LIST_KEYS = ["rootModSections", "modSections"] as const;
        const MOD_LIST_KEYS = ["rootMods", "mods"] as const;
        const state = cloneDeep(context.getState()!);

        if (!!state.baseProfile) {
            SECTION_LIST_KEYS.forEach((listKey, listKeyIndex) => {
                const modListKey = MOD_LIST_KEYS[listKeyIndex];
                const profileSections = state[listKey] ?? [];
                const profileMods = state[modListKey] ?? [];
                const baseProfileSections = state.baseProfile![listKey] ?? [];
                const baseProfileMods = state.baseProfile![modListKey] ?? [];

                // Start with a copy of the profile's section list
                const mergedProfileSections = profileSections.slice();

                // Merge in the base profile's sections accounting for shifted indices in this profile's list
                baseProfileSections.forEach((baseSection) => {
                    const existingSection = find(mergedProfileSections, { name: baseSection.name });
                    if (!existingSection) {
                        // Update the section index based on the new index of the mod in this profile
                        let modIndexBefore = baseSection.modIndexBefore;
                        if (modIndexBefore !== undefined) {
                            const baseModBefore = baseProfileMods[modIndexBefore];
                            if (!!baseModBefore) {
                                modIndexBefore = RelativeOrderedMap.indexOf(profileMods, baseModBefore[0]);
                            }
                        }

                        mergedProfileSections.push({
                            ...baseSection,
                            modIndexBefore
                        });
                    }
                });

                state[listKey] = mergedProfileSections;
            });
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.UpdateModSection)
    public updateModSection(
        context: ActiveProfileState.Context,
        { oldSection, newSection, root }: ActiveProfileActions.UpdateModSection
    ): void {
        const state = cloneDeep(context.getState()!);
        state.rootModSections ??= [];
        state.modSections ??= [];
        const modSections = root ? state.rootModSections! : state.modSections!;
        const existingSection = find(modSections, { name: (oldSection ?? newSection).name });

        if (existingSection) {
            Object.assign(existingSection, newSection);
        } else {
            modSections.push(newSection);
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.ReorderModSection)
    public reorderModSection(
        context: ActiveProfileState.Context,
        { section, root, modIndexBefore }: ActiveProfileActions.ReorderModSection
    ): void {
        const state = cloneDeep(context.getState()!);
        const modSections = (root ? state.rootModSections : state.modSections) ?? [];
        const existingSection = modSections.find(curSection => LangUtils.isEqual(section, curSection));

        if (!!existingSection) {
            existingSection.modIndexBefore = modIndexBefore;
            context.setState(state);
        }
    }

    @Action(ActiveProfileActions.DeleteModSection)
    public deleteModSection(
        context: ActiveProfileState.Context,
        { section, root }: ActiveProfileActions.DeleteModSection
    ): void {
        const state = cloneDeep(context.getState()!);
        const modSections = (root ? state.rootModSections : state.modSections) ?? [];
        const existingSectionIndex = modSections.findIndex(curSection => LangUtils.isEqual(section, curSection));

        if (existingSectionIndex !== undefined) {
            modSections.splice(existingSectionIndex, 1);
            context.setState(state);
        }
    }

    @Action(ActiveProfileActions.UpdateModsInSection)
    public updateModsInSection(
        context: ActiveProfileState.Context,
        { section, root, enabled }: ActiveProfileActions.UpdateModsInSection
    ): void {
        const state = cloneDeep(context.getState()!);
        const modList = root ? state.rootMods : state.mods;
        const startIndex = section.modIndexBefore !== undefined ? section.modIndexBefore + 1 : 0;
        const nextSection = this._getNextModSection(state, root, section);

        // Update the enablement of all mods in this section
        const endIndex = nextSection?.modIndexBefore ?? modList.length - 1;
        for (let i = startIndex; i < endIndex + 1; ++i) {
            const curModRef = modList[i][1];
            if (!curModRef.baseProfile) {
                curModRef.enabled = enabled;
            }
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.AddCustomGameAction)
    public addCustomGameAction(context: ActiveProfileState.Context, { gameAction }: ActiveProfileActions.AddCustomGameAction): void {
        const state = cloneDeep(context.getState()!);

        state.customGameActions ??= [];
        state.customGameActions.push(gameAction);

        context.setState(state);
    }

    @Action(ActiveProfileActions.EditCustomGameAction)
    public editCustomGameAction(context: ActiveProfileState.Context, { gameActionIndex, gameAction }: ActiveProfileActions.EditCustomGameAction): void {
        const state = cloneDeep(context.getState()!);

        if (state.customGameActions && gameActionIndex < state.customGameActions.length) {
            state.customGameActions[gameActionIndex] = gameAction;
        } else {
            log.error("Tried to edit game action at invalid index", gameActionIndex);
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.RemoveCustomGameAction)
    public removeCustomGameAction(
        context: ActiveProfileState.Context,
        { gameActionIndex }: ActiveProfileActions.RemoveCustomGameAction
    ): void {
        const state = cloneDeep(context.getState()!);

        if (state.customGameActions && gameActionIndex < state.customGameActions.length) {
            state.customGameActions.splice(gameActionIndex, 1);
        } else {
            log.error("Tried to remove game action at invalid index", gameActionIndex);
        }

        context.setState(state);
    }

    @Action(ActiveProfileActions.UpdateDefaultGameActions)
    public updateDefaultGameActions(
        context: ActiveProfileState.Context,
        { gameActions }: ActiveProfileActions.UpdateDefaultGameActions
    ): void {
        context.patchState({
            defaultGameActions: gameActions
        });
    }

    @Action(ActiveProfileActions.setDeployed)
    public setDeployed(context: ActiveProfileState.Context, state: ActiveProfileActions.DeployedAction): void {
        context.patchState(state);
    }

    @Action(ActiveProfileActions.setBaseProfile)
    public setBaseProfile(context: ActiveProfileState.Context, state: ActiveProfileActions.BaseProfileAction): void {
        context.patchState(state);
    }

    @Action(ActiveProfileActions.manageExternalPlugins)
    public manageExternalPlugins(context: ActiveProfileState.Context, state: ActiveProfileActions.ManageExternalPluginsAction): void {
        context.patchState(state);
    }

    @Action(ActiveProfileActions.setActiveGameAction)
    public setActiveGameAction(context: ActiveProfileState.Context, state: ActiveProfileActions.ActiveGameActionAction): void {
        context.patchState(state);
    }

    @Action(ActiveProfileActions.setInvalid)
    public setInvalid(context: ActiveProfileState.Context, state: ActiveProfileActions.InvalidAction): void {
        context.patchState(state);
    }

    @Action(ActiveProfileActions.setCalculateModOverwriteFiles)
    public setCalculateModOverwriteFiles(context: ActiveProfileState.Context, state: ActiveProfileActions.CalculateModOverwriteFilesAction): void {
        context.patchState(state);
    }

    private _getNextModSection(
        state: AppProfile,
        root: boolean,
        section: ModSection
    ): ModSection | undefined {
        const modSections = (root ? state.rootModSections : state.modSections) ?? [];
        const startIndex = section.modIndexBefore !== undefined ? section.modIndexBefore + 1 : 0;

        // Find the next chronological Section
        let nextSection: ModSection | undefined;
        modSections.forEach((curSection) => {
            if (curSection.modIndexBefore !== undefined && curSection.modIndexBefore > startIndex) {
                if (!nextSection || curSection.modIndexBefore < nextSection.modIndexBefore!) {
                    nextSection = curSection;
                }
            }
        });

        return nextSection;
    }

    private _updateModVerifications(
        context: ActiveProfileState.Context,
        root: boolean,
        modVerificationResults: AppProfile.VerificationResultRecord
    ): void {
        const state = cloneDeep(context.getState()!);
        const modList = root ? state.rootMods : state.mods;

        Object.entries(modVerificationResults).forEach(([modName, verificationResult]) => {
            const mod = RelativeOrderedMap.get(modList, modName);

            if (!!mod) {
                if ("results" in verificationResult) {
                    // TODO - Should never happen
                } else if (verificationResult?.error) {
                    mod.verificationError = verificationResult;
                } else {
                    delete mod.verificationError;
                }
            }
        });

        context.setState(state);
    }
}

export namespace ActiveProfileState {

    export type Model = AppProfile | null;

    export type Context = StateContext<Model>;
}