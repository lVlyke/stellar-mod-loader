import { cloneDeep, merge, toMerged } from "es-toolkit";
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, ViewChild } from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { AbstractControl, NgForm, ValidationErrors, FormsModule } from "@angular/forms";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatIcon } from "@angular/material/icon";
import { MatIconButton } from "@angular/material/button";
import { MatTooltip } from "@angular/material/tooltip";
import { MatFormField, MatLabel, MatHint, MatSuffix } from "@angular/material/form-field";
import { MatSelect, MatSelectTrigger } from "@angular/material/select";
import { MatOption } from "@angular/material/core";
import { MatInput } from "@angular/material/input";
import { MatExpansionPanel, MatExpansionPanelHeader } from "@angular/material/expansion";
import {
    AsyncState,
    ComponentState,
    ComponentStateRef,
    DeclareState,
    ManagedBehaviorSubject,
    ManagedSubject
} from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { combineLatest, EMPTY, forkJoin, Observable, of } from "rxjs";
import {
    catchError,
    defaultIfEmpty,
    delay,
    distinctUntilChanged,
    filter,
    finalize,
    map,
    mergeMap,
    startWith,
    switchMap,
    take,
    withLatestFrom
} from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { AppProfile } from "../../models/app-profile";
import { ElectronUtils } from "../../util/electron-utils";
import { concatJoin, filterDefined, filterTrue, runOnce } from "../../core/operators";
import { ProfileManager } from "../../services/profile-manager";
import { AppState } from "../../state";
import { GameDatabase } from "../../models/game-database";
import { GameId } from "../../models/game-id";
import { DialogManager } from "../../services/dialog-manager";
import { LangUtils } from "../../util/lang-utils";
import { AppProfileFieldsPipe } from "./profile-fields.pipe";
import { AppDialogs } from "../../services/app-dialogs";
import { AppSendElectronMsgPipe } from "../../pipes/send-electron-msg.pipe";
import { AppGameConfigFilesFoundPipe } from "../../pipes/game-config-files-found.pipe";
import { AppGameBadgeComponent } from "../game-badge/game-badge.component";
import { GameInstallation } from "../../models/game-installation";
import {
    AppProfileFormFieldEntry,
    AppProfileFormFieldGroup,
    AppProfileFormFieldInput,
    isProfileFormFieldGroup
} from "../../models/app-profile-form-field";
import { AppProfileFormFieldComponent } from "../profile-form-field";
import { AppGameInstallSettingsComponent } from "../game-install-settings";
import { GameDetails } from "../../models/game-details";

@Component({
    selector: "app-profile-settings",
    templateUrl: "./profile-settings.component.html",
    styleUrls: ["./profile-settings.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        FormsModule,

        MatCheckbox,
        MatIcon,
        MatIconButton,
        MatTooltip,
        MatFormField,
        MatLabel,
        MatSelect,
        MatSelectTrigger,
        MatOption,
        MatInput,
        MatHint,
        MatSuffix,
        MatExpansionPanel,
        MatExpansionPanelHeader,
        
        AppGameBadgeComponent,
        AppProfileFormFieldComponent,
        AppGameInstallSettingsComponent,
        AppSendElectronMsgPipe,
        AppGameConfigFilesFoundPipe,
        AppProfileFieldsPipe
    ],
    providers: [
        ComponentState.create(AppProfileSettingsComponent),
    ]
})
export class AppProfileSettingsComponent extends BaseComponent {

    public readonly GameId = GameId;
    public readonly fieldInput$ = new ManagedBehaviorSubject<AppProfileFormFieldInput | null>(this, null);
    public readonly formModel$ = new ManagedBehaviorSubject<Partial<AppProfile.Form>>(this, {});
    public readonly onFormSubmit$ = new ManagedSubject<AppProfile>(this);
    public readonly onFormStatusChange$ = new ManagedSubject<any>(this);
    public readonly gameDb$: Observable<GameDatabase>;
    public readonly appProfileDescs$: Observable<AppProfile.Description[]>;

    @AsyncState()
    public readonly gameDb!: GameDatabase;

