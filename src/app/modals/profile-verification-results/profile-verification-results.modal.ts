import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_SNACK_BAR_DATA, MatSnackBarModule, MatSnackBarRef } from "@angular/material/snack-bar";
import { AsyncPipe } from "@angular/common";
import { Store } from "@ngxs/store";
import { Observable } from "rxjs";
import { AppState } from "../../state";
import { log } from "../../util/logger";
import { LangUtils } from "../../util/lang-utils";
import { BaseComponent } from "../../core/base-component";
import { AppProfile } from "../../models/app-profile";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { GameInstallation } from "../../models/game-installation";

@Component({
    templateUrl: "./profile-verification-results.modal.html",
    styleUrls: ["./profile-verification-results.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,

        MatButtonModule,
        MatSnackBarModule
    ]
})
export class AppProfileVerificationResultsModal extends BaseComponent {

    private static readonly PROFILE_VERIFICATION_ERROR_DESCS: Record<keyof AppProfile | keyof GameInstallation, string> = {
        name: "Invalid profile name",
        gameId: "Invalid Game ID",
        invalid: "Invalid",
        mods: "Invalid or missing mod files",
        rootMods: "Invalid or missing mod files",
        plugins: "Invalid plugins",
        rootPathOverride: "Invalid Profile Root directory",
        modsPathOverride: "Invalid Profile Mods directory",
        configPathOverride: "Invalid Profile Config directory",
        savesPathOverride: "Invalid Profile Saves directory",
        backupsPathOverride: "Invalid Profile Backups directory",
        deployed: "Invalid deployment state",
        locked: "Invalid locked state",
        gameInstallation: "Invalid Game Installation",
        steamId: "Invalid Steam Game ID",
        rootDir: "Invalid Game Root directory",
        modDir: "Invalid Game Data directory",
        pluginListPath: "Invalid Plugin List path",
        configFilePath: "Invalid Config File path",
        saveFolderPath: "Invalid Save Folder path",
        steamCustomGameId: "Invalid Steam Game ID",
        manageExternalPlugins: "Invalid external plugin management state",
        manageConfigFiles: "Invalid Config File Management state",
        manageSaveFiles: "Invalid Save File Management state",
        manageSteamCompatSymlinks: "Invalid Steam Compat Symlink Management state",
        modLinkMode: "Invalid Mod Link Mode state",
        configLinkMode: "Invalid Config Link Mode state",
        externalFilesCache: "Invalid external files",
        baseProfile: "Invalid Base Profile",
        defaultGameActions: "Invalid default game actions",
        customGameActions: "Invalid custom game actions",
        activeGameAction: "Invalid active game action",
        rootModSections: "Invalid root mod section",
        modSections: "Invalid mod section"
    };

    private static readonly VERIFICATION_ERROR_DESCS: Record<string, string> = {
        ...AppProfileVerificationResultsModal.PROFILE_VERIFICATION_ERROR_DESCS
    };

    private static readonly BLACKLISTED_ERROR_KEYS: Array<string> = [];

    public readonly isLogPanelEnabled$: Observable<boolean>;

    protected readonly errors: string[];

    constructor(
        cdRef: ChangeDetectorRef,
        store: Store,
        protected readonly snackBarRef: MatSnackBarRef<AppProfileVerificationResultsModal>,
        protected readonly appManager: AppStateBehaviorManager,
        @Inject(MAT_SNACK_BAR_DATA) verificationResults: AppProfile.VerificationResultRecord<string>
    ) {
        super({ cdRef });

        this.isLogPanelEnabled$ = store.select(AppState.isLogPanelEnabled);
        this.errors = this.collectErrors(verificationResults);
    }

    private collectErrors<K extends string>(results: AppProfile.VerificationResultRecord<K>): string[] {
        return LangUtils.entries(results).reduce<string[]>((errors, [propertyKey, verificationResult]) => {
            if (!AppProfileVerificationResultsModal.BLACKLISTED_ERROR_KEYS.includes(propertyKey)) {
                if ("results" in verificationResult) {
                    errors.push(...this.collectErrors(verificationResult.results));
                } else {
                    const errorText = this.mapVerificationResultToError(propertyKey, verificationResult);

                    if (errorText && !errors.includes(errorText)) {
                        log.error(`Profile verification error:`, `"${propertyKey}"`, errorText);
                        errors.push(errorText);
                    }
                }
            }

            return errors;
        }, []);
    }

    private mapVerificationResultToError(propertyName: string, result: AppProfile.VerificationResult): string | undefined {
        if (result.error) {
            return this.getErrorText(propertyName, result);
        }

        return undefined;
    }

    private getErrorText(propertyName: string, result: AppProfile.VerificationResult): string {
        if (!!result.reason) {
            return result.reason;
        } else {
            return AppProfileVerificationResultsModal.VERIFICATION_ERROR_DESCS[propertyName as keyof AppProfile] ?? "Error";
        }
    }
}
