import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, Output, EventEmitter, ViewChild, ElementRef } from "@angular/core";
import { CdkPortal } from "@angular/cdk/portal";
import { MatActionList, MatListItem } from "@angular/material/list";
import { MatIcon } from "@angular/material/icon";
import { MatDivider } from "@angular/material/divider";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatLine } from "@angular/material/core";
import { AsyncState, ComponentState, ComponentStateRef } from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { combineLatest, Observable } from "rxjs";
import { map } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { filterTrue } from "../../core/operators";
import { ModProfileRef } from "../../models/mod-profile-ref";
import { ProfileManager } from "../../services/profile-manager";
import { DialogManager } from "../../services/dialog-manager";
import { AppDialogs } from "../../services/app-dialogs";
import { OverlayHelpers, OverlayHelpersRef } from "../../services/overlay-helpers";
import { ModSection } from "../../models/mod-section";
import { AppProfile } from "../../models/app-profile";
import { AppState } from "../../state";

@Component({
    selector: "app-mod-actions",
    templateUrl: "./mod-actions.component.html",
    styleUrls: ["./mod-actions.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CdkPortal,

        MatActionList,
        MatListItem,
        MatLine,
        MatIcon,
        MatDivider,
        MatCard,
        MatCardContent
    ],
    providers: [
        ComponentState.create(AppModActionsComponent),
    ]
})
export class AppModActionsComponent extends BaseComponent {

    public readonly activeProfile$: Observable<AppProfile | undefined>;

    @Output("actionSelect")
    public readonly actionSelect$ = new EventEmitter<void>();

    @AsyncState()
    public readonly activeProfile?: AppProfile;

    @Input()
    public root!: boolean;

    @Input()
    public modName!: string;

    @Input()
    public modRef!: ModProfileRef;

    @ViewChild("sectionMenu", { read: CdkPortal, static: true })
    protected readonly sectionMenuPortal!: CdkPortal;

    @ViewChild("sectionListMenu", { read: CdkPortal, static: true })
    protected readonly sectionListMenuPortal!: CdkPortal;

    protected modSections: ModSection[] = [];
    protected sectionMenu?: OverlayHelpersRef;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppModActionsComponent>,
        store: Store,
        private readonly profileManager: ProfileManager,
        private readonly appDialogs: AppDialogs,
        private readonly overlayHelpers: OverlayHelpers,
        private readonly elementRef: ElementRef
    ) {
        super({ cdRef });

        this.activeProfile$ = store.select(AppState.getActiveProfile);

        combineLatest(stateRef.getAll("activeProfile", "root")).pipe(
            map(([activeProfile, root]) => root ? activeProfile?.rootModSections : activeProfile?.modSections)
        ).subscribe(modSections => this.modSections = modSections ?? []);
    }

    protected showModInFileExplorer(): void {
        this.profileManager.showModInFileExplorer(this.modName, this.modRef);

        this.actionSelect$.emit();
    }

    protected showSectionActions(): void {
        this.sectionMenu = this.overlayHelpers.createAttached(this.sectionMenuPortal,
            this.elementRef.nativeElement,
            OverlayHelpers.ConnectionPositions.nestedContextMenu,
            { managed: false }
        );
    }

    protected showSectionsList(): void {
        this.overlayHelpers.createAttached(this.sectionListMenuPortal,
            this.sectionMenu!.overlay.overlayElement,
            OverlayHelpers.ConnectionPositions.nestedContextMenu,
            { managed: false }
        );
    }

    protected deleteMod(): void {
        this.appDialogs.showDefault({
            title: "Delete Mod",
            prompt: `Are you sure you want to delete ${this.modName}?`,
            actions: [DialogManager.YES_ACTION, DialogManager.NO_ACTION_PRIMARY]
        }).pipe(
            filterTrue()
        ).subscribe(() => this.profileManager.deleteMod(this.root, this.modName));

        this.actionSelect$.emit();
    }

    protected renameMod(): void {
        this.profileManager.renameModFromUser(this.root, this.modName);

        this.actionSelect$.emit();
    }

    protected moveModToTop(): void {
        this.profileManager.moveModToTopOfOrder(this.root, this.modName);

        this.actionSelect$.emit();
    }

    protected moveModToBottom(): void {
        this.profileManager.moveModToBottomOfOrder(this.root, this.modName);

        this.actionSelect$.emit();
    }

    protected moveModToSection(section: ModSection): void {
        this.profileManager.moveModToSection(this.root, this.modName, section);

        this.actionSelect$.emit();
    }

    protected moveModToSectionTop(): void {
        this.profileManager.moveModToTopOfSection(this.root, this.modName);

        this.actionSelect$.emit();
    }

    protected moveModToSectionBottom(): void {
        this.profileManager.moveModToBottomOfSection(this.root, this.modName);

        this.actionSelect$.emit();
    }
}
