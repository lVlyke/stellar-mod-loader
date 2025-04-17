import { Injectable } from "@angular/core";
import { Store } from "@ngxs/store";
import { EMPTY, from, Observable, of, throwError } from "rxjs";
import { catchError, concatMap, distinctUntilChanged, filter, map, skip, switchMap, take, toArray } from "rxjs/operators";
import { AppMessage } from "../models/app-message";
import { AppActions, AppState } from "../state";
import { AppMessageHandler } from "./app-message-handler";
import { OverlayHelpers, OverlayHelpersComponentRef, OverlayHelpersRef } from "./overlay-helpers";
import { AppProfile } from "../models/app-profile";
import { AppModSyncIndicatorModal, LOADING_MSG_TOKEN } from "../modals/loading-indicator";
import { AppAboutInfoModal, APP_INFO_TOKEN } from "../modals/app-about-info";
import { ElectronUtils } from "../util/electron-utils";
import { ExternalFile } from "../models/external-file";
import { AppData } from "../models/app-data";
import { filterDefined, filterTrue, runOnce } from "../core/operators";
import { LangUtils } from "../util/lang-utils";
import { AppSettingsUserCfg } from "../models/app-settings-user-cfg";
import { GameDatabase } from "../models/game-database";
import { AppResource } from "../models/app-resource";
import { AppPreferencesModal } from "../modals/app-preferences";
import { log } from "../util/logger";
import { AppDialogs } from "./app-dialogs";
import { AppWarnings } from "../models/app-warnings";
import { AppGameManagerModal } from "../modals/game-manager";
import { GameDetails } from "../models/game-details";
import { GameId } from "../models/game-id";
import { AppInfo } from "../models/app-info";

@Injectable({ providedIn: "root" })
export class AppStateBehaviorManager {

    private readonly appState$: Observable<AppData>;
    private readonly isDeployInProgress$: Observable<boolean>;

    constructor(
        messageHandler: AppMessageHandler,
        private readonly store: Store,
        private readonly overlayHelpers: OverlayHelpers,
        private readonly dialogs: AppDialogs,
    ) {
        let deployInProgressOverlayRef: OverlayHelpersRef | undefined;

        this.appState$ = store.select(AppState.get);
        this.isDeployInProgress$ = store.select(AppState.isDeployInProgress);

        // Save app settings to disk on changes
        this.appState$.pipe(
            filterDefined(),
            skip(1),
            distinctUntilChanged((a, b) => LangUtils.isEqual(a, b)),
            switchMap(() => this.saveSettings().pipe(
                catchError((err) => (log.error("Failed to save app settings: ", err), EMPTY))
            ))
        ).subscribe();

        // Listen for log messages from the main process
        messageHandler.messages$.pipe(
            filter(message => message.id === "app:log"),
        ).subscribe(({ data }) => log[data.level](data.text));

        messageHandler.messages$.pipe(
            filter(message => message.id === "app:showPreferences"),
            switchMap(() => this.showAppPreferences().pipe(
                catchError((err) => (log.error("Failed to show app settings menu: ", err), EMPTY))
            ))
        ).subscribe();

        messageHandler.messages$.pipe(
            filter(message => message.id === "app:showManageGames"),
            switchMap(() => this.showManageGames().pipe(
                catchError((err) => (log.error("Failed to show manage games menu: ", err), EMPTY))
            ))
        ).subscribe();

        messageHandler.messages$.pipe(
            filter((message): message is AppMessage.ShowAboutInfo => message.id === "app:showAboutInfo")
        ).subscribe(({ data }) => this.showAppAboutInfo(data));

        messageHandler.messages$.pipe(
            filter((message): message is AppMessage.ToggleModListColumn => message.id === "app:toggleModListColumn"),
            switchMap(({ data }) => {
                if (!!data.column) {
                    return this.toggleModListColumn(data.column);
                } else if (data.reset) {
                    return this.resetModListColumns();
                }

                return EMPTY;
            })
        ).subscribe();

        messageHandler.messages$.pipe(
            filter((message): message is AppMessage.ToggleLogPanel => message.id === "app:toggleLogPanel"),
            switchMap(() => {
                this.toggleLogPanel();
                return EMPTY;
            })
        ).subscribe();

        // Show a loading indicator when app is syncing mod files to base deployment dir
        this.isDeployInProgress$.pipe(
            distinctUntilChanged()
        ).subscribe((deployInProgress) => {
            if (deployInProgress && !deployInProgressOverlayRef) {
                deployInProgressOverlayRef = this.showLoadingIndicator("Syncing mods...");

                deployInProgressOverlayRef.onClose$.subscribe(() => deployInProgressOverlayRef = undefined);
            } else if (!!deployInProgressOverlayRef) {
                deployInProgressOverlayRef.close();
            }
        });
    }

