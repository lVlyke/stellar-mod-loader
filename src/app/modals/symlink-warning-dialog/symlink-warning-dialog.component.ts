import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Output } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { Observable } from "rxjs";
import { AsyncState, ComponentState } from "@lithiumjs/angular";
import { DialogAction, DialogComponent, DIALOG_ACTIONS_TOKEN } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { AppInfo } from "../../models/app-info";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";

@Component({
    templateUrl: "./symlink-warning-dialog.component.html",
    styleUrls: ["./symlink-warning-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCardModule,
        MatButtonModule,
        
        AppDialogActionsComponent
    ],
    providers: [ComponentState.create(AppSymlinkWarningDialog)]
})
export class AppSymlinkWarningDialog implements DialogComponent {

    public readonly appInfo$: Observable<AppInfo>;

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    @AsyncState()
    public readonly appInfo!: AppInfo;

    constructor(
        @Inject(DIALOG_ACTIONS_TOKEN) public readonly actions: DialogAction[],
        appManager: AppStateBehaviorManager
    ) {
        this.appInfo$ = appManager.getAppInfo();
    }
}
