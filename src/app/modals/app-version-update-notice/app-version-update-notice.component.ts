import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Output } from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatCheckbox } from "@angular/material/checkbox";
import { ComponentState } from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { Observable } from "rxjs";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { BaseComponent } from "../../core/base-component";
import { AppExternalUrlComponent } from "../../components/external-url";
import { AppInfo } from "../../models/app-info";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { AppData } from "../../models/app-data";
import { AppState } from "../../state";

export namespace AppVersionUpdateNoticeComponent {

    export interface Config extends DialogConfig {
        appInfo: AppInfo;
        appLatestVersion: string;
    }
}

@Component({
    templateUrl: "./app-version-update-notice.component.html",
    styleUrls: ["./app-version-update-notice.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,

        MatCard,
        MatCheckbox,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,

        AppDialogActionsComponent,
        AppExternalUrlComponent
    ],
    providers: [ComponentState.create(AppVersionUpdateNoticeComponent)]
})
export class AppVersionUpdateNoticeComponent extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    public readonly appData$: Observable<AppData>;

    constructor(
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppVersionUpdateNoticeComponent.Config,
        private readonly appManager: AppStateBehaviorManager,
        cdRef: ChangeDetectorRef,
        store: Store
    ) {
        super({ cdRef });

        this.appData$ = store.select(AppState.get);
    }

    protected updateCheckLatestVersionOnStart(checkLatestVersionOnStart: boolean): void {
        this.appManager.updateSettings({ checkLatestVersionOnStart });
    }
}
