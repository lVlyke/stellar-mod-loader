import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, ViewChild } from "@angular/core";
import { NgTemplateOutlet, AsyncPipe } from "@angular/common";
import { CdkPortal } from "@angular/cdk/portal";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIcon } from "@angular/material/icon";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatActionList, MatListItem } from "@angular/material/list";
import { Observable, combineLatest } from "rxjs";
import { switchMap } from "rxjs/operators";
import { AsyncState, ComponentState, ComponentStateRef, DeclareState } from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { AppState } from "../../state";
import { BaseComponent } from "../../core/base-component";
import { GameDetails } from "../../models/game-details";
import { GameDatabase } from "../../models/game-database";
import { GameId } from "../../models/game-id";
import { AppProfile } from "../../models/app-profile";
import { filterDefined } from "../../core/operators";
import { ProfileManager } from "../../services/profile-manager";
import { ActiveProfileState } from "../../state/active-profile/active-profile.state";
import { OverlayHelpers, OverlayHelpersRef } from "../../services/overlay-helpers";
import { GameAction } from "../../models/game-action";
import { AppDialogs } from "../../services/app-dialogs";
import { AppProfileActiveModCountPipe } from "../../pipes/profile-active-mod-count.pipe";
import { AppSendElectronMsgPipe } from "../../pipes/send-electron-msg.pipe";
import { AppGameConfigFilesFoundPipe } from "../../pipes/game-config-files-found.pipe";
import { GameInstallation } from "../../models/game-installation";
import { AppGameActionDisplayNamePipe } from "../../pipes/game-action-display-name.pipe";

@Component({
    selector: "app-profile-actions",
    templateUrl: "./profile-actions.component.html",
    styleUrls: ["./profile-actions.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        NgTemplateOutlet,
        CdkPortal,

        MatButton,
        MatTooltip,
        MatIcon,
        MatCard,
        MatCardContent,
        MatActionList,
        MatListItem,
        MatIconButton,

        AppProfileActiveModCountPipe,
        AppSendElectronMsgPipe,
        AppGameConfigFilesFoundPipe,
        AppGameActionDisplayNamePipe
    ],
    providers: [ComponentState.create(AppProfileActionsComponent)],
    host: {
        "[attr.compact]": "compact ? compact : null"
    }
})
export class AppProfileActionsComponent extends BaseComponent {

    public readonly gameDb$: Observable<GameDatabase>;
    public readonly isProfileDeployed$: Observable<boolean>;
    public readonly isDeployInProgress$: Observable<boolean>;

    protected readonly profileFolderKeys: [keyof AppProfile, string][] = [
        ["rootPathOverride", "Root Directory"],
        ["modsPathOverride", "Mods Directory"],
        ["savesPathOverride", "Saves Directory"],
        ["configPathOverride", "Config Directory"],
        ["backupsPathOverride", "Backups Directory"]
    ];

    protected readonly gameFolderKeys: [keyof GameInstallation, string][] = [
        ["rootDir", "Game Directory"],
        ["modDir", "Game Data Directory"],
        ["configFilePath", "Config Directory"],
        ["saveFolderPath", "Saves Directory"]
    ];

    @AsyncState()
    public readonly gameDb!: GameDatabase;

    @AsyncState()
    public readonly isProfileDeployed!: boolean;

    @AsyncState()
    public readonly isDeployInProgress!: boolean;

    @Input()
    public profile!: AppProfile;

    @Input()
    public compact: boolean = false;

    @ViewChild("profileFoldersMenu", { read: CdkPortal, static: true })
    protected readonly profileFoldersMenuPortal!: CdkPortal;

    @ViewChild("gameFoldersMenu", { read: CdkPortal, static: true })
    protected readonly gameFoldersMenuPortal!: CdkPortal;

    @ViewChild("gameConfigFileMenu", { read: CdkPortal, static: true })
    protected readonly gameConfigFileMenuPortal!: CdkPortal;

