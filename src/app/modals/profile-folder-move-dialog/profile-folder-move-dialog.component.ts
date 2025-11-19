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
import { MatCheckbox } from "@angular/material/checkbox";
import { BaseComponent } from "../../core/base-component";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
export namespace AppProfileFolderMoveDialog {

    export interface Config extends DialogConfig {
        oldPath: string;
        newPath: string;
    }
}

@Component({
    templateUrl: "./profile-folder-move-dialog.component.html",
    styleUrls: ["./profile-folder-move-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,
        
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatCheckbox,

        AppDialogActionsComponent
    ],
    providers: [
        ComponentState.create(AppProfileFolderMoveDialog)
    ]
})
export class AppProfileFolderMoveDialog extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    public overwrite = false;
    public keepExisting = false;

    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppProfileFolderMoveDialog.Config,
    ) {
        super({ cdRef });
    }
}
