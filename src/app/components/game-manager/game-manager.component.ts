import { cloneDeep, remove } from "es-toolkit";
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { AbstractControl, FormsModule, NgForm, ValidationErrors } from "@angular/forms";
import { CdkPortal } from "@angular/cdk/portal";
import { MatFormField, MatHint, MatLabel } from "@angular/material/form-field";
import { MatOption, MatSelect, MatSelectTrigger } from "@angular/material/select";
import {
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelDescription,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle
} from "@angular/material/expansion";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatInput } from "@angular/material/input";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatActionList, MatListItem } from "@angular/material/list";
import { MatLine } from "@angular/material/core";
import { EMPTY, Observable, combineLatest, forkJoin, of } from "rxjs";
import {
    catchError,
    defaultIfEmpty,
    delay,
    distinctUntilChanged,
    map,
    startWith,
    switchMap,
    take,
    tap,
    withLatestFrom
} from "rxjs/operators";
import {
    AsyncState,
    ComponentState,
    ComponentStateRef,
    DeclareState,
    ManagedBehaviorSubject,
    ManagedSubject
} from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { AppState } from "../../state";
import { BaseComponent } from "../../core/base-component";
import { GameDetails } from "../../models/game-details";
import { GameDatabase } from "../../models/game-database";
import { GameId } from "../../models/game-id";
import { AppGameBadgeComponent } from "../game-badge";
import { AppGameInstallSettingsComponent } from "../game-install-settings";
import { AppProfileFormFieldInput } from "../../models/app-profile-form-field";
import { filterAllDefined, filterDefined, filterTrue, runOnce } from "../../core/operators";
import { AppSelectEditComponent, AppSelectEditControls } from "../select-edit";
import { GamePluginListType } from "../../models/game-plugin-list-type";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { GameInstallation } from "../../models/game-installation";
import { AppInvalidOrTouchedModelPipe } from "../../pipes";
import { DialogManager } from "../../services/dialog-manager";
import { AppDialogs } from "../../services/app-dialogs";
import { OverlayHelpers, OverlayHelpersRef } from "../../services/overlay-helpers";
import { LangUtils } from "../../util/lang-utils";

@Component({
    selector: "app-game-manager",
    templateUrl: "./game-manager.component.html",
    styleUrls: ["./game-manager.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        FormsModule,

        CdkPortal,

        MatFormField,
        MatSelect,
        MatSelectTrigger,
        MatOption,
        MatLabel,
        MatExpansionPanel,
        MatExpansionPanelHeader,
        MatExpansionPanelTitle,
        MatExpansionPanelDescription,
        MatAccordion,
        MatInput,
        MatCheckbox,
        MatIconButton,
        MatIcon,
        MatTooltip,
        MatButton,
        MatHint,
        MatCard,
        MatCardContent,
        MatActionList,
        MatLine,
        MatListItem,

        AppGameBadgeComponent,
        AppGameInstallSettingsComponent,
        AppSelectEditComponent,
        AppSelectEditControls,
        AppInvalidOrTouchedModelPipe
    ],
    providers: [ComponentState.create(AppGameManagerComponent)]
})
export class AppGameManagerComponent extends BaseComponent {

    public readonly gameDb$: Observable<GameDatabase>;
    public readonly customGameDb$: Observable<GameDatabase>;
    public readonly activeGameValid$ = new ManagedSubject<boolean>(this);

    @AsyncState()
    public customGameDb!: GameDatabase;

    @AsyncState()
    public gameDb!: GameDatabase;

    @ViewChild("activeGameForm")
    @DeclareState()
    public readonly activeGameForm?: NgForm;

    @ViewChild("gameMgmtMenu", { read: CdkPortal, static: true })
    protected readonly gameMgmtMenuPortal!: CdkPortal;

    protected readonly stringIdentity = "";
    protected readonly pinnedPluginIdentity: GameDetails.PinnedPlugin = { plugin: "" };
    protected readonly scriptExtenderIdentity: GameDetails.ScriptExtender = { name: "", binaries: [], modPaths: [] };
    protected readonly pluginListTypes = GamePluginListType.values();
    protected readonly fieldInput$ = new ManagedBehaviorSubject<AppProfileFormFieldInput | null>(this, null);
    
