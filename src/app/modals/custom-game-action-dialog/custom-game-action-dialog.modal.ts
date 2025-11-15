import { cloneDeep } from "es-toolkit";
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component, 
    EventEmitter,
    Inject,
    InjectionToken,
    Optional,
    Output
} from "@angular/core";
import { ComponentState } from "@lithiumjs/angular";
import { AsyncPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatOption, MatSelect } from "@angular/material/select";
import { MatIconButton } from "@angular/material/button";
import { filter } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { GameAction, GameActionType } from "../../models/game-action";
import { ProfileManager } from "../../services/profile-manager";
import { AppProfile } from "../../models/app-profile";
import { DialogManager } from "../../services/dialog-manager";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";

export namespace AppCustomGameActionDialog {

    export interface Config extends DialogConfig {
        profile: AppProfile;
        gameAction?: GameAction;
        gameActionIndex?: number | null;
    }
}

@Component({
    templateUrl: "./custom-game-action-dialog.modal.html",
    styleUrls: ["./custom-game-action-dialog.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,

        FormsModule,

        MatCard,
        MatCardActions,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatFormField,
        MatInput,
        MatLabel,
        MatCheckbox,
        MatIcon,
        MatIconButton,
        MatTooltip,
        MatSelect,
        MatOption,

        AppDialogActionsComponent
    ],
    providers: [
        ComponentState.create(AppCustomGameActionDialog)
    ]
})
export class AppCustomGameActionDialog extends BaseComponent implements DialogComponent {

    public readonly GameActionType = GameActionType;
    public readonly PLACEHOLDER_ENV_VAR: Readonly<GameAction.EnvironmentVariable> = {
        key: "",
        value: "",
        enabled: true
    };
    

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    public gameAction: GameAction = AppCustomGameActionDialog.DEFAULT_GAME_ACTION();

    protected readonly negativeActions: DialogAction[];

    constructor(
        cdRef: ChangeDetectorRef,
        private readonly appManager: AppStateBehaviorManager,
        private readonly profileManager: ProfileManager,
        private readonly dialogManager: DialogManager,
        @Inject(OverlayRefSymbol) protected readonly overlayRef: OverlayHelpersRef,
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppCustomGameActionDialog.Config
    ) {
        super({ cdRef });

        this.negativeActions = DialogManager.negative(dialogConfig.actions!);

        if (dialogConfig.gameAction) {
            this.gameAction = cloneDeep(dialogConfig.gameAction);
        }
    }

    protected addEnvironmentVariable(key: string, value: string, enabled: boolean = true): void {
        const environment = this.gameAction.environment ?? [];
        environment.push({ key, value, enabled });

        this.gameAction = { ...this.gameAction, environment };
    }

    protected updateEnvironmentVariableKey(envVar: GameAction.EnvironmentVariable, newKey: string): void {
        if (envVar === this.PLACEHOLDER_ENV_VAR) {
            return this.addEnvironmentVariable(newKey, "");
        }

        envVar.key = newKey;

        this.gameAction = { ...this.gameAction };
    }

    protected updateEnvironmentVariableValue(envVar: GameAction.EnvironmentVariable, newValue: string): void {
        if (envVar === this.PLACEHOLDER_ENV_VAR) {
            return this.addEnvironmentVariable("", newValue);
        }

        envVar.value = newValue;

        this.gameAction = { ...this.gameAction };
    }

    protected updateEnvironmentVariableState(envVar: GameAction.EnvironmentVariable, newState: boolean): void {
        if (envVar === this.PLACEHOLDER_ENV_VAR) {
            return this.addEnvironmentVariable("", "", newState);
        }

        envVar.enabled = newState;

        this.gameAction = { ...this.gameAction };
    }

    protected addActionToSteamLibrary(): void {
        this.profileManager.addGameActionToSteamFromUser(
            this.dialogConfig.profile,
            this.gameAction,
            this.dialogConfig.gameActionIndex
        ).subscribe(() => this.overlayRef.close());
    }

    protected removeAction(): void {
        if (this.dialogConfig.gameActionIndex !== null && this.dialogConfig.gameActionIndex !== undefined) {
            const gameActionIndex = this.dialogConfig.gameActionIndex;

            this.dialogManager.createDefault({
                prompt: "Are you sure you want to delete this action?",
                actions: [
                    DialogManager.YES_ACTION,
                    DialogManager.NO_ACTION_PRIMARY
                ]
            }).pipe(
                filter(action => action === DialogManager.YES_ACTION)
            ).subscribe(() => {
                this.profileManager.removeCustomGameActionByIndex(gameActionIndex);
                this.overlayRef.close();
            });
        }
    }

    private static DEFAULT_GAME_ACTION(): GameAction {
        return {
            name: "",
            actionType: GameActionType.SCRIPT,
            actionData: ""
        };
    }
}
