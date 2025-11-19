import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, InjectionToken } from "@angular/core";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatIcon } from "@angular/material/icon";
import { BaseComponent } from "../../core/base-component";

export const LOADING_MSG_TOKEN = new InjectionToken<string>("LOADING_MSG");

@Component({
    templateUrl: "./loading-indicator.modal.html",
    styleUrls: ["./loading-indicator.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardContent,
        MatIcon
    ]
})
export class AppModSyncIndicatorModal extends BaseComponent {

    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(LOADING_MSG_TOKEN) public readonly loadingMsg: string
    ) {
        super({ cdRef });
    }
}
