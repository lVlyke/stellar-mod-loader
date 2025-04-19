import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, InjectionToken } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { ComponentState } from "@lithiumjs/angular";
import { BaseComponent } from "../../core/base-component";
import { AppInfo } from "../../models/app-info";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";
import { AppExternalUrlComponent } from "../../components/external-url";

export const APP_SUPPORT_INFO_TOKEN = new InjectionToken<AppInfo>("APP_SUPPORT_INFO_TOKEN");

@Component({
    selector: "app-support-info-modal",
    templateUrl: "./app-support-info.modal.html",
    styleUrls: ["./app-support-info.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCardModule,
        MatButtonModule,

        AppExternalUrlComponent
    ],
    providers: [ComponentState.create(AppSupportInfoModal)]
})
export class AppSupportInfoModal extends BaseComponent {

    protected clickedSupportLink = false;
    
    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(APP_SUPPORT_INFO_TOKEN) protected readonly appInfo: AppInfo,
        @Inject(OverlayRefSymbol) protected readonly overlayRef: OverlayHelpersRef,
    ) {
        super({ cdRef });
    }
}
