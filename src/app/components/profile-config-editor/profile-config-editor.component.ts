import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, EventEmitter, Output } from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { AbstractControl, FormsModule } from "@angular/forms";
import { MatFormField } from "@angular/material/form-field";
import { MatSelect, MatSelectTrigger } from "@angular/material/select";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatOption } from "@angular/material/core";
import { MatIconButton, MatButton } from "@angular/material/button";
import { Observable, combineLatest } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import { AsyncState, ComponentState, ComponentStateRef, DeclareState } from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { AppState } from "../../state";
import { BaseComponent } from "../../core/base-component";
import { GameDetails } from "../../models/game-details";
import { GameDatabase } from "../../models/game-database";
import { GameId } from "../../models/game-id";
import { AppProfile } from "../../models/app-profile";
import { filterTrue, runOnce } from "../../core/operators";
import { ProfileManager } from "../../services/profile-manager";
import { DialogManager } from "../../services/dialog-manager";
import { AppDialogs } from "../../services/app-dialogs";
import { AppProfileConfigFilePipe } from "../../pipes/profile-config-file.pipe";

@Component({
    selector: "app-profile-config-editor",
    templateUrl: "./profile-config-editor.component.html",
    styleUrls: ["./profile-config-editor.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        FormsModule,

        MatFormField,
        MatSelect,
        MatSelectTrigger,
        MatIcon,
        MatTooltip,
        MatOption,
        MatIconButton,
        MatButton, 
        
        AppProfileConfigFilePipe
    ],
    providers: [ComponentState.create(AppProfileConfigEditorComponent)]
})
export class AppProfileConfigEditorComponent extends BaseComponent {

    public readonly gameDb$: Observable<GameDatabase>;

    @Output("configFileUpdate")
    public readonly configFileUpdate$: EventEmitter<Date>;

    @AsyncState()
    public readonly gameDb!: GameDatabase;

    @Input()
    public profile!: AppProfile;
    
    @DeclareState()
    protected gameDetails?: GameDetails;

    @DeclareState()
    protected gameConfigFiles: string[] = [];

    @DeclareState("lastUpdateDate")
    private _lastUpdateDate = new Date();

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppProfileConfigEditorComponent>,
        store: Store,
        private readonly profileManager: ProfileManager,
        private readonly dialogs: AppDialogs
    ) {
        super({ cdRef });

        this.gameDb$ = store.select(AppState.getGameDb);
        this.configFileUpdate$ = stateRef.emitter("lastUpdateDate");

        combineLatest(stateRef.getAll("profile", "gameDb")).subscribe(([profile, gameDb]) => {
            this.gameDetails = profile ? gameDb[profile.gameId] : gameDb[GameId.UNKNOWN];
            this.gameConfigFiles = this.gameDetails.gameConfigFiles ?? [];
        });
    }

    public get lastUpdateDate(): Date {
        return this._lastUpdateDate;
    }

    protected updateConfigFile(fileName: string, data: string): Observable<unknown> {
        return runOnce(this.profileManager.updateConfigFile(this.profile, fileName, data).pipe(
            tap(() => this.markConfigUpdated())
        ));
    }

    protected reloadConfigFile(fileName: string, control: AbstractControl): Observable<unknown> {
        return runOnce(this.profileManager.readConfigFile(this.profile, fileName, true).pipe(
            tap(fileData => control.setValue(fileData)),
            tap(() => this.markConfigUpdated())
        ));
    }

    protected openConfigFile(fileName: string): Observable<unknown> {
        return this.profileManager.openProfileConfigFile(fileName);
    }

    protected deleteConfigFile(fileName: string): Observable<unknown> {
        return runOnce(this.dialogs.showDefault({
            prompt: "Are you sure you want to delete this config file?",
            actions: [DialogManager.YES_ACTION, DialogManager.NO_ACTION_PRIMARY]
        }).pipe(
            filterTrue(),
            switchMap(() => this.profileManager.deleteProfileConfigFile(fileName))
        ));
    }

    private markConfigUpdated(date = new Date()): void {
        this._lastUpdateDate = date;
    }
}