    @DeclareState("activeGameId")
    protected _activeGameId?: GameId;

    @DeclareState("activeGameDetails")
    protected _activeGameDetails?: GameDetails | undefined;

    @DeclareState("isCustomGameDetails")
    protected _isCustomGameDetails = false;

    @DeclareState()
    protected showGameMgmtMenuRef?: OverlayHelpersRef;

    protected gameIds: GameId[] = [];

    private readonly validateGameId = (control: AbstractControl): ValidationErrors | null => {
        const curGameId = control.value;
        const invalidGameId = !curGameId || Object.entries(this.gameDb)
            .some(([gameId, gameDetails]) => curGameId === gameId && this.activeGameDetails !== gameDetails);

        return invalidGameId ? { invalidGameId: true } : null;
    };

    constructor(
        cdRef: ChangeDetectorRef,
        store: Store,
        stateRef: ComponentStateRef<AppGameManagerComponent>,
        private readonly appManager: AppStateBehaviorManager,
        private readonly appDialogs: AppDialogs,
        private readonly overlayHelpers: OverlayHelpers
    ) {
        super({ cdRef });

        this.gameDb$ = store.select(AppState.getGameDb).pipe(
            map(gameDb => cloneDeep(gameDb))
        );

        this.customGameDb$ = store.select(AppState.getCustomGameDb).pipe(
            map(gameDb => cloneDeep(gameDb))
        );

        // Add form validators
        stateRef.get("activeGameForm").pipe(
            filterDefined(),
            distinctUntilChanged(),
            delay(0)
        ).subscribe((form) => {
            const gameIdControl = form.controls["gameId"];
            if (gameIdControl) {
                gameIdControl.addValidators([this.validateGameId]);
                gameIdControl.updateValueAndValidity();
            }
        });

        // Monitor form status changes
        stateRef.get("activeGameForm").pipe(
            switchMap(form => form ? form.statusChanges!.pipe(
                startWith(form.status)
            ) : "INVALID"),
            map(status => status === "VALID")
        ).subscribe(this.activeGameValid$);

        stateRef.get("gameDb").pipe(
            map((gameDb) => (Object.keys(gameDb) as GameId[]).filter(
                gameId => gameId !== "$unknown" && gameId !== "$none"
            ))
        ).subscribe(gameIds => this.gameIds = gameIds);

        combineLatest(stateRef.getAll(
            "activeGameId", 
            "gameDb",
            "customGameDb"
        )).subscribe(([activeGameId, gameDb, customGameDb]) => {
            this._activeGameDetails = activeGameId ? gameDb[activeGameId] : undefined;
            this._isCustomGameDetails = activeGameId ? Object.keys(customGameDb).includes(activeGameId) : false;
        });

        combineLatest([appManager.getPlatform(), ...stateRef.getAll(
            "activeGameDetails",
            "activeGameForm"
        )]).pipe(
            filterAllDefined(),
            map(([
                platform,
                gameDetails,
                form
            ]): AppProfileFormFieldInput => ({
                platform,
                gameDetails,
                form,
                baseProfileMode: false,
                modLinkModeSupported: false,
                configLinkModeSupported: false
            }))
        ).subscribe(fieldInput => this.fieldInput$.next(fieldInput));
    }

    public get activeGameId(): GameId | undefined {
        return this._activeGameId;
    }

    public get activeGameDetails(): GameDetails | undefined {
        return this._activeGameDetails;
    }

    public get isCustomGameDetails(): boolean {
        return this._isCustomGameDetails;
    }

    public addCustomGame(
        newGameId: GameId = "new_game",
        newGame: GameDetails = GameDetails.empty("New Game")
    ): void {
        const updatedGameDb = this.gameDb;
        const updatedCustomGameDb = this.customGameDb;

        updatedGameDb[newGameId] = newGame;
        updatedCustomGameDb[newGameId] = newGame;

        this.gameDb = updatedGameDb;
        this.customGameDb = updatedCustomGameDb;
        this._activeGameId = newGameId;
    }

