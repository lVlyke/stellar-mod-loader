import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Inject,
    Output
} from "@angular/core";
import { ComponentState } from "@lithiumjs/angular";
import { FormsModule } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { BaseComponent } from "../../core/base-component";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";

export namespace AppModRenameDialog {

    export interface Config extends DialogConfig {
        modCurName: string;
    }
}

@Component({
    templateUrl: "./mod-rename-dialog.component.html",
    styleUrls: ["./mod-rename-dialog.component.scss"],
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
        ComponentState.create(AppModRenameDialog)
    ]
})
export class AppModRenameDialog extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppModRenameDialog.Config
    ) {
        super({ cdRef });
    }

    public get modName(): string {
        return this.dialogConfig.modCurName;
    }
}
