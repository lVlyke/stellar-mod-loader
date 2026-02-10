import { Pipe, PipeTransform } from "@angular/core";
import { AppProfileFormFieldEntry, AppProfileFormFieldInput } from "../../models/app-profile-form-field";

function PROFILE_OVERRIDE_FIELDS({}: AppProfileFormFieldInput): Readonly<AppProfileFormFieldEntry[]> {
    return [
        { formId: "profilePathOverrides", groupTitle: "Profile Path Overrides", hint: "Override standard profile paths", fields: [
            { formId: "rootPathOverride", title: "Profile Root Path", path: true, required: false },
            { formId: "modsPathOverride", title: "Profile Mods Path", path: true, required: false },
            { formId: "savesPathOverride", title: "Profile Saves Path", path: true, required: false },
            { formId: "configPathOverride", title: "Profile Config Path", path: true, required: false },
            { formId: "backupsPathOverride", title: "Profile Backups Path", path: true, required: false },
        ] }
    ];
}

function STANDARD_FIELDS({
    platform,
    profileModel
}: AppProfileFormFieldInput): Readonly<AppProfileFormFieldEntry[]> {
    let steamId: string | undefined;
    if (profileModel?.gameInstallation?.steamId?.length) {
        steamId = profileModel.gameInstallation.steamId[0];
    }

    const result: AppProfileFormFieldEntry[] = [];

    if (platform === "linux") {
        result.push({
            formId: "protonPrefixDir",
            title: "Proton Prefix Directory",
            path: true,
            required: false,
            hint: "You can specify a custom Proton prefix directory to use instead of the game's default."
        });
    }

    if (!!steamId && !!profileModel?.manageSteamCompatSymlinks) {
        result.push({
            formId: "steamCustomGameId",
            title: "[DEPRECATED] Custom Steam Game ID",
            path: false,
            required: true,
            hint: "[NOTE: Deprecated, not recommended] The ID of a custom Steam game entry (i.e. for script extenders)."
        });
    }

    return result;
}

@Pipe({ name: "appProfileFields" })
export class AppProfileFieldsPipe implements PipeTransform {

    public transform(input: AppProfileFormFieldInput | null | undefined): Readonly<AppProfileFormFieldEntry[]> {
        let result: AppProfileFormFieldEntry[] = [];

        if (!input) {
            return result;
        }

        if (!input.baseProfileMode) {
            result = result.concat(STANDARD_FIELDS(input));
        }

        result = result.concat(PROFILE_OVERRIDE_FIELDS(input));
        return result;
    }
}
