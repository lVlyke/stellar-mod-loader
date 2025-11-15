import { head, orderBy} from "es-toolkit";
import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Input,
    Output,
    EventEmitter,
    ViewChild,
    ViewChildren,
    QueryList
} from "@angular/core";
import { NgTemplateOutlet, AsyncPipe } from "@angular/common";
import { AbstractControl, NgForm, NgModel, ValidationErrors, FormsModule } from "@angular/forms";
import { CdkPortal } from "@angular/cdk/portal";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatIconButton } from "@angular/material/button";
import { MatStep, MatStepper, MatStepLabel } from "@angular/material/stepper";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatRadioGroup, MatRadioButton } from "@angular/material/radio";
import { Store } from "@ngxs/store";
import { AsyncState, ComponentState, ComponentStateRef, DeclareState, ManagedSubject } from "@lithiumjs/angular";
import { EMPTY, Observable, forkJoin, from, of } from "rxjs";
import {
    catchError,
    concatMap,
    defaultIfEmpty,
    delay,
    distinctUntilChanged,
    finalize,
    map,
    mergeMap,
    startWith,
    switchMap,
    take,
    tap,
    toArray
} from "rxjs/operators";
import { AppModInstaller } from "./mod-installer.types";
import { BaseComponent } from "../../core/base-component";
import { filterDefined, filterFalse, filterTrue, runOnce } from "../../core/operators";
import { ModImportRequest } from "../../models/mod-import-status";
import { ModInstaller } from "../../models/mod-installer";
import { AppProfile } from "../../models/app-profile";
import { DialogManager } from "../../services/dialog-manager";
import { AppState } from "../../state";
import { ProfileManager } from "../../services/profile-manager";
import { OverlayHelpers, OverlayHelpersRef } from "../../services/overlay-helpers";
import { log } from "../../util/logger";
import { AppDialogs } from "../../services/app-dialogs";
import { AppPluginGroupValidator } from "./plugin-group-validator.directive";
import { AppValueCheckboxGroupComponent } from "../value-checkbox/group/value-checkbox-group.component";
import { AppValueCheckboxComponent } from "../value-checkbox/value-checkbox.component";
import { AppModImportRequestImagePipe } from "../../pipes/mod-import-request-image.pipe";
import { AppIsDebugPipe } from "../../pipes/is-debug.pipe";
import { AppResolveDefaultModInstallerPluginPipe } from "./resolve-default-mod-installer-plugin.pipe";
import { AppResolveDefaultModInstallerPluginsPipe } from "./resolve-default-mod-installer-plugins.pipe";
import { ModProfileRef } from "../../models/mod-profile-ref";

@Component({
    selector: "app-mod-installer",
    templateUrl: "./mod-installer.component.html",
    styleUrls: ["./mod-installer.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        NgTemplateOutlet,
        FormsModule,

        CdkPortal,

        MatFormField,
        MatLabel,
        MatInput,
        MatSlideToggle,
        MatProgressSpinner,
        MatStepper,
        MatStep,
        MatStepLabel,
        MatRadioGroup,
        MatIcon,
        MatTooltip,
        MatRadioButton,
        MatCard,
        MatCardContent,
        MatIconButton,

        AppPluginGroupValidator,
        AppValueCheckboxGroupComponent,
        AppValueCheckboxComponent,
        AppModImportRequestImagePipe,
        AppIsDebugPipe,
        AppResolveDefaultModInstallerPluginPipe,
        AppResolveDefaultModInstallerPluginsPipe
    ],
    providers: [
        ComponentState.create(AppModInstallerComponent)
    ],
    host: {
        "[attr.compact-view]": "compactView"
    }
})
export class AppModInstallerComponent extends BaseComponent {

    public readonly STEP_DISABLED_COLOR = "warn"; // TODO - Find a better way of doing this
    public readonly onFormSubmit$ = new ManagedSubject<NgForm>(this);
    public readonly isLoading$: Observable<boolean>;
    public readonly activeProfile$: Observable<AppProfile | undefined>;

    @Output("importRequestChange")
    public readonly importRequestChange$ = new EventEmitter<ModImportRequest>();