    public openFile(path: string): Observable<ExternalFile> {
        return ElectronUtils.invoke("app:openFile", { path }).pipe(
            map((fileSource) => {
                const blob = new Blob([fileSource.data], { type: fileSource.mimeType });
                return {
                    ...fileSource,
                    blob,
                    url: URL.createObjectURL(blob)
                };
            })
        );
    }

    public getAppInfo(): Observable<AppInfo> {
        return ElectronUtils.invoke("app:getInfo", {});
    }

    public setPluginsEnabled(pluginsEnabled: boolean): Observable<void> {
        return this.store.dispatch(new AppActions.setPluginsEnabled(pluginsEnabled));
    }

    public showLoadingIndicator(loadingMsg: string): OverlayHelpersRef {
        return this.overlayHelpers.createFullScreen(AppModSyncIndicatorModal, {
            width: "auto",
            height: "auto",
            minHeight: "10%",
            centerHorizontally: true,
            centerVertically: false,
            hasBackdrop: true,
            disposeOnBackdropClick: false
        }, [[LOADING_MSG_TOKEN, loadingMsg]]);
    }

    public toggleModListColumn(column: string): Observable<void> {
        return this.store.dispatch(new AppActions.ToggleModListColumn(column));
    }

    public resetModListColumns(): Observable<void> {
        return this.store.dispatch(new AppActions.ResetModListColumns());
    }

    public toggleLogPanel(): Observable<void> {
        return this.store.dispatch(new AppActions.ToggleLogPanel());
    }

    public loadSettings(): Observable<AppSettingsUserCfg | null> {
        return runOnce(ElectronUtils.invoke("app:loadSettings", {}).pipe(
            switchMap((settings) => {
                if (settings) {
                    return this.store.dispatch(new AppActions.UpdateSettingsFromUserCfg(settings)).pipe(
                        map(() => settings)
                    );
                } else {
                    return of(settings);
                }
            })
        ));
    }

    public loadProfileList(): Observable<AppProfile.Description[]> {
        return runOnce(ElectronUtils.invoke("app:loadProfileList", {}).pipe(
            switchMap((profileList) => this.store.dispatch(new AppActions.SetProfiles(profileList)).pipe(
                map(() => profileList)
            ))
        ));
    }

    public saveSettings(): Observable<unknown> {
        return runOnce(this.appState$.pipe(
            take(1),
            map(appState => this.appDataToUserCfg(appState)),
            switchMap(settings => ElectronUtils.invoke("app:saveSettings", { settings })),
            switchMap(() => this.syncUiState())
        ));
    }

    public updateSettings(settings: Partial<AppData>): Observable<unknown> {
        return runOnce(this.store.dispatch(new AppActions.UpdateSettings(settings)).pipe(
            switchMap(() => this.saveSettings())
        ));
    }

    public updateGameDatabase(): Observable<GameDatabase> {
        return runOnce(ElectronUtils.invoke("app:loadGameDatabase", { includeCustomGames: false }).pipe(
            switchMap((gameDb) => {
                if (!!gameDb) {
                    return this.store.dispatch(new AppActions.updateGameDb(gameDb)).pipe(
                        map(() => gameDb)
                    );
                } else {
                    const errorText = "Unable to open game database file.";
                    this.dialogs.showNotice(errorText).subscribe();
                    return throwError(() => errorText);
                }
            })
        ));
    }

    public addCustomGame(gameId: GameId, gameDetails: GameDetails): Observable<unknown> {
        return this.updateCustomGame(gameId, gameDetails);
    }

    public updateCustomGame(gameId: GameId, gameDetails: GameDetails): Observable<unknown> {
        return this.store.dispatch(new AppActions.UpdateCustomGame(gameId, gameDetails));
    }

