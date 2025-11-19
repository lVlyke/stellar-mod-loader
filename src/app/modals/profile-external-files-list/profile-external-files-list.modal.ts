import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, InjectionToken } from "@angular/core";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatButton } from "@angular/material/button";
import { ComponentState } from "@lithiumjs/angular";
import { BaseComponent } from "../../core/base-component";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";

export const FILE_LIST_TOKEN = new InjectionToken<string[]>("FILE_LIST");

@Component({
    selector: "app-profile-external-files-list-modal",
    templateUrl: "./profile-external-files-list.modal.html",
    styleUrls: ["./profile-external-files-list.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatButton
    ],
    providers: [ComponentState.create(AppProfileExternalFilesListModal)]
})
export class AppProfileExternalFilesListModal extends BaseComponent {
    
    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(FILE_LIST_TOKEN) public readonly fileList: string[],
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
    ) {
        super({ cdRef });
    }
}
