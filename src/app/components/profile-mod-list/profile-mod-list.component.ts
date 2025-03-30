import { pick } from "es-toolkit";
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, Output, EventEmitter, Injector } from "@angular/core";
import { DatePipe } from "@angular/common";
import { moveItemInArray, CdkDropList, CdkDrag } from "@angular/cdk/drag-drop";
import {
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow
} from "@angular/material/table";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { Store } from "@ngxs/store";
import { AsyncState, ComponentState, ComponentStateRef } from "@lithiumjs/angular";
import { Observable, combineLatest } from "rxjs";
import { debounceTime, distinctUntilChanged, filter, finalize, map, switchMap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { ThemeContainer } from "@lithiumjs/ngx-material-theming";
import { AppProfile } from "../../models/app-profile";
import { ModProfileRef } from "../../models/mod-profile-ref";
import { OverlayHelpers } from "../../services/overlay-helpers";
import { AppModContextMenuModal } from "../../modals/mod-context-menu";
import { AppState } from "../../state";
import { AppData } from "../../models/app-data";
import { AppProfileExternalFilesListModal, FILE_LIST_TOKEN } from "../../modals/profile-external-files-list";
import { ModSection } from "../../models/mod-section";
import { RelativeOrderedMap } from "../../util/relative-ordered-map";
import { AppModSectionContextMenuModal } from "../../modals/mod-section-context-menu";
import { ProfileManager } from "../../services/profile-manager";
import { ModOverwriteFiles, ModOverwriteFilesEntry} from "../../models/mod-overwrite-files";
import {
    AppProfileModOverwrittenFilesListModal,
    MOD_NAME_TOKEN,
    OVERWRITTEN_FILES_TOKEN
} from "../../modals/profile-mod-overwritten-files-list";
import { LangUtils } from "../../util/lang-utils";

type ModListEntryType = "manual" | "mod" | "section";

interface IModListEntry {
    type: ModListEntryType;
    order?: number;
}

interface ManualModListEntry extends IModListEntry {
    type: "manual";
}

interface StandardModListEntry extends IModListEntry {
    type: "mod";
    name: string;
    modRef: ModProfileRef;
}

interface SectionModListEntry extends IModListEntry {
    type: "section";
    section: ModSection;
}

type ModListEntry = ManualModListEntry | StandardModListEntry | SectionModListEntry;
type ModListDataSource = Array<ModListEntry>;

@Component({
    selector: "app-profile-mod-list",
    templateUrl: "./profile-mod-list.component.html",
    styleUrls: ["./profile-mod-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        DatePipe,
        CdkDrag,
        CdkDropList,
        
        MatTable,
        MatColumnDef,
        MatHeaderCellDef,
        MatHeaderCell,
        MatCellDef,
        MatCell,
        MatCheckbox,
        MatIcon,
        MatTooltip,
        MatHeaderRowDef,
        MatHeaderRow,
        MatRowDef,
        MatRow
    ],
    providers: [
        ComponentState.create(AppProfileModListComponent),
    ]
})
export class AppProfileModListComponent extends BaseComponent {

    public readonly assign = Object.assign;
    public readonly defaultColumns = AppData.DEFAULT_MOD_LIST_COLUMNS;
    public readonly defaultColumnOrder = AppData.DEFAULT_MOD_LIST_COLUMN_ORDER;
    public readonly modListColumns$: Observable<string[] | undefined>;

    @Output("modChange")
    public readonly modChange$ = new EventEmitter<StandardModListEntry>;

    @Output("modOrderChange")
    public readonly modOrderChange$ = new EventEmitter<string[]>;

    @Output("sectionIndexChange")
    public readonly sectionIndexChange$ = new EventEmitter<[ModSection, number | undefined]>;

    @AsyncState()
    public readonly modListColumns!: string[] | undefined;

    @Input()
    public profile!: AppProfile;

    @Input()
    public root!: boolean;

    @Input()
    public showManualMods: boolean = true;

    protected displayedColumns: string[] = [];
    protected externalModFiles: string[] = [];
    protected modListDataSource: ModListDataSource = [];
    protected modOverwriteFiles: ModOverwriteFiles = {};
    protected calculatingOverwriteFiles: number = 0;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppProfileModListComponent>,
        store: Store,
        private readonly profileManager: ProfileManager,
        private readonly injector: Injector,
        private readonly overlayHelpers: OverlayHelpers,
        protected readonly themeContainer: ThemeContainer
    ) {
        super({ cdRef });

        this.modListColumns$ = store.select(AppState.getModListColumns);

        // Recalculate mod overwrite files on relevant profile changes
        combineLatest([
            stateRef.get("profile").pipe(map(profile => pick(
                profile,
                [
                    "rootMods",
                    "mods",
                    "gameInstallation",
                    "calculateModOverwriteFiles"
                ]
            ))),
            stateRef.get("root")
        ]).pipe(
            distinctUntilChanged((a, b) => LangUtils.isEqual(a, b)),
            filter(([profile]) => !!profile.calculateModOverwriteFiles),
            debounceTime(150),
            switchMap(() => {
                ++this.calculatingOverwriteFiles;
                return profileManager.calculateModOverwriteFiles(this.profile, this.root).pipe(
                    finalize(() => --this.calculatingOverwriteFiles)
                );
            })
        ).subscribe(modOverwriteFiles => this.modOverwriteFiles = modOverwriteFiles);

        // Recalculate table data source on profile changes
        combineLatest(stateRef.getAll(
            "profile",
            "root",
            "showManualMods"
        )).subscribe(([profile, root, showManualMods]) => {
            this.externalModFiles = (root
                ? profile.externalFilesCache?.gameDirFiles
                : profile.externalFilesCache?.modDirFiles) ?? [];
            const modsList = root ? profile.rootMods : profile.mods;
            const sectionsList = root ? profile.rootModSections : profile.modSections;
            const modListDataSource: ModListDataSource = [];

            // Show manual mods entry if requested
            if (showManualMods && !!this.externalModFiles.length) {
                modListDataSource.push({ type: "manual" });
            }
            
            let modOrder = 0;
            // Add entries for mods and sections
            modListDataSource.push(...modsList.reduce((modEntries, [name, modRef], modIndex) => {
                if (modRef.enabled) {
                    modOrder++;
                }

                // Check if a Section starts here
                const sections = sectionsList?.filter(section => {
                    return ((section.modIndexBefore === undefined) && modIndex === 0 || section.modIndexBefore === modIndex);
                }) ?? [];
                const sectionEntries: SectionModListEntry[] = sections.map(section => ({
                    type: "section",
                    section,
                    order: undefined
                }));

                // Add all top-level sections
                modEntries = modEntries.concat(sectionEntries.filter(({ section }) => section.modIndexBefore === undefined));

                const modEntry: StandardModListEntry = {
                    type: "mod",
                    name,
                    modRef,
                    order: modRef.enabled ? modOrder : undefined
                };
                
                modEntries.push(modEntry);

                // Add all relevant sections
                modEntries = modEntries.concat(sectionEntries.filter(({ section }) => section.modIndexBefore !== undefined));

                return modEntries;
            }, [] as ModListEntry[]));

            this.modListDataSource = modListDataSource;
        });

        stateRef.get("modListColumns").subscribe((modListColumns) => {
            const cols = modListColumns ?? this.defaultColumns;

            // Display columns in defined order
            this.displayedColumns = this.defaultColumnOrder.filter(
                col => cols.includes(col)
            );
        });
    }

    protected isManualEntry(entry: ModListEntry): entry is ManualModListEntry {
        return entry.type === "manual";
    }

    protected isModEntry(entry: ModListEntry): entry is StandardModListEntry {
        return entry.type === "mod";
    }

    protected isSectionEntry(entry: ModListEntry): entry is SectionModListEntry {
        return entry.type === "section";
    }

    protected dropReorder(previousIndex: number, currentIndex: number): void {
        const entryBeingMoved = this.modListDataSource[previousIndex];
        const moveDir = currentIndex < previousIndex ? -1 : 1;

        if (this.isModEntry(entryBeingMoved)) {
            // Adjust any Section indicies as needed
            for (let i = currentIndex; i != previousIndex; i -= moveDir) {
                const curEntry = this.modListDataSource[i];
                if (this.isSectionEntry(curEntry)) {
                    this.dropReorder(i, i - moveDir);
                }
            }

            // Swap the mods
            const modListData = this.modListDataSource.slice();
            moveItemInArray(modListData, previousIndex, currentIndex);

            // Calculate the new mod order
            const modOrder = modListData
                .filter(entry => this.isModEntry(entry))
                .map(({ name }) => name);
            this.modOrderChange$.emit(modOrder);
        } else if (this.isSectionEntry(entryBeingMoved)) {
            let startIndex = currentIndex;
            if (moveDir < 0) {
                startIndex += moveDir;
            }

            // Calculate the new modIndexBefore for this Section
            let modIndexBefore = undefined;
            for (let i = startIndex; i > 0; --i) {
                const curEntry = this.modListDataSource[i];
                if (this.isModEntry(curEntry)) {
                    const modsList = this.root ? this.profile.rootMods : this.profile.mods;
                    modIndexBefore = RelativeOrderedMap.indexOf(modsList, curEntry.name);
                    break;
                }

                // TODO - Check for SectionEntry swaps and swap the index of the sections wrt. each other
            }
            this.sectionIndexChange$.emit([entryBeingMoved.section, modIndexBefore]);
        }
    }

    protected enableModOverwriteCalculation(enabled: boolean): Observable<unknown> {
        if (!enabled) {
            this.modOverwriteFiles = {};
        }

        return this.profileManager.enableModOverwriteCalculation(enabled);
    }

    protected showEntryContextMenu(event: MouseEvent, listEntry: ModListEntry): void {
        const modalAnchor = {
            x: event.clientX,
            y: event.clientY
        };
        const modalConfig = {
            injector: this.injector,
            managed: false
        };

        if (this.isModEntry(listEntry)) {
            const modContextMenuRef = this.overlayHelpers.createAttached(
                AppModContextMenuModal,
                modalAnchor,
                OverlayHelpers.ConnectionPositions.contextMenu,
                modalConfig
            );

            modContextMenuRef.component.instance.root = this.root;
            modContextMenuRef.component.instance.modName = listEntry.name;
            modContextMenuRef.component.instance.modRef = listEntry.modRef;
        } else if (this.isSectionEntry(listEntry)) {
            if (!this.profile.locked) {
                const sectionContextMenuRef = this.overlayHelpers.createAttached(
                    AppModSectionContextMenuModal,
                    modalAnchor,
                    OverlayHelpers.ConnectionPositions.contextMenu,
                    modalConfig
                );

                sectionContextMenuRef.component.instance.root = this.root;
                sectionContextMenuRef.component.instance.section = listEntry.section;
            }
        }

        event.stopPropagation();
        event.preventDefault();
    }

    protected showExternalFileList(): void {
        this.overlayHelpers.createFullScreen(AppProfileExternalFilesListModal, {
            hasBackdrop: true,
            width: "40vw",
            height: "auto",
            maxHeight: "80vh",
            panelClass: "mat-app-background"
        }, [[FILE_LIST_TOKEN, this.externalModFiles]]);
    }

    protected showOverwrittenFileList(modName: string, files: ModOverwriteFilesEntry[]): void {
        this.overlayHelpers.createFullScreen(AppProfileModOverwrittenFilesListModal, {
            hasBackdrop: true,
            width: "55vw",
            height: "auto",
            maxHeight: "80vh",
            panelClass: "mat-app-background"
        }, [
            [MOD_NAME_TOKEN, modName],
            [OVERWRITTEN_FILES_TOKEN, files]
        ]);
    }
}