    @Input()
    public importRequest!: ModImportRequest;

    @Input()
    public compactView: boolean = false;

    @ViewChild(NgForm)
    public readonly form!: NgForm;

    @ViewChild("installStepper")
    public readonly installStepper!: MatStepper;

    @ViewChildren("pluginGroupModel", { read: NgModel })
    public readonly pluginGroupNgModels!: QueryList<NgModel>;

    @ViewChild("fullscreenPluginPreview", { read: CdkPortal })
    protected readonly fullscreenPluginPreviewPortal!: CdkPortal;

    @AsyncState()
    public readonly activeProfile?: AppProfile;

    protected readonly PluginGroupType = ModInstaller.PluginGroup.Type;
    protected readonly PluginType = ModInstaller.PluginType.Name;

    @DeclareState("installSteps")
    protected _installSteps: AppModInstaller.InstallStep[] = [];

    @DeclareState("installerFlags")
    private _installerFlags: AppModInstaller.Flags = {};
    
    protected previewPlugin: AppModInstaller.Plugin | undefined;
    protected fullscreenPluginPreviewRef: OverlayHelpersRef | undefined;

    private readonly _validateStepsVisited = (_control: AbstractControl): ValidationErrors | null => {
        return (!this.hasNextStep || this.installStepper.steps.toArray()
            .filter(step => this.installStepIsEnabled(step))
            .every(step => step.interacted))
                ? null
                : { installSteps: true };
    };