    public changeGameId(oldGameId: GameId, newGameId: GameId): void {
        // Make sure new ID is unique
        if (!newGameId || !!this.gameDb[newGameId]) {
            return;
        }

        const updatedGameDb = this.gameDb;
        const updatedCustomGameDb = this.customGameDb;

        updatedGameDb[newGameId] = updatedGameDb[oldGameId];
        updatedCustomGameDb[newGameId] = updatedGameDb[newGameId];
        delete updatedGameDb[oldGameId];
        delete updatedCustomGameDb[oldGameId];

        this._activeGameId = newGameId;
        this.gameDb = updatedGameDb;
        this.customGameDb = updatedCustomGameDb;
    }

    public importGame(): Observable<unknown> {
        return runOnce(this.appManager.readGame().pipe(
            filterDefined(),
            withLatestFrom(this.appManager.getAppInfo()),
            switchMap(([[gameId, gameDetails], appInfo]) => (() => {
                if (gameDetails.schemaVersion !== appInfo.gameSchemaVersion) {
                    return this.appDialogs.showNotice(
                        `This game definition is from a different version of ${appInfo.appShortName}. Some values may not be imported correctly.`
                    );
                } else {
                    return of(true);
                }
            })().pipe(
                filterTrue(),
                tap(() => this.addCustomGame(gameId, gameDetails))
            )),
            catchError((_err) => {
                this.appDialogs.showError("Failed to import game.");
                return EMPTY;
            })
        ));
    }

    public deleteCustomGame(gameId: GameId): Observable<unknown> {
        return runOnce(this.appDialogs.showDefault({
            title: "Delete Game",
            prompt: "Are you sure you want to delete this game?",
            actions: [DialogManager.YES_ACTION, DialogManager.NO_ACTION_PRIMARY]
        }).pipe(
            filterTrue(),
            switchMap(() => this.appManager.deleteCustomGame(gameId))
        ));
    }

    public exportGame(gameId: GameId): Observable<unknown> {
        return runOnce(this.appManager.exportGame(this.gameDb[gameId]));
    }

    public addGameInstallation(gameDetails: GameDetails): void {
        gameDetails.installations.push(GameInstallation.empty());
    }

    public removeGameInstallation(gameDetails: GameDetails, gameInstallation: GameInstallation): void {
        remove(gameDetails.installations, installation => installation === gameInstallation);
    }

    public saveChanges(games: GameDatabase): Observable<unknown> {
        const updatedCustomGameDb = this.customGameDb;
        const updatedCustomGameKeys = Object.keys(updatedCustomGameDb);

        return runOnce(forkJoin([
            // Update/add games
            forkJoin(Object.entries(games)
                .filter(([gameId]) => updatedCustomGameKeys.includes(gameId))
                .map(([gameId, gameDetails]) => this.appManager.updateCustomGame(gameId, gameDetails))
            ).pipe(
                defaultIfEmpty(undefined)
            ),

            // Removed deleted/renamed games
            this.customGameDb$.pipe(
                take(1),
                switchMap((originalCustomGameDb) => forkJoin(Object.keys(originalCustomGameDb)
                    .filter((gameId) => !updatedCustomGameKeys.includes(gameId))
                    .map((gameId) => this.appManager.deleteCustomGame(gameId))
                )),
                defaultIfEmpty(undefined)
            )
        ]));
    }

    public saveAllChanges(): Observable<unknown> {
        return this.saveChanges(this.gameDb);
    }

    public saveActiveChanges(): Observable<unknown> {
        if (!this.activeGameId || !this.activeGameDetails) {
            return EMPTY;
        }
        
        return this.saveChanges({ [this.activeGameId]: this.activeGameDetails });
    }

    public hasUnsavedChanges(): Observable<boolean> {
        return this.customGameDb$.pipe(
            take(1),
            map((originalCustomGameDb) => {
                return Object.entries(this.customGameDb).some(([gameId]) => {
                    return !LangUtils.isEqual(this.gameDb[gameId], originalCustomGameDb[gameId]);
                });
            })
        );
    }

    protected showGameMgmtMenu($event: MouseEvent): void {
        this.showGameMgmtMenuRef = this.overlayHelpers.createAttached(this.gameMgmtMenuPortal,
            $event.target as HTMLElement,
            OverlayHelpers.ConnectionPositions.contextMenu,
            { managed: false }
        );
    }

    protected isCustomGame(gameId: GameId): boolean {
        return Object.keys(this.customGameDb).includes(gameId);
    }
}
