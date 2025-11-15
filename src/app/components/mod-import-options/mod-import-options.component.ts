import { without, sortBy, pick } from "es-toolkit";
import { orderBy } from "es-toolkit/compat";
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
import { distinctUntilChanged, filter, map, mergeMap, switchMap, take, tap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { filterDefined, filterTrue } from "../../core/operators";
import { ModImportRequest } from "../../models/mod-import-status";
import { AppProfile } from "../../models/app-profile";
import { AppState } from "../../state";
import { DialogManager } from "../../services/dialog-manager";
import { GameDetails } from "../../models/game-details";
import { DialogAction } from "../../services/dialog-manager.types";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { ProfileManager } from "../../services/profile-manager";
import { LangUtils } from "../../util/lang-utils";
import { MatRadioButton, MatRadioGroup } from "@angular/material/radio";

interface FileTreeNode {
    terminal: boolean;
    fullPath: string;
    pathPart: string;
    level: number;
    parent?: FileTreeNode;
    children?: FileTreeNode[];
}

interface ModFileTreeNode extends FileTreeNode {
    enabled$: BehaviorSubject<boolean>;
    parent?: ModFileTreeNode;
    children?: ModFileTreeNode[];
}

type FileTreeNodeRecord<N extends FileTreeNode = FileTreeNode> = Record<string, N>;

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
        MatCheckbox,
        MatRadioGroup,
        MatRadioButton
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

    protected readonly fileNodeTransformer = (inputData: FileTreeNode, level: number): FileTreeNode => {
        return Object.assign(inputData, { level });
    };

    protected readonly nodeIsDir = (_level: number, node: FileTreeNode) => !node.terminal;

    protected readonly treeFlattener = new MatTreeFlattener(
        this.fileNodeTransformer,
        node => node.level,
        node => !node.terminal,
        node => node.children,
    );

    protected readonly treeControl = new FlatTreeControl<FileTreeNode>(
        node => node.level,
        node => !node.terminal
    );

    protected readonly modFileTreeDataSource = new MatTreeFlatDataSource(
        this.treeControl, this.treeFlattener
    );

    protected readonly gameDirDataSource = new MatTreeFlatDataSource(
        this.treeControl, this.treeFlattener
    );

    private readonly validateFilesEnabled = (_control: AbstractControl): ValidationErrors | null => {
        return this.importRequest.modFilePaths.some(({ enabled }) => enabled)
            ? null
            : { noFiles: true };
    };

    @DeclareState("showInstallFolderPicker")
    private _showInstallFolderPicker = false;

    @DeclareState("gameModSubdirs")
    private _gameModSubdirs: string[] = [];

    @DeclareState("gameDirNodes")
    private _gameDirNodes!: FileTreeNode[];

    @DeclareState("modFileNodes")
    private _modFileNodes!: ModFileTreeNode[];

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

        // Resolve game data subdirs
        stateRef.get("activeProfile").pipe(
            filterDefined(),
            switchMap(activeProfile => profileManager.readDataSubdirs(activeProfile))
        ).subscribe(dataSubdirs => this._gameModSubdirs = dataSubdirs);

        // Determine if this mod packaging format matches an existing game data subdir
        stateRef.get("gameDetails").pipe(
            filter(gameDetails => !!gameDetails?.multipleDataRoots),
            switchMap(() => combineLatest([
                stateRef.get("gameModSubdirs"),
                stateRef.get("modFileNodes"),
                stateRef.get("importRequest").pipe(
                    map(importRequest => pick(importRequest, ["modSubdirRoots", "modFilePaths", "filePathSeparator"])),
                    distinctUntilChanged((a, b) => LangUtils.isEqual(a, b)),
                )
            ]))
        ).subscribe(([gameModSubdirs, modFileNodes, importRequest]) => {
            gameModSubdirs = orderBy(gameModSubdirs, (node) => node.length, "desc");
            let modDataSubdir: string | undefined = undefined;
            for (const gameModDir of gameModSubdirs) {
                const gameModDirNorm = this.normalizePath(gameModDir, importRequest.filePathSeparator);

                // Check if all mod files are prefixed with `gameModDirNorm`
                if (importRequest.modFilePaths.every((modFile) => {
                    const filePath = this.normalizePath(modFile.filePath, importRequest.filePathSeparator, importRequest.modSubdirRoots);
                    return filePath.startsWith(gameModDirNorm);
                })) {
                    modDataSubdir = gameModDir;
                    break;
                }
            }

            // If data subdir is found, we don't need to show installation folder picker
            if (modDataSubdir) {
                this._showInstallFolderPicker = false;
                this.setModFilePrefix("");
                this.expandToRoot(this.findNodeByPath(modFileNodes, modDataSubdir));
            } else {
                this._showInstallFolderPicker = true;
            }
        });

        // Create a nested array of `FileTreeNode` objects based on `dataSubdirs`
        stateRef.get("showInstallFolderPicker").pipe(
            filterTrue(),
            switchMap(() => stateRef.get("gameModSubdirs")),
            map((gameModSubdirs) => gameModSubdirs.reduce((subdirModel, dataSubdir) => {
                const pathParts = dataSubdir.split(this.importRequest.filePathSeparator);
                let curPath = "";
                let parentInputData: FileTreeNode | undefined = undefined;
                pathParts.forEach((pathPart, index) => {
                    if (index > 0) {
                        curPath += this.importRequest.filePathSeparator;
                    }

                    curPath += pathPart;

                    const pathPartInputData = subdirModel[curPath] ?? {
                        pathPart,
                        fullPath: curPath,
                        parent: parentInputData,
                        terminal: true
                    };

                    if (index < pathParts.length - 1) {
                        pathPartInputData.children ??= [];
                        pathPartInputData.terminal = false;
                    }

                    if (parentInputData && !parentInputData.children!.includes(pathPartInputData)) {
                        parentInputData.children!.push(pathPartInputData);
                    }

                    subdirModel[curPath] = pathPartInputData;
                    parentInputData = pathPartInputData;
                });

                return subdirModel;
            }, {} as FileTreeNodeRecord<FileTreeNode>)),
            map(gameDirNodes => Object.values(gameDirNodes).filter(gameDirNode => !gameDirNode.parent)),
        ).subscribe((gameDirNodes) => {
            this._gameDirNodes = gameDirNodes;
            this.gameDirDataSource.data = gameDirNodes;
        });

        // Expand installation dir node on `modFilePrefix` changes
        combineLatest([
            stateRef.get("importRequest").pipe(
                map(importRequest => importRequest.modFilePrefix),
                filterDefined(),
                distinctUntilChanged()
            ),
            stateRef.get("gameDirNodes")
        ]).subscribe(([modFilePrefix, gameDirNodes]) => {
            this.expandToRoot(this.findNodeByPath(gameDirNodes, modFilePrefix));
        });

        // Create a nested array of `FileTreeNode` objects based on `importRequest.modFilePaths`
        stateRef.get("importRequest").pipe(
            map((importRequest) => pick(importRequest, ["modFilePaths", "filePathSeparator"])),
            distinctUntilChanged((a, b) => LangUtils.isEqual(a, b)),
            map((importRequest) => sortBy(importRequest.modFilePaths, ["filePath"]).reduce((inputData, { filePath, enabled }) => {
                const pathParts = filePath.split(importRequest.filePathSeparator);
                let curPath = "";
                let parentInputData: ModFileTreeNode | undefined = undefined;
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
            }, {} as FileTreeNodeRecord<ModFileTreeNode>)),
            map(inputRecord => Object.values(inputRecord).filter(inputData => !inputData.parent)),
        ).subscribe((modFileNodes) => {
            // Rebuild the mod file tree
            this._modFileNodes = modFileNodes;
            this.modFileTreeDataSource.data = modFileNodes;

            if (modFileNodes.length === 1) {
                this.treeControl.expand(modFileNodes[0]);
            }
            
            // Find the root data dir nodes (if any) and expand them
            this.findRootNodes(modFileNodes).forEach((rootDirNode: FileTreeNode | undefined) => {
                while (rootDirNode) {
                    this.treeControl.expand(rootDirNode);
                    rootDirNode = rootDirNode.parent;
                }
            });
        });

        // Determine if this mod is an unwrapped plugin mod (plugin files at root) and set the install dir to pluginDataRoot
        combineLatest(stateRef.getAll("showInstallFolderPicker", "gameDetails", "modFileNodes")).pipe(
            filter(([showInstallFolderPicker, gameDetails]) => showInstallFolderPicker && !!gameDetails?.pluginDataRoot),
        ).subscribe(([, gameDetails, modFileNodes]) => {
            const findPluginNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
                return nodes.filter((node) => {
                    return node.terminal && gameDetails?.pluginFormats.some(pluginFormat => {
                        return node.pathPart.toLowerCase().endsWith(`.${pluginFormat.toLowerCase()}`);
                    });
                });
            };

            let rootNodes = this.findRootNodes(modFileNodes);
            let isUnwrapedPluginMod = false;
            if (rootNodes.length > 0) {
                isUnwrapedPluginMod = rootNodes.some(rootNode => rootNode.children && findPluginNodes(rootNode.children).length > 0);
            } else {
                isUnwrapedPluginMod = findPluginNodes(modFileNodes).length > 0;
            }

            // If unwrapped plugin mod, set the installation folder to `pluginDataRoot` and hide the picker
            if (isUnwrapedPluginMod) {
                this.setModFilePrefix(gameDetails!.pluginDataRoot!);
                this._showInstallFolderPicker = false;
            }
        });

        // Add a validator for ensuring at least 1 file is selected
        stateRef.get("form").pipe(
            filterDefined()
        ).subscribe(({ form }) => form.addValidators([this.validateFilesEnabled]));

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
                        return dialogManager.createDefault({
                            prompt: `This mod requires the script extender ${scriptExtender!.name}, but the active profile does not appear to be set up to use it. \n\nAre you sure you want to continue?`
                        });
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
                    
                    return dialogManager.createDefault({
                        prompt: `This mod has plugins, but plugins are not currently enabled.`,
                        actions: [ACTION_ENABLE_PLUGINS, DialogManager.CANCEL_ACTION_ACCENT, ACTION_IGNORE]
                    }).pipe(
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

    public get showInstallFolderPicker(): boolean {
        return this._showInstallFolderPicker;
    }

    public get gameModSubdirs(): string[] {
        return this._gameModSubdirs;
    }

    public get detectedScriptExtenders(): GameDetails.ScriptExtender[] {
        return this._detectedScriptExtenders;
    }

    public get gameDirNodes(): FileTreeNode[] {
        return this._gameDirNodes;
    }

    public get modFileNodes(): ModFileTreeNode[] {
        return this._modFileNodes;
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
    protected isNodeEnabled$(node: ModFileTreeNode): Observable<boolean> {
        return node.enabled$.pipe(
            map(enabled => enabled && this.isRootDirNode(node, true))
        );
    }

    /**
     * @description Enables or disables the mod file for the given `node`.
     */
    protected setModFileEnabled(node: ModFileTreeNode, enabled: boolean): void {
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

    protected setModFilePrefix(prefix?: string): void {
        this.importRequest = Object.assign(this.importRequest, {
            modFilePrefix: prefix ? prefix.replace(/[/\\]/g, this.importRequest.filePathSeparator) : undefined
        });
    }

    protected expandToRoot(node: FileTreeNode | undefined): void {
        while (node) {
            this.treeControl.expand(node);
            node = node.parent;
        }
    }

    protected findNodeByPath(
        nodes: FileTreeNode[],
        path: string
    ): FileTreeNode | undefined {
        return nodes.reduce<FileTreeNode | undefined>((foundNode, node) => {
            if (foundNode) {
                return foundNode;
            } else if (node.fullPath === path) {
                foundNode = node;
            } else if (node.children) {
                foundNode = this.findNodeByPath(node.children, path);
            }

            return foundNode;
        }, undefined);
    }

    protected findRootNodes(nodes: FileTreeNode[]): FileTreeNode[] {
        return nodes.reduce<FileTreeNode[]>((rootDirNodes, node) => {
            for (const modSubdirRoot of this.importRequest.modSubdirRoots) {
                if (modSubdirRoot.toLowerCase().includes(node.fullPath.toLowerCase())) {
                    if (node.fullPath.toLowerCase() === modSubdirRoot.toLowerCase()) {
                        rootDirNodes.push(node);
                    } else if (!!node.children) {
                        rootDirNodes.push(...this.findRootNodes(node.children));
                    }
                }
            }

            return rootDirNodes;
        }, []);
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