    @AsyncState()
    public readonly appProfileDescs!: AppProfile.Description[];

    @AsyncState()
    public readonly formModel!: Readonly<Partial<AppProfile.Form>>;

    @ViewChild(NgForm)
    public readonly form!: NgForm;

    @Input("profile")
    public initialProfile!: Partial<AppProfile>;

    @Input()
    public createMode = false;

    @Input()
    public copyMode = false;

    @Input()
    public baseProfileMode = false;

    @Input()
    public remedyMode: keyof AppProfile | keyof GameInstallation | false = false;

    @DeclareState("modLinkModeSupported")
    protected _modLinkModeSupported = false;

    @DeclareState("modLinkModeChildOnlySupported")
    protected _modLinkModeChildOnlySupported = false;

    @DeclareState("configLinkModeSupported")
    protected _configLinkModeSupported = false;
    
    @DeclareState("manageSavesSupported")
    protected _manageSavesSupported = false;

    @DeclareState("profileRootPathValid")
    protected _profileRootPathValid = false;

    @DeclareState("manageSteamCompatSymlinksSupported")
    protected _manageSteamCompatSymlinksSupported = false;

    @DeclareState("currentGameDetails")
    protected _currentGameDetails: GameDetails = GameDetails.empty();

    @DeclareState("customGameInstaller")
    protected _customGameInstaller!: GameInstallation;

    @DeclareState()
    protected gameIds: GameId[] = [];

    private readonly validateProfileName = (control: AbstractControl): ValidationErrors | null => {
        return this.appProfileDescs.some(existingProfile => control.value.toLowerCase() === existingProfile.name.toLowerCase())
            ? { invalidProfileName: true }
            : null;
    };

    private readonly validateProfileRoot = (control: AbstractControl): Observable<ValidationErrors | null> => {
        if (!control.value) {
            return of(null);
        }

        return ElectronUtils.invoke("app:checkLinkSupported", {
            targetPath: ".",
            destPaths: [control.value],
            symlink: true,
            symlinkType: "dir"
        }).pipe(map(supported => supported ? null : { invalidProfileRoot: true }));
    };