    private readonly _modFilePathCache = new Map<string, string[]>();

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppModInstallerComponent>,
        store: Store,
        appDialogs: AppDialogs,
        private readonly profileManager: ProfileManager,
        private readonly overlayHelpers: OverlayHelpers
    ) {
        super({ cdRef });

        this.activeProfile$ = store.select(AppState.getActiveProfile);
        this.isLoading$ = stateRef.get("installSteps").pipe(
            map(installSteps => !this.importRequest.installer!.zeroConfig && !installSteps?.length)
        );

        // Check if this mod has all required dependencies
        stateRef.get("importRequest").pipe(
            filterDefined(),
            switchMap(importRequest => this.resolveCompositeDependencies(importRequest.installer!.config?.moduleDependencies ?? [], {}).pipe(
                switchMap(result => result ? EMPTY : of(importRequest))
            )),
            switchMap((importRequest) => {
                const ignoreAction = { label: "Ignore" };

                log.info("FOMOD installer dependency check failed: ", importRequest.installer!.config?.moduleDependencies);

                // TODO - Show missing deps
                return appDialogs.showDefault({
                    prompt: "Mod is missing required dependencies.",
                    actions: [ignoreAction, DialogManager.CANCEL_ACTION_PRIMARY],
                }, DialogManager.NEGATIVE_ACTIONS).pipe(
                    tap((userCancelled) => {
                        if (userCancelled) {
                            importRequest.importStatus = "CANCELED";
                            this.onFormSubmit$.next(this.form);
                        }
                    })
                );
            })
        ).subscribe();

         // Determine the default name for the mod
         stateRef.get("importRequest").pipe(
            filterDefined(),
            distinctUntilChanged()
         ).subscribe((importRequest) => {
            let bestModName = importRequest.installer!.info?.name ?? importRequest.installer!.config?.moduleName._ ?? importRequest.modName;
            if (importRequest.installer!.info?.version) {
                bestModName += ` - ${importRequest.installer!.info.version}`;
            }
            importRequest.modName = bestModName;
        });

        // Create the list of install steps
        stateRef.get("importRequest").pipe(
            distinctUntilChanged(),
            switchMap(importRequest => this.createInstallSteps(importRequest.installer!))
        ).subscribe((installSteps) => {
            this._installSteps = installSteps;
            this.updateFilesAndFlags();
        });

        // Trigger file updates on changes to the plugin group controls
        stateRef.get("pluginGroupNgModels").pipe(
            filterDefined(),
            switchMap(pluginGroupModels => pluginGroupModels.changes),
            delay(0),
            switchMap(() => this.updateFilesAndFlags())
        ).subscribe();

        // Add a validator for ensuring all steps have been visited
        stateRef.get("form").pipe(
            filterDefined()
        ).subscribe(({ form }) => form.addValidators([this._validateStepsVisited]));

        // Run form validation on install step changes
        stateRef.get("form").pipe(
            filterDefined(),
            switchMap(() => this.installStepper.selectedIndexChange)
        ).subscribe(() => this.form.form.updateValueAndValidity());

        // Update the plugin preview to the first plugin in the first plugin group of a newly selected step
        this.isLoading$.pipe(
            filterFalse(),
            switchMap(() => stateRef.get("installStepper")),
            filterDefined(),
            switchMap(installStepper => installStepper.selectedIndexChange.pipe(
                startWith(installStepper.selectedIndex)
            )),
            distinctUntilChanged(),
            map(index => this._installSteps[index]),
            filterDefined(),
            map(selectedInstallStep => head(head(selectedInstallStep.pluginGroups)?.plugins ?? [])),
            filterDefined()
        ).subscribe(firstPlugin => this.previewPlugin = firstPlugin);
    }

    public get installSteps(): AppModInstaller.InstallStep[] {
        return this._installSteps;
    }

    public get installerFlags(): AppModInstaller.Flags {
        return this._installerFlags;
    }

    public get hasNextStep(): boolean {
        if (this.installStepper.steps.length === 0) {
            return false;
        }

        let stepIndex = this.installStepper.selectedIndex;

        do {
            ++stepIndex;

            if (stepIndex >= this.installStepper.steps.length) {
                return false;
            }
        } while (!this.installStepIsEnabled(this.installStepper.steps.get(stepIndex)));

        return true;
    }

    public get hasPreviousStep(): boolean {
        if (this.installStepper.steps.length === 0) {
            return false;
        }

        let stepIndex = this.installStepper.selectedIndex;

        do {
            --stepIndex;

            if (stepIndex < 0) {
                return false;
            }
        } while (!this.installStepIsEnabled(this.installStepper.steps.get(stepIndex)));

        return true;
    }

    public nextStep(): void {
        if (this.installStepper.steps.length === 0) {
            return;
        }

        let stepIndex = this.installStepper.selectedIndex;

        do {
            ++stepIndex;

            if (stepIndex >= this.installStepper.steps.length) {
                return;
            }
        } while (!this.installStepIsEnabled(this.installStepper.steps.get(stepIndex)));

        this.installStepper.selectedIndex = stepIndex;
    }

    public previousStep(): void {
        if (this.installStepper.steps.length === 0) {
            return;
        }

        let stepIndex = this.installStepper.selectedIndex;

        do {
            --stepIndex;

            if (stepIndex < 0) {
                return;
            }
        } while (!this.installStepIsEnabled(this.installStepper.steps.get(stepIndex)));

        this.installStepper.selectedIndex = stepIndex;
    }

    public showFullscreenPluginPreview(): void {
        if (!!this.previewPlugin) {
            this.fullscreenPluginPreviewRef?.close();

            this.fullscreenPluginPreviewRef = this.overlayHelpers.createFullScreen(this.fullscreenPluginPreviewPortal, {
                hasBackdrop: true,
                disposeOnBackdropClick: true,
                width: "85%",
                height: "90%",
                panelClass: "mat-app-background",
                backdropClass: "backdrop-clear"
            });
        }
    }

    protected updateFilesAndFlags(): Observable<unknown> {
        // Clear previous active files
        this.importRequest.modFilePathMapFilter = {};
        // Update installer flags
        this._installerFlags = this.calculateInstallerFlags();

        // Update active files
        this.updatePluginGroupFiles();
        return runOnce(this.updateConditionalFiles(this._installerFlags).pipe(
            finalize(() => {
                this.updateRequiredFiles();

                this.importRequestChange$.emit(this.importRequest);
            })
        ));
    }

    private updatePluginGroupFiles(): void {
        this.pluginGroupNgModels.forEach((ngModel) => {
            const plugins: AppModInstaller.Plugin[] = Array.isArray(ngModel.value) ? ngModel.value : [ngModel.value];

            // Add all active plugin files & flags in this group
            plugins.forEach((plugin) => {
                if (!!plugin.pluginInfo.files?.[0]) {
                    this.updateFilePathMap(plugin.pluginInfo.files[0]);
                }
            });
        });
    }

    private calculateInstallerFlags(): AppModInstaller.Flags {
        const installerFlags: AppModInstaller.Flags = {};

        this.pluginGroupNgModels.forEach((ngModel) => {
            const plugins: AppModInstaller.Plugin[] = Array.isArray(ngModel.value) ? ngModel.value : [ngModel.value];

            plugins.forEach((plugin) => {
                if (!!plugin.pluginInfo.conditionFlags?.[0]?.flag) {
                    plugin.pluginInfo.conditionFlags[0].flag.forEach(flag => installerFlags[flag.name[0]] = flag._);
                }
            });
        });

        return installerFlags;
    }

    private updateRequiredFiles(): void {
        const installerConfig = this.importRequest.installer!.config;
        if (installerConfig) {
            // If an installer config was provided, include its required files
            installerConfig.requiredInstallFiles.forEach((files) => {
                this.updateFilePathMap(files);
            });
        } else {
            // If no installer config was provided, include all files
            const filePathMap = this.importRequest.modFilePathMapFilter!;
            this.importRequest.modFilePaths.forEach((modFilePath) => {
                filePathMap[modFilePath.filePath] = modFilePath.mappedFilePath ?? modFilePath.filePath;
            });
        }
    }

    private updateConditionalFiles(installerFlags: AppModInstaller.Flags): Observable<unknown> {
        const patterns = this.importRequest.installer!.config?.conditionalFileInstalls?.patterns?.[0]?.pattern ?? [];

        if (patterns.length === 0) {
            return EMPTY;
        }

        return from(patterns).pipe(
            concatMap(({ dependencies, files }) => this.resolveCompositeDependencies(dependencies, installerFlags).pipe(
                filterTrue(),
                tap(() => this.updateFilePathMap(files[0]))
            )),
            toArray()
        );
    }

    private updateFilePathMap(files: ModInstaller.FileList | ModInstaller.FileSystemItem[]): void {
        const filePathMap = this.importRequest.modFilePathMapFilter!;
        const fileEntries = Array.isArray(files) ? files : [
            files.file ?? [],
            files.folder ?? []
        ].flat();

        fileEntries.forEach((fileEntry) => {
            // TODO - Support `alwaysInstall`, `installIfUsable`, `priority`

            const srcPath = fileEntry.source[0];
            const destPath = fileEntry.destination?.[0] ?? srcPath;
            filePathMap[srcPath] = destPath;
        });
    }

    protected resolveCompositeDependencies(
        dependencies: ModInstaller.CompositeDependency[],
        installerFlags: AppModInstaller.Flags
    ): Observable<boolean> {
        return from(dependencies).pipe(
            mergeMap(({
                operator,
                fileDependency,
                flagDependency,
                dependencies,
                gameDependency,
                fommDependency
            }) => {
                const depOperator = operator?.[0] ?? ModInstaller.CompositeDependency.Operator.And;
                const conditions: Observable<boolean>[] = [];
    
                if (fileDependency && fileDependency.length > 0) {
                    conditions.push(...fileDependency.map(fileDependency => this.resolveFileDependency(fileDependency)));
                }
    
                if (dependencies && dependencies.length > 0) {
                    conditions.push(this.resolveCompositeDependencies(dependencies, installerFlags));
                }
    
                if (flagDependency && flagDependency.length > 0) {
                    conditions.push(...flagDependency.map((flagDependency) => {
                        const checkVal = flagDependency.value[0];
                        const curVal = installerFlags[flagDependency.flag[0]];
                        if (!checkVal?.length) {
                            return of(!curVal);
                        } else {
                            return of(curVal === checkVal);
                        }
                    }));
                }
    
                if (gameDependency && gameDependency.length > 0) {
                    // TODO - Make game version dependencies optional?
                    conditions.push(this.resolveGameVersionDependency(gameDependency[0]));
                }
    
                if (fommDependency && fommDependency.length > 0) {
                    // TODO - Check `fommDependency`
                    log.warn("Ignoring unsupported FOMOD fommDependency check: ", fommDependency);
                }

                return forkJoin(conditions).pipe(
                    map(conditions => depOperator === ModInstaller.CompositeDependency.Operator.And
                        ? conditions.every(Boolean)
                        : conditions.some(Boolean)
                    )
                );
            }),
            toArray(),
            map(results => results.every(Boolean))
        );
    }

    private resolveFileDependency(file: ModInstaller.FileDependency | string): Observable<boolean> {
        const filePathMap = this.importRequest.modFilePathMapFilter ?? {};
        const fileState = typeof file === "string"
            ? ModInstaller.DependencyState.Active
            : (file.state?.[0] ?? ModInstaller.DependencyState.Active);
        const rawFilePath = typeof file === "string"
            ? file
            : file.file[0];
        const filePath = rawFilePath.replace(/[\\/]/g, this.importRequest.filePathSeparator);
        const localFile = filePathMap[rawFilePath];
        
        if (localFile) {
            return of(fileState === ModInstaller.DependencyState.Active);
        }

        const externalModFiles = this.activeProfile!.externalFilesCache?.modDirFiles ?? [];
        if (this.importRequest.root) {
            externalModFiles.push(...this.activeProfile!.externalFilesCache?.gameDirFiles ?? []);
        }

        const externalMatch = externalModFiles?.find((externalFile) => {
            const curFilePath = externalFile.replace(/[\\/]/g, this.importRequest.filePathSeparator);
            return curFilePath.toLowerCase() === filePath.toLowerCase();
        });

        if (externalMatch) {
            return of(fileState === ModInstaller.DependencyState.Active);
        }

        const profileMods = this.activeProfile!.mods;
        return from(profileMods).pipe(
            mergeMap(([modName, modEntry]) => this.readModFilePaths(modName, modEntry).pipe(
                map(modFilePaths => modFilePaths.some((rawModFilePath) => {
                    const modFilePath = rawModFilePath.replace(/[\\/]/g, this.importRequest.filePathSeparator);
                    if (filePath.toLowerCase() === modFilePath.toLowerCase()) {
                        switch (fileState) {
                            case ModInstaller.DependencyState.Inactive:
                                return !modEntry.enabled;
                            case ModInstaller.DependencyState.Active:
                                return modEntry.enabled;
                            case ModInstaller.DependencyState.Missing:
                                return true;
                        }
                    }

                    return false;
                }))
            )),
            toArray(),
            map(results => results.filter(Boolean)),
            map(matches => (fileState === ModInstaller.DependencyState.Missing)
                                ? matches.length === 0
                                : matches.length > 0
            )
        );
    }

    private resolveGameVersionDependency(verionDependency: ModInstaller.VersionDependency): Observable<boolean> {
        return this.profileManager.resolveGameBinaryVersion().pipe(
            catchError((error) => {
                log.error(error);
                return of(undefined);
            }),
            map((resolvedVersion) => {
                if (resolvedVersion === undefined) {
                    log.warn("Unable to resolve game binary version.");
                    return true; // Skip game version checks if unable to resolve version
                }

                return resolvedVersion === verionDependency.version[0];
            })
        );
    }

    private createInstallSteps(
        installer: ModInstaller,
        flags?: AppModInstaller.Flags
    ): Observable<AppModInstaller.InstallStep[]> {
        const installSteps = installer.config?.installSteps;

        if (!installSteps) {
            return of([]);
        }

        return from(installSteps.installStep).pipe(
            concatMap(installStep => this.resolveCompositeDependencies(
                    !!flags && installStep.visible ? installStep.visible : [],
                    flags ?? {}
                ).pipe(
                    filterTrue(),
                    concatMap(() => this.createPluginGroups(installStep).pipe(
                        map((pluginGroups) => ({
                            pluginGroups,
                            stepInfo: installStep,
                            name: installStep.name[0]
                        }))
                    ))
                )
            ),
            toArray(),
            map((processedInstallSteps) => {
                const order = installSteps.order?.[0] ?? ModInstaller.Order.Ascending;
                processedInstallSteps = this.orderedSort(processedInstallSteps, order);
        
                return processedInstallSteps;
            })
        );
    }

    private createPluginGroups(
        installStep: ModInstaller.InstallStep,
        flags?: AppModInstaller.Flags
    ): Observable<AppModInstaller.PluginGroup[]> {
        const pluginGroups = installStep.optionalFileGroups[0];
        return from(pluginGroups.group).pipe(
            concatMap((pluginGroup) => this.createPlugins(pluginGroup, flags).pipe(
                map((plugins) => ({
                    plugins,
                    pluginGroupInfo: pluginGroup,
                    name: pluginGroup.name[0],
                    type: pluginGroup.type[0]
                }))
            )),
            toArray(),
            map((processedPluginGroups) => {
                const order = pluginGroups.order?.[0] ?? ModInstaller.Order.Ascending;
                return this.orderedSort(processedPluginGroups, order);
            })
        );
    }

    private createPlugins(
        pluginGroup: ModInstaller.PluginGroup,
        flags?: AppModInstaller.Flags
    ): Observable<AppModInstaller.Plugin[]> {
        const plugins = pluginGroup.plugins[0];
        return from(plugins.plugin).pipe(
            concatMap((plugin) => {
                const pluginDefaultType = plugin.typeDescriptor[0].type;
                const pluginDependencyType = plugin.typeDescriptor[0].dependencyType;

                if (!pluginDefaultType && !pluginDependencyType) {
                    throw new Error("Invalid plugin group.");
                }

                let basePluginType = pluginDependencyType
                    ? pluginDependencyType[0].defaultType[0].name[0]
                    : pluginDefaultType![0].name[0];
                let pluginType$ = of(basePluginType);

                // Resolve any dependencies for plugin type
                if (pluginDependencyType) {
                    const dependenyPatterns = pluginDependencyType[0].patterns[0];
                    pluginType$ = from(dependenyPatterns.pattern).pipe(
                        concatMap((dependencyPattern) => this.resolveCompositeDependencies(dependencyPattern.dependencies, flags ?? {}).pipe(
                            filterTrue(),
                            map(() => dependencyPattern.type[0].name[0])
                        )),
                        take(1),
                        defaultIfEmpty(basePluginType)
                    );
                }

                return pluginType$.pipe(
                    map((pluginType) => ({
                        pluginGroup,
                        pluginInfo: plugin,
                        name: plugin.name[0],
                        type: pluginType,
                        flags: this.createPluginFlags(plugin),
                        description: plugin.description?.[0],
                        image: plugin.image?.[0]
                    }))
                );
            }),
            toArray(),
            map((processedPlugins) => {
                const order = plugins.order?.[0] ?? ModInstaller.Order.Ascending;
                return this.orderedSort(processedPlugins, order)
            })
        )
    }

    private createPluginFlags(plugin: ModInstaller.Plugin): AppModInstaller.Flag[] {
        return plugin.conditionFlags?.[0].flag.map((flag) => ({
            name: flag.name[0],
            value: flag._
        })) ?? [];
    }

    private readModFilePaths(modName: string, modRef: ModProfileRef): Observable<string[]> {
        if (this._modFilePathCache.has(modName)) {
            return of(this._modFilePathCache.get(modName)!);
        } else {
            return this.profileManager.readModFilePaths(modName, modRef, true).pipe(
                // Cache file path lookups to avoid redundant calls to the filesystem
                tap(result => this._modFilePathCache.set(modName, result))
            );
        }
    }

    private installStepIsEnabled(step?: MatStep): boolean {
        return !!step && step.color !== this.STEP_DISABLED_COLOR;
    }

    private orderedSort<T extends { name: string }>(
        namedItems: T[],
        order?: ModInstaller.Order
    ): T[] {
        order ??= ModInstaller.Order.Ascending;
        if (order === ModInstaller.Order.Ascending) {
            namedItems = orderBy(namedItems, ["name"], ["asc"]);
        } else if (order === ModInstaller.Order.Descending) {
            namedItems = orderBy(namedItems, ["name"], ["desc"]);
        }

        return namedItems;
    }
}
