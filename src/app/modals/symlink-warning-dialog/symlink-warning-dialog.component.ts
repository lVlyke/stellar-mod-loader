import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Output } from "@angular/core";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { Observable } from "rxjs";
import { AsyncState, ComponentState } from "@lithiumjs/angular";
import { DIALOG_CONFIG_TOKEN, DialogAction, DialogComponent, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { AppInfo } from "../../models/app-info";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { BaseComponent } from "../../core/base-component";

@Component({
    templateUrl: "./symlink-warning-dialog.component.html",
    styleUrls: ["./symlink-warning-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        
        AppDialogActionsComponent
    ],
    providers: [ComponentState.create(AppSymlinkWarningDialog)]
})
export class AppSymlinkWarningDialog extends BaseComponent implements DialogComponent {

    public readonly appInfo$: Observable<AppInfo>;

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    @AsyncState()
    public readonly appInfo!: AppInfo;

    constructor(
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: DialogConfig,
        cdRef: ChangeDetectorRef,
        appManager: AppStateBehaviorManager
    ) {
        super({ cdRef });

        this.appInfo$ = appManager.getAppInfo();
    }
}