    @DeclareState("foundGameInstallations")
    private _foundGameInstallations: GameInstallation[] = [];

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppProfileSettingsComponent>,
        store: Store,
        private readonly appDialogs: AppDialogs,
        protected readonly profileManager: ProfileManager
    ) {
        super({ cdRef });

        this.gameDb$ = store.select(AppState.getGameDb);
        this.appProfileDescs$ = store.select(AppState.getProfileDescriptions);

        stateRef.get("gameDb").pipe(
            map((gameDb) => (Object.keys(gameDb) as GameId[]).filter(
                gameId => gameId !== GameId.UNKNOWN && gameId !== GameId.NONE
            ))
        ).subscribe(gameIds => this.gameIds = gameIds);

        // Add validators
        stateRef.get("form").pipe(
            filterDefined(),
            distinctUntilChanged(),
            delay(0)
        ).subscribe((form) => {
            const nameControl = form.controls["name"];
            if (nameControl) {
                nameControl.addValidators([this.validateProfileName]);
                nameControl.updateValueAndValidity();
            }

            const rootPathOverrideControl = form.controls["rootPathOverride"];
            if (rootPathOverrideControl) {
                rootPathOverrideControl.addAsyncValidators([this.validateProfileRoot]);
                rootPathOverrideControl.updateValueAndValidity();
            }
        });

        // Disable form is profile is locked
        combineLatest(stateRef.getAll("initialProfile", "createMode", "form")).pipe(
            filter(([initialProfile, createMode]) => !createMode && !!initialProfile.locked),
        ).subscribe(([, , form]) => form.control.disable());

        // Get game details for the selected game
        combineLatest(stateRef.getAll("gameDb", "formModel")).subscribe(([gameDb, { gameId }]) => {
            this._currentGameDetails = gameDb[gameId ?? GameId.UNKNOWN];
        });

        // Check if mod links are supported
        this.formModel$.pipe(
            filter(formModel => !!formModel.name),
            switchMap(formModel => ElectronUtils.invoke("profile:dirLinkSupported", {
                profile: formModel as AppProfile,
                srcDir: "modsPathOverride",
                destDirs: ["modDir", "rootDir"],
                symlink: false,
                checkBaseProfile: false
            }))
        ).subscribe(linkSupported => this._modLinkModeChildOnlySupported = !!linkSupported);

        this.formModel$.pipe(
            filter(formModel => !!formModel.name),
            switchMap(formModel => ElectronUtils.invoke("profile:dirLinkSupported", {
                profile: formModel as AppProfile,
                srcDir: "modsPathOverride",
                destDirs: ["modDir", "rootDir"],
                symlink: false,
                checkBaseProfile: true
            }))
        ).subscribe(linkSupported => this._modLinkModeSupported = !!linkSupported);

        // Check if config links are supported
        this.formModel$.pipe(
            filter(formModel => !!formModel.name),
            switchMap(formModel => ElectronUtils.invoke("profile:dirLinkSupported", {
                profile: formModel as AppProfile,
                srcDir: "configPathOverride",
                destDirs: ["configFilePath"],
                symlink: true,
                symlinkType: "file",
                checkBaseProfile: true
            }))
        ).subscribe(linkSupported => this._configLinkModeSupported = !!linkSupported);

        // Check if save mgmt is supported
        combineLatest(stateRef.getAll("formModel", "initialProfile")).pipe(
            filter(([formModel]) => !!formModel.name),
            switchMap(([formModel, initialProfile]) => initialProfile.deployed ? of(!!initialProfile.manageSaveFiles) : ElectronUtils.invoke("profile:dirLinkSupported", {
                profile: formModel as AppProfile,
                srcDir: "savesPathOverride",
                destDirs: ["saveFolderPath"],
                symlink: true,
                symlinkType: "junction",
                checkBaseProfile: false
            }))
        ).subscribe(managedSavesSupported => this._manageSavesSupported = !!managedSavesSupported);

        // Check if Steam compat symlinks are supported
        this.formModel$.pipe(
            switchMap(formModel => formModel.steamCustomGameId ? ElectronUtils.invoke("profile:steamCompatSymlinksSupported", {
                profile: formModel as AppProfile
            }) : of(false))
        ).subscribe(manageSteamCompatSymlinksSupported => this._manageSteamCompatSymlinksSupported = manageSteamCompatSymlinksSupported);

        // Create the customGameInstaller settings from the initial profile, if any
        stateRef.get("initialProfile").subscribe((initialProfile) => {
            this._customGameInstaller = initialProfile.gameInstallation
                ? cloneDeep(initialProfile.gameInstallation)
                : this._customGameInstaller ?? GameInstallation.empty();
        });
        
        // Check if profile is a base profile
        combineLatest(stateRef.getAll("initialProfile", "createMode")).pipe(
            filter(([, createMode]) => !createMode)
        ).subscribe(([initialProfile]) => this.baseProfileMode = !AppProfile.isFullProfile(initialProfile));

        // Monitor form status changes
        stateRef.get("form").pipe(
            filterDefined(),
            switchMap(form => form.statusChanges!.pipe(
                startWith(form.status)
            ))
        ).subscribe(this.onFormStatusChange$);

        // Monitor form model changes
        stateRef.get("form").pipe(
            filterDefined(),
            switchMap(form => form.valueChanges!.pipe(
                map(() => form.control.getRawValue()),
                startWith(form.control.getRawValue())
            )),
            map(formValue => toMerged(this.initialProfile, formValue)),
            distinctUntilChanged((x, y) => LangUtils.isEqual(x, y))
        ).subscribe(formModel => this.formModel$.next(formModel));

        // Get the found game installations for the current game
        this.formModel$.pipe(
            map((profile) => profile.gameId),
            filter((gameId): gameId is GameId => !!gameId),
            distinctUntilChanged(),
            switchMap(gameId => ElectronUtils.invoke("app:findGameInstallations", { gameId }))
        ).subscribe(gameInstallations => this._foundGameInstallations = gameInstallations);

        // Attempt to fill in custom game installation details when provided with a game root directory
        combineLatest([this.formModel$, stateRef.get("customGameInstaller")]).pipe(
            filter(([formModel, customGameInstaller]) => !!formModel.gameId && !!customGameInstaller.rootDir),
            map(([formModel, customGameInstaller]): [GameId, string] => [formModel.gameId!, customGameInstaller.rootDir!]),
            distinctUntilChanged((x, y) => LangUtils.isEqual(x, y)),
            switchMap(([gameId, rootDir]) => ElectronUtils.invoke("app:findGameInstallationsByRootDir", { gameId, rootDir })),
            filter(foundGameInstallations => foundGameInstallations.length > 0),
            map(foundGameInstallations => foundGameInstallations[0])
        ).subscribe((foundGameInstallation) => {
            this._customGameInstaller = Object.entries(foundGameInstallation).reduce((customGameInstaller, [
                installPropKey,
                installPropValue
            ]) => {
                if (!customGameInstaller[installPropKey as keyof GameInstallation]) {
                    customGameInstaller[installPropKey as keyof GameInstallation] = installPropValue as any;
                }

                return customGameInstaller;
            }, this._customGameInstaller);

            this.form.control.updateValueAndValidity();
        });

        // Generate profile field input object
        combineLatest([this.formModel$, ...stateRef.getAll(
            "currentGameDetails",
            "form",
            "baseProfileMode",
            "modLinkModeSupported",
            "configLinkModeSupported",
            "remedyMode"
        )]).pipe(
            map(([
                profileModel,
                gameDetails,
                form,
                baseProfileMode,
                modLinkModeSupported,
                configLinkModeSupported,
                autofocusFieldId
            ]): AppProfileFormFieldInput => ({
                profileModel,
                gameDetails,
                form,
                baseProfileMode,
                modLinkModeSupported,
                configLinkModeSupported,
                autofocusFieldId: autofocusFieldId ? autofocusFieldId : undefined
            }))
        ).subscribe(fieldInput => this.fieldInput$.next(fieldInput));
    }

    public get foundGameInstallations(): GameInstallation[]{
        return this._foundGameInstallations;
    }

    public get modLinkModeSupported(): boolean {
        return this._modLinkModeSupported;
    }

    public get configLinkModeSupported(): boolean {
        return this._configLinkModeSupported;
    }

    public get modLinkModeChildOnlySupported(): boolean {
        return this._modLinkModeChildOnlySupported;
    }
    
    public get manageSavesSupported(): boolean {
        return this._manageSavesSupported;
    }

    public get profileRootPathValid(): boolean {
        return this._profileRootPathValid;
    }

    public get manageSteamCompatSymlinksSupported(): boolean {
        return this._manageSteamCompatSymlinksSupported;
    }

    public get currentGameDetails(): GameDetails {
        return this._currentGameDetails;
    }

    public get customGameInstaller(): GameInstallation {
        return this._customGameInstaller;
    }

    protected isFieldGroup(fieldEntry: AppProfileFormFieldEntry): fieldEntry is AppProfileFormFieldGroup {
        return isProfileFormFieldGroup(fieldEntry);
    }

    protected updateCustomGameInstallation(gameInstallation: GameInstallation, gameInstallationSelect: MatSelect): void {
        this._customGameInstaller = merge(this._customGameInstaller, cloneDeep(gameInstallation));

        // Set the current installation to the custom installation
        gameInstallationSelect.value = this._customGameInstaller;
    }

    protected submitForm(form: NgForm): Observable<unknown> {
        if (!form.valid) {
            return EMPTY;
        }

        let wasDeployed = false;
        return runOnce(this.formModel$.pipe(
            take(1),
            withLatestFrom(this.profileManager.activeProfile$),
            switchMap(([formModel, activeProfile]) => {
                // Undeploy the profile before making any changes
                if (formModel.name === activeProfile?.name && activeProfile?.deployed) {
                    wasDeployed = true;
                    return this.profileManager.updateActiveModDeployment(false).pipe(
                        catchError(() => EMPTY),
                        map(() => formModel)
                    )
                } else {
                    return of(formModel);
                }
            }),
            switchMap((formModel) => this.profileManager.resolveProfileFromForm(formModel as AppProfile.Form, this.baseProfileMode)),
            switchMap((formModel) => this.checkUpdatedProfilePathOverrides(formModel)),
            switchMap((formModel) => (() => {
                // Add/update profile data on submit
                if (this.createMode) {
                    return this.profileManager.addProfile(formModel);
                } else if (!LangUtils.isEqual(this.initialProfile, formModel)) {
                    return this.profileManager.updateActiveProfile(formModel);
                } else {
                    // Skip updates if no changes were made
                    return of(formModel);
                }
            })().pipe(
                switchMap(() => this.checkCreateDefaultConfigFiles(formModel)),
                finalize(() => {
                    if (wasDeployed) {
                        this.profileManager.updateActiveModDeployment(true);
                    }
                    
                    this.onFormSubmit$.next(formModel)
                })
            )
        )));
    }

    private checkCreateDefaultConfigFiles(profile: AppProfile): Observable<AppProfile> {
        const gameDetails = this.gameDb[profile.gameId];
    
        // Check if profile-specific config files need to be created
        if (!this.copyMode && profile.manageConfigFiles && !!gameDetails.gameConfigFiles?.length) {
            // Check if any profile-specific config files exist
            return forkJoin(gameDetails.gameConfigFiles!.map((configFile) => {
                return this.profileManager.readConfigFile(profile, configFile, false);
            })).pipe(
                map(configData => !configData.some(Boolean)),
                filterTrue(),
                switchMap(() => this.appDialogs.showDefault(
                    "No config files exist for this profile. Do you want to create them now?",
                    [DialogManager.YES_ACTION_PRIMARY, DialogManager.NO_ACTION]
                )),
                filterTrue(),
                switchMap(() => {
                    // Write default config files
                    const gameDetails = this.gameDb[profile.gameId];
                    return forkJoin(gameDetails.gameConfigFiles!.map((configFile) => {
                        return this.profileManager.readConfigFile(profile, configFile, true).pipe(
                            mergeMap(fileData => this.profileManager.updateConfigFile(profile, configFile, fileData))
                        );
                    }));
                }),
                map(() => profile),
                defaultIfEmpty(profile)
            );
        } else {
            return of(profile);
        }
    }

    private checkUpdatedProfilePathOverrides(profile: AppProfile): Observable<AppProfile> {
        if (this.createMode) {
            return of(profile);
        }

        const profilePathOverrideKeys = [
            "modsPathOverride",
            "savesPathOverride",
            "configPathOverride",
            "backupsPathOverride",
            "rootPathOverride"
        ] as const;

        // Determine if any profile paths were changed
        const pathDiffs$ = profilePathOverrideKeys
            .filter(pathKey => profile[pathKey] !== this.initialProfile[pathKey])
            .map((pathKey) => concatJoin(
                ElectronUtils.invoke("profile:resolvePath", { profile: this.initialProfile as AppProfile, pathKeys: [pathKey] }),
                ElectronUtils.invoke("profile:resolvePath", { profile, pathKeys: [pathKey] }),
            ).pipe(
                switchMap(([[oldPath], [newPath]]) => {
                    if (oldPath !== newPath) {
                        const missingPath = `<${pathKey}>`;

                        // Ask the user if they want to move old files to new path
                        return this.appDialogs.showProfileMoveFolderDialog(oldPath ?? missingPath, newPath ?? missingPath).pipe(
                            filterDefined(),
                            switchMap(({ overwrite, destructive }) => ElectronUtils.invoke("profile:moveFolder", {
                                pathKey,
                                overwrite,
                                destructive,
                                oldProfile: this.initialProfile as AppProfile,
                                newProfile: profile
                            }))
                        );
                    } else {
                        return EMPTY;
                    }
                })
            ));

        return concatJoin(...pathDiffs$).pipe(
            map(() => profile),
            defaultIfEmpty(profile)
        );
    }
}
