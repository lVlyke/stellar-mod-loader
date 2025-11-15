import { 
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Inject,
    Output,
    ViewChild
} from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { AsyncState, ComponentState, DeclareState } from "@lithiumjs/angular";
import { FormsModule, NgForm } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatIcon } from "@angular/material/icon";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatTooltip } from "@angular/material/tooltip";
import { MatFormField, MatLabel, MatSuffix } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatOption, MatSelect } from "@angular/material/select";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Store } from "@ngxs/store";
import { BaseComponent } from "../../core/base-component";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { AppGameTitlePipe } from "../../pipes";
import { AppProfile } from "../../models/app-profile";
import { GameAction } from "../../models/game-action";
import { AppState } from "../../state";
import { ProfileManager } from "../../services/profile-manager";
import { GameDatabase } from "../../models/game-database";
import { AppStateBehaviorManager } from "src/app/services/app-state-behavior-manager";

export namespace AppAddGameActionToSteamDialog {

    export interface Config extends DialogConfig {
        profile: AppProfile;
        gameAction: GameAction;
        gameActionIndex?: number | null;
        useGameCompatRootDefault?: boolean;
    }
}

@Component({
    templateUrl: "./add-game-action-to-steam-dialog.component.html",
    styleUrls: ["./add-game-action-to-steam-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,

        AsyncPipe,
        
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatCheckbox,
        MatIcon,
        MatTooltip,
        MatFormField,
        MatLabel,
        MatSuffix,
        MatInput,
        MatSelect,
        MatOption,

        AppDialogActionsComponent,
        AppGameTitlePipe
    ],
    providers: [
        ComponentState.create(AppAddGameActionToSteamDialog)
    ]
})
export class AppAddGameActionToSteamDialog extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    public readonly gameDb$: Observable<GameDatabase>;
    public readonly lastSteamUserId$: Observable<string | undefined>;
    public readonly isLinux$: Observable<boolean>;

    @AsyncState()
    public readonly gameDb!: GameDatabase;

    @AsyncState()
    public readonly lastSteamUserId!: string | undefined;

    @DeclareState()
    protected gameCompatRoot?: string;

    @DeclareState()
    protected activeSteamUserIds!: string[];

    @ViewChild(NgForm, { static: true })
    protected readonly form!: NgForm;

    constructor(
        cdRef: ChangeDetectorRef,
        store: Store,
        appManager: AppStateBehaviorManager,
        profileManager: ProfileManager,
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppAddGameActionToSteamDialog.Config
    ) {
        super({ cdRef });

        this.gameDb$ = store.select(AppState.getGameDb);
        this.lastSteamUserId$ = store.select(AppState.getLastSteamUserId);
        this.isLinux$ = appManager.getPlatform().pipe(
            map(platform => platform === "linux")
        );
        
        appManager.getActiveSteamUserIds().subscribe((activeSteamUserIds) => {
            this.activeSteamUserIds = activeSteamUserIds;
        });

        profileManager.resolveGameSteamCompatRoot(dialogConfig.profile).subscribe((compatRoot) => {
            this.gameCompatRoot = compatRoot;
        });
    }

    public get useGameCompatRoot(): boolean {
        return this.form.value["useGameCompatRoot"];
    }

    public get steamUserId(): string {
        return this.form.value["steamUserId"];
    }

    public get deleteAction(): boolean {
        return this.form.value["deleteAction"];
    }

    public get chosenGameCompatRoot(): string | undefined {
        return this.useGameCompatRoot ? this.gameCompatRoot : undefined;
    }
}