    @ViewChild("gameActionsMenu", { read: CdkPortal, static: true })
    protected readonly gameActionsMenuPortal!: CdkPortal;
    
    @DeclareState()
    protected gameDetails?: GameDetails;

    @DeclareState()
    protected gameConfigFiles?: string[];

    @DeclareState()
    protected gameConfigFileMenuRef?: OverlayHelpersRef;

    @DeclareState()
    protected gameActionsMenuRef?: OverlayHelpersRef;

    @DeclareState()
    protected profileFoldersMenuRef?: OverlayHelpersRef;

    @DeclareState()
    protected gameFoldersMenuRef?: OverlayHelpersRef;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppProfileActionsComponent>,
        store: Store,
        protected readonly profileManager: ProfileManager,
        private readonly overlayHelpers: OverlayHelpers,
        private readonly dialogs: AppDialogs
    ) {
        super({ cdRef });

        this.gameDb$ = store.select(AppState.getGameDb);
        this.isProfileDeployed$ = store.select(ActiveProfileState.isDeployed);
        this.isDeployInProgress$ = store.select(AppState.isDeployInProgress);

        combineLatest(stateRef.getAll("profile", "gameDb")).subscribe(([profile, gameDb]) => {
            this.gameDetails = (profile ? gameDb[profile.gameId] : undefined) ?? gameDb[GameId.UNKNOWN];
            this.gameConfigFiles = this.gameDetails.gameConfigFiles;
        });
    }

    protected showProfileFoldersMenu($event: MouseEvent): void {
        this.profileFoldersMenuRef = this.overlayHelpers.createAttached(this.profileFoldersMenuPortal,
            $event.target as HTMLElement,
            OverlayHelpers.ConnectionPositions.contextMenu,
            {
                managed: false,
                panelClass: "mat-app-background"
            }
        );
    }

    protected showGameFoldersMenu($event: MouseEvent): void {
        this.gameFoldersMenuRef = this.overlayHelpers.createAttached(this.gameFoldersMenuPortal,
            $event.target as HTMLElement,
            OverlayHelpers.ConnectionPositions.contextMenu,
            {
                managed: false,
                panelClass: "mat-app-background"
            }
        );
    }

    protected showGameConfigFileMenu($event: MouseEvent): void {
        this.gameConfigFileMenuRef = this.overlayHelpers.createAttached(this.gameConfigFileMenuPortal,
            $event.target as HTMLElement,
            OverlayHelpers.ConnectionPositions.contextMenu,
            { managed: false }
        );
    }

    protected showGameActionsMenu($event: MouseEvent): void {
        this.gameActionsMenuRef = this.overlayHelpers.createAttached(this.gameActionsMenuPortal,
            $event.target as HTMLElement,
            [
                OverlayHelpers.fromDefaultConnectionPosition({
                    originX: "end",
                    overlayX: "end"
                }), ...OverlayHelpers.ConnectionPositions.contextMenu
            ],
            {
                managed: false,
                panelClass: "mat-app-background"
            }
        );
    }

    protected addCustomGameAction(): void {
        this.dialogs.showAddCustomGameActionDialog(this.profile).pipe(
            filterDefined()
        ).subscribe(gameAction => this.profileManager.addCustomGameAction(gameAction));
    }

    protected editCustomGameActionByIndex(index: number, gameAction: GameAction): void {
        // Show edit dialog
        this.dialogs.showAddCustomGameActionDialog(this.profile, gameAction, index).pipe(
            filterDefined(),
            // Finalize edits
            switchMap(gameAction => this.profileManager.editCustomGameActionByIndex(index, gameAction).pipe(
                // Set action as active
                switchMap(() => this.profileManager.setActiveGameAction(gameAction))
            ))
        ).subscribe();
    }

    protected isDefaultActionVisible(action: GameAction): boolean {
        // Hide default actions with same name as custom actions
        return !this.profile.customGameActions?.some(customAction => customAction.name === action.name);
    }
}
