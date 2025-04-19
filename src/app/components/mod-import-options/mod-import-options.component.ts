import { without, sortBy } from "es-toolkit";
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, Output, EventEmitter, ViewChild } from "@angular/core";
import { NgTemplateOutlet, AsyncPipe } from "@angular/common";
import { AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR, NgForm, ValidationErrors, FormsModule } from "@angular/forms";
import { FlatTreeControl } from "@angular/cdk/tree";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatIconButton, MatAnchor } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatCheckbox } from "@angular/material/checkbox";
import {
    MatTreeFlatDataSource,
    MatTreeFlattener,
    MatTree,
    MatTreeNodeDef,
    MatTreeNode,
    MatTreeNodePadding,
    MatTreeNodeToggle
} from "@angular/material/tree";
import {
    AsyncState,
    ComponentState,
    ComponentStateRef,
    DeclareState,
    ManagedBehaviorSubject,
    ManagedSubject
} from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { BehaviorSubject, EMPTY, Observable, combineLatest, from } from "rxjs";
import { filter, map, mergeMap, switchMap, take, tap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { filterDefined } from "../../core/operators";
import { ModImportRequest } from "../../models/mod-import-status";
import { AppProfile } from "../../models/app-profile";
import { AppState } from "../../state";
import { DialogManager } from "../../services/dialog-manager";
import { GameDetails } from "../../models/game-details";
import { DialogAction } from "../../services/dialog-manager.types";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { ProfileManager } from "../../services/profile-manager";
import { LangUtils } from "../../util/lang-utils";

interface FileTreeNode {
    terminal: boolean;
    fullPath: string;
    pathPart: string;
    level: number;
    parent?: FileTreeNode;
    children?: FileTreeNode[];
    enabled$: BehaviorSubject<boolean>;
}

type FileTreeNodeRecord = Record<string, FileTreeNode>;

@Component({
    selector: "app-mod-import-options",
    templateUrl: "./mod-import-options.component.html",
    styleUrls: ["./mod-import-options.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        NgTemplateOutlet,
        FormsModule,

        MatFormField,
        MatLabel,
        MatInput,
        MatTree,
        MatTreeNodeDef,
        MatTreeNode,
        MatTreeNodePadding,
        MatIconButton,
        MatTreeNodeToggle,
        MatIcon,
        MatAnchor,
        MatTooltip,
        MatCheckbox
    ],
    providers: [
        ComponentState.create(AppModImportOptionsComponent),
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: AppModImportOptionsComponent
        }
    ]
})
export class AppModImportOptionsComponent extends BaseComponent implements ControlValueAccessor {

    public readonly onFormSubmit$ = new ManagedSubject<NgForm>(this);
    public readonly activeProfile$: Observable<AppProfile | undefined>;
    public readonly gameDetails$: Observable<GameDetails | undefined>;
    public readonly isPluginsEnabled$: Observable<boolean>;

    @Output("importRequestChange")
    public readonly importRequestChange$ = new EventEmitter<ModImportRequest>();

    @AsyncState()
    public readonly activeProfile?: AppProfile;

    @AsyncState()
    public readonly gameDetails?: GameDetails;

    @AsyncState()
    public readonly isPluginsEnabled!: boolean;

    @Input()
    public importRequest!: ModImportRequest;

    @ViewChild(NgForm)
    public readonly form!: NgForm;

    private readonly _fileNodeTransformer = (inputData: FileTreeNode, level: number): FileTreeNode => {
        return Object.assign(inputData, { level });
    };

    private _validateFilesEnabled = (_control: AbstractControl): ValidationErrors | null => {
        return this.importRequest.modFilePaths.some(({ enabled }) => enabled)
            ? null
            : { noFiles: true };
    };

    protected readonly nodeIsDir = (_level: number, node: FileTreeNode) => !node.terminal;

    protected readonly treeControl = new FlatTreeControl<FileTreeNode>(
        node => node.level,
        node => !node.terminal
    );

    protected readonly treeFlattener = new MatTreeFlattener(
        this._fileNodeTransformer,
        node => node.level,
        node => !node.terminal,
        node => node.children,
    );

    protected readonly filesDataSource = new MatTreeFlatDataSource(
        this.treeControl, this.treeFlattener
    );

    @DeclareState("fileDataInput")
    private _fileDataInput!: FileTreeNode[];

