import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, InjectionToken, Output } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { ComponentState } from "@lithiumjs/angular";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { BaseComponent } from "../../core/base-component";
import { AppExternalUrlComponent } from "../../components/external-url";
import { AppInfo } from "../../models/app-info";

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
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppVersionUpdateNoticeComponent.Config,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });
    }
}
