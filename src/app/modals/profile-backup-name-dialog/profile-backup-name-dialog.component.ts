import { 
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Inject,
    LOCALE_ID,
    Output
} from "@angular/core";
import { ComponentState, DeclareState } from "@lithiumjs/angular";
import { formatDate } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { BaseComponent } from "../../core/base-component";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";

export namespace AppProfileBackupNameDialog {

    export interface Config extends DialogConfig {
        backupName?: string;
    }
}

@Component({
    templateUrl: "./profile-backup-name-dialog.component.html",
    styleUrls: ["./profile-backup-name-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,
        
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatFormField,
        MatLabel,
        MatInput,

        AppDialogActionsComponent
    ],
    providers: [
        ComponentState.create(AppProfileBackupNameDialog)
    ]
})
export class AppProfileBackupNameDialog extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    @DeclareState()
    protected _backupName: string;

    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(LOCALE_ID) private readonly locale: string,
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppProfileBackupNameDialog.Config
    ) {
        super({ cdRef });

        this._backupName = dialogConfig.backupName ?? this.defaultName;
    }

    public get backupName(): string {
        return this._backupName || this.defaultName;
    }

    protected get defaultName(): string {
        return formatDate(new Date(), "medium", this.locale)!;
    }
}