    public deleteCustomGame(gameId: GameId): Observable<unknown> {
        return this.store.dispatch(new AppActions.DeleteCustomGame(gameId));
    }

    public exportGame(gameDetails: GameDetails): Observable<unknown> {
        return runOnce(ElectronUtils.invoke("app:exportGame", { gameDetails }));
    }

    public readGame(): Observable<[GameId, GameDetails] | undefined> {
        return ElectronUtils.invoke("app:readGame", {});
    }

    public showAppWarnings(): Observable<unknown> {
        return runOnce(ElectronUtils.invoke("app:queryWarnings", {}).pipe(
            switchMap((appWarnings) => {
                const warnings: Array<keyof AppWarnings> = [];

                Object.entries(appWarnings).forEach(([warningId, warningState]) => {
                    if (warningState) {
                        warnings.push(warningId as keyof AppWarnings);
                    }
                });

                if (warnings.length > 0) {
                    return from(warnings).pipe(
                        concatMap((warning) => {
                            switch (warning) {
                                case "symlinksDisabled": return this.dialogs.showSymlinkWarningDialog();
                                case "normalizePathCaseRecommended": return this.dialogs.showNormalizePathCaseRecommendedDialog().pipe(
                                    filterTrue(),
                                    switchMap(() => this.store.dispatch(new AppActions.setNormalizePathCasing(true)))
                                )
                                default: return of(undefined);
                            }
                        }),
                        toArray()
                    );
                } else {
                    return EMPTY;
                }
            })
        ));
    }

    public showAppPreferences(): Observable<OverlayHelpersComponentRef<AppPreferencesModal>> {
        return runOnce(this.appState$.pipe(
            take(1),
            map((preferences) => {
                const modContextMenuRef = this.overlayHelpers.createFullScreen(AppPreferencesModal, {
                    center: true,
                    hasBackdrop: true,
                    disposeOnBackdropClick: false,
                    minWidth: "24rem",
                    width: "40%",
                    height: "auto",
                    maxHeight: "75%",
                    panelClass: "mat-app-background"
                });

                modContextMenuRef.component.instance.preferences = preferences;
                return modContextMenuRef;
            })
        ));
    }

    public showManageGames(): Observable<OverlayHelpersComponentRef<AppGameManagerModal>> {
        const modContextMenuRef = this.overlayHelpers.createFullScreen(AppGameManagerModal, {
            center: true,
            hasBackdrop: true,
            disposeOnBackdropClick: false,
            minWidth: "40rem",
            width: "80%",
            height: "auto",
            maxHeight: "85%",
            panelClass: "mat-app-background"
        });
        return of(modContextMenuRef);
    }

    public showAppAboutInfo(aboutData: AppInfo): void {
        this.overlayHelpers.createFullScreen(AppAboutInfoModal, {
            width: "50vw",
            height: "auto",
            maxHeight: "75vh",
            center: true,
            hasBackdrop: true,
            disposeOnBackdropClick: true,
            panelClass: "mat-app-background"
        }, [[APP_INFO_TOKEN, aboutData]]);
    }

    public resolveResourceUrl(resource: AppResource): Observable<string | undefined> {
        return ElectronUtils.invoke("app:resolveResourceUrl", { resource });
    }

    private syncUiState(): Observable<unknown> {
        return runOnce(this.appState$.pipe(
            take(1),
            switchMap((appState) => ElectronUtils.invoke("app:syncUiState", {
                appState,
                modListCols: AppData.DEFAULT_MOD_LIST_COLUMN_ORDER,
                defaultModListCols: AppData.DEFAULT_MOD_LIST_COLUMNS
            }))
        ));
    }

    private appDataToUserCfg(appData: AppData): AppSettingsUserCfg {
        return {
            activeProfile: appData.activeProfile ? AppProfile.asDescription(appData.activeProfile) : undefined,
            pluginsEnabled: appData.pluginsEnabled,
            normalizePathCasing: appData.normalizePathCasing,
            modListColumns: appData.modListColumns,
            verifyProfileOnStart: appData.verifyProfileOnStart,
            steamCompatDataRoot: appData.steamCompatDataRoot,
            logPanelEnabled: appData.logPanelEnabled,
            customGameDb: appData.customGameDb
        };
    }
}