    @DeclareState("detectedScriptExtenders")
    private _detectedScriptExtenders: GameDetails.ScriptExtender[] = [];

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppModImportOptionsComponent>,
        store: Store,
        dialogManager: DialogManager,
        appStateMgmt: AppStateBehaviorManager,
        profileManager: ProfileManager
    ) {
        super({ cdRef });

        this.activeProfile$ = store.select(AppState.getActiveProfile);
        this.gameDetails$ = store.select(AppState.getActiveGameDetails);
        this.isPluginsEnabled$ = store.select(AppState.isPluginsEnabled);

        // Create a nested array of `FileTreeNode` objects based on `importRequest.modFilePaths`
        stateRef.get("importRequest").pipe(
            map((importRequest) => sortBy(importRequest.modFilePaths, ["filePath"]).reduce((inputData, { filePath, enabled }) => {
                const pathParts = filePath.split(importRequest.filePathSeparator);
                let curPath = "";
                let parentInputData: FileTreeNode | undefined = undefined;
                pathParts.forEach((pathPart, index) => {
                    if (index > 0) {
                        curPath += importRequest.filePathSeparator;
                    }

                    curPath += pathPart;

                    const pathPartInputData = inputData[curPath] ?? {
                        pathPart,
                        fullPath: curPath,
                        parent: parentInputData,
                        enabled$: new ManagedBehaviorSubject<boolean>(this, enabled),
                        terminal: true
                    };

                    if (index < pathParts.length - 1) {
                        pathPartInputData.children ??= [];
                        pathPartInputData.terminal = false;
                    }

                    if (parentInputData && !parentInputData.children!.includes(pathPartInputData)) {
                        parentInputData.children!.push(pathPartInputData);
                    }

                    inputData[curPath] = pathPartInputData;
                    parentInputData = pathPartInputData;
                });

                return inputData;
            }, {} as FileTreeNodeRecord)),
            map(inputRecord => Object.values(inputRecord).filter(inputData => !inputData.parent)),
        ).subscribe(inputData => this._fileDataInput = inputData);

        // When `fileDataInput` changes, rebuild the tree
        stateRef.get("fileDataInput").subscribe((dataInput) => {
            this.filesDataSource.data = dataInput;

            const findRootNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
                return nodes.reduce<FileTreeNode[]>((rootDirNodes, node) => {
                    for (const modSubdirRoot of this.importRequest.modSubdirRoots) {
                        if (modSubdirRoot.toLowerCase().includes(node.fullPath.toLowerCase())) {
                            if (node.fullPath.toLowerCase() === modSubdirRoot.toLowerCase()) {
                                rootDirNodes.push(node);
                            } else if (!!node.children) {
                                rootDirNodes.push(...findRootNodes(node.children));
                            }
                        }
                    }

                    return rootDirNodes;
                }, []);
            };

            // Find the root data dir nodes (if any) and expand them
            findRootNodes(dataInput).forEach((rootDirNode: FileTreeNode | undefined) => {
                while (rootDirNode) {
                    this.treeControl.expand(rootDirNode);
                    rootDirNode = rootDirNode.parent;
                }
            });
        });

        // Add a validator for ensuring at least 1 file is selected
        stateRef.get("form").pipe(
            filterDefined()
        ).subscribe(({ form }) => form.addValidators([this._validateFilesEnabled]));

        // Check if this mod is using a script extender
        combineLatest(stateRef.getAll(
            "gameDetails",
            "importRequest"
        )).pipe(
            filter(([gameDetails, importRequest]) => !importRequest.root && !!gameDetails?.scriptExtenders?.length),
            map(([
                gameDetails, { 
                modFilePaths,
                filePathSeparator,
                modSubdirRoots
            }]) => gameDetails!.scriptExtenders!.filter(scriptExtender => scriptExtender.modPaths.some((seModPath) => {
                seModPath = this.normalizePath(seModPath, filePathSeparator, modSubdirRoots);
                const normalizedModPaths = modFilePaths.map(({ filePath }) => {
                    return this.normalizePath(filePath, filePathSeparator, modSubdirRoots);
                });
                
                // Make sure the current mod isn't itself a script extender
                const isScriptExtender = normalizedModPaths.some((filePath) => {
                    return scriptExtender!.binaries.find(binary => filePath.endsWith(this.normalizePath(binary, "/")));
                });

                return !isScriptExtender && normalizedModPaths.some(filePath => filePath.startsWith(seModPath));
            })))
        ).subscribe(detectedScriptExtenders => this._detectedScriptExtenders = detectedScriptExtenders);

        // Warn user if a mod uses a script extender they don't appear to be using
        combineLatest(stateRef.getAll("detectedScriptExtenders", "activeProfile")).pipe(
            filter(([detectedScriptExtenders, activeProfile]) => detectedScriptExtenders.length > 0 && AppProfile.isFullProfile(activeProfile)),
            take(1),
            switchMap(([detectedScriptExtenders, activeProfile]) => from(detectedScriptExtenders).pipe(
                map(detectedScriptExtender => [detectedScriptExtender, activeProfile] as const)
            )),
            mergeMap(([scriptExtender, activeProfile]) => profileManager.isUsingScriptExtender(scriptExtender!, activeProfile!).pipe(
                switchMap((usingScriptExtender) => {
                    if (usingScriptExtender) {
                        return EMPTY;
                    } else {
                        return dialogManager.createDefault(
                            `This mod requires the script extender ${scriptExtender!.name}, but the active profile does not appear to be set up to use it. \n\nAre you sure you want to continue?`
                        );
                    }
                })
            )),
            take(1)
        ).subscribe((action) => {
            if (action === DialogManager.CANCEL_ACTION) {
                this.importRequest.importStatus = "CANCELED";
                this.onFormSubmit$.next(this.form);
            }
        });

        // Warn user if a mod uses plugins and plugins aren't enabled
        stateRef.get("importRequest").pipe(
            filterDefined(),
            take(1),
            switchMap((importRequest) => {
                if (importRequest.modPlugins.length > 0 && !this.isPluginsEnabled) {
                    const ACTION_ENABLE_PLUGINS: DialogAction = {
                        label: "Enable",
                        accent: true,
                        tooltip: "Enable plugins"
                    };
                    const ACTION_IGNORE: DialogAction = {
                        label: "Ignore",
                        tooltip: "Ignore warning (NOTE: This mod will likely not work correctly!)"
                    };
                    
                    return dialogManager.createDefault(
                        `This mod has plugins, but plugins are not currently enabled.`,
                        [ACTION_ENABLE_PLUGINS, DialogManager.CANCEL_ACTION_ACCENT, ACTION_IGNORE]
                    ).pipe(
                        tap((action) => {
                            switch (action) {
                                case ACTION_ENABLE_PLUGINS: {
                                    appStateMgmt.setPluginsEnabled(true);
                                    break;
                                }
                                case DialogManager.CANCEL_ACTION_ACCENT: {
                                    this.importRequest.importStatus = "CANCELED";
                                    this.onFormSubmit$.next(this.form);
                                    break;
                                }
                            }
                        })
                    );
                } else {
                    return EMPTY;
                }
            })
        ).subscribe();
    }

    public get detectedScriptExtenders(): GameDetails.ScriptExtender[] {
        return this._detectedScriptExtenders;
    }

    public get fileDataInput(): FileTreeNode[] {
        return this._fileDataInput;
    }

    public writeValue(importRequest: ModImportRequest): void {
        this.importRequest = importRequest;
    }

    public registerOnChange(fn: (importRequest: ModImportRequest) => void): void {
        this.importRequestChange$.subscribe(fn);
    }

    public registerOnTouched(_fn: any): void {
        throw new Error("Method not implemented.");
    }

    /**
     * @description Determines whether or not `node` is the root dir node. If `nestedCheck` is true,
     * it will also return `true` if `node` is a nested child of the root dir node.
     */
    protected isRootDirNode(node: FileTreeNode, nestedCheck = false): boolean {
        if (nestedCheck && this.importRequest.modSubdirRoots.length === 0) {
            return true;
        }
        
        return this.importRequest.modSubdirRoots.some((modSubdirRoot) => {
            return nestedCheck
                ? node.fullPath.toLowerCase().includes(modSubdirRoot.toLowerCase())
                : node.fullPath.toLowerCase() === modSubdirRoot.toLowerCase();
        });
    }

    /**
     * @description Determines whether or not the mod file for the given `node` is enabled.
     */
    protected isNodeEnabled$(node: FileTreeNode): Observable<boolean> {
        return node.enabled$.pipe(
            map(enabled => enabled && this.isRootDirNode(node, true))
        );
    }

    /**
     * @description Enables or disables the mod file for the given `node`.
     */
    protected setModFileEnabled(node: FileTreeNode, enabled: boolean): void {
        // Update the `node` enabled status
        node.enabled$.next(enabled);

        // Update the `node` children enabled status
        node.children?.forEach(childNode => this.setModFileEnabled(childNode, enabled));

        // Update the mod file status in `importRequest`
        const modPath = this.importRequest.modFilePaths.find(({ filePath }) => filePath === node.fullPath);
        if (modPath) {
            modPath.enabled = enabled;
        }

        // Update form validation
        this.form.form.updateValueAndValidity();
    }

    /**
     * @description Adds `modSubdirRoot` as a root dir.
     */
    protected addModRootSubdir(modSubdirRoot: string): void {
        const modSubdirRoots = this.importRequest.modSubdirRoots
            // Remove existing parent subdir and child subdir roots
            .filter((existingModSubdirRoot) => {
                
                return !(modSubdirRoot.startsWith(existingModSubdirRoot) || existingModSubdirRoot.startsWith(modSubdirRoot));
            })
            // Add new subdir root
            .concat([modSubdirRoot]);

        this.importRequest = Object.assign(this.importRequest, { modSubdirRoots });
    }

    /**
     * @description Removes `modSubdirRoot` as a root dir.
     */
    protected removeModRootSubdir(modSubdirRoot: string): void {
        this.importRequest = Object.assign(this.importRequest, {
            modSubdirRoots: without(this.importRequest.modSubdirRoots, modSubdirRoot)
        });
    }

    private normalizePath(path: string, sep: string, modSubdirRoots?: string[]): string {
        let result = LangUtils.normalizeFilePath(path, sep);

        if (modSubdirRoots) {
            for (const modSubdirRoot of modSubdirRoots) {
                const modSubdirRootNorm = `${this.normalizePath(modSubdirRoot, sep)}${sep}`;
                if (result.startsWith(modSubdirRootNorm)) {
                    result = result.replace(modSubdirRootNorm, "");
                    break;
                }
            }
        }

        return result;
    }
}
