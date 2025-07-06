import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, InjectionToken, Output } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { ComponentState } from "@lithiumjs/angular";
import { DialogAction, DialogComponent, DIALOG_ACTIONS_TOKEN } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { BaseComponent } from "../../core/base-component";
import { AppExternalUrlComponent } from "../../components/external-url";
import { AppInfo } from "../../models/app-info";

export const APP_INFO_TOKEN = new InjectionToken<AppInfo>("APP_INFO_TOKEN");
export const APP_LATEST_VERSION_TOKEN = new InjectionToken<AppInfo>("APP_LATEST_VERSION_TOKEN");

@Component({
    templateUrl: "./app-version-update-notice.component.html",
    styleUrls: ["./app-version-update-notice.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCardModule,

        AppDialogActionsComponent,
        AppExternalUrlComponent
    ],
    providers: [ComponentState.create(AppVersionUpdateNoticeComponent)]
})
export class AppVersionUpdateNoticeComponent extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    constructor(
        @Inject(DIALOG_ACTIONS_TOKEN) public readonly actions: DialogAction[],
        @Inject(APP_INFO_TOKEN) protected readonly aboutData: AppInfo,
        @Inject(APP_LATEST_VERSION_TOKEN) protected readonly latestVersion: string,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });
    }
}
