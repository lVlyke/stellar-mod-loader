import { NgForm } from "@angular/forms";
import { AppProfile } from "./app-profile";
import { GameDetails } from "./game-details";
import { AppPlatform } from "./app-platform";

export interface AppProfileFormField<T = AppProfile> {
    formId: keyof T;
    title: string;
    required: boolean;
    path: boolean;
    readonly?: boolean;
    autofocus?: boolean;
    hint?: string;
    fileTypes?: string[];
    linkable?: boolean;
    linked?: boolean;
    linkFn?: (field: AppProfileFormField<T>) => void;
}

export interface AppProfileFormFieldGroup<
    T = AppProfile,
    Id extends string = string
> {
    formId: Id;
    groupTitle: string;
    fields: AppProfileFormField<T>[];
    hint?: string;
}

export type AppProfileFormFieldEntry<
    T = AppProfile,
    Id extends string = string
> = AppProfileFormField<T> | AppProfileFormFieldGroup<T, Id>;

export interface AppProfileFormFieldInput {
    platform: AppPlatform;
    gameDetails: GameDetails;
    baseProfileMode: boolean;
    profileModel?: Partial<AppProfile.Form>;
    form: NgForm;
    modLinkModeSupported: boolean;
    configLinkModeSupported: boolean;
    autofocusFieldId?: string;
}

export function isProfileFormFieldGroup<T, Id extends string = string>(
    fieldEntry: AppProfileFormFieldEntry<T>
): fieldEntry is AppProfileFormFieldGroup<T, Id> {
    return "groupTitle" in fieldEntry;
}
