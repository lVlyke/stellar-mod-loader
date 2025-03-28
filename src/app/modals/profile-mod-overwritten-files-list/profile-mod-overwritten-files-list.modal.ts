import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, InjectionToken } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { ComponentState } from "@lithiumjs/angular";
import { BaseComponent } from "../../core/base-component";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";
import { ModOverwriteFilesEntry } from "../../models/mod-overwrite-files";

export const MOD_NAME_TOKEN = new InjectionToken<string>("MOD_NAME_TOKEN");
export const OVERWRITTEN_FILES_TOKEN = new InjectionToken<ModOverwriteFilesEntry[]>("OVERWRITTEN_FILES_TOKEN");

@Component({
    selector: "app-profile-mod-overwritten-files-list-modal",
    templateUrl: "./profile-mod-overwritten-files-list.modal.html",
    styleUrls: ["./profile-mod-overwritten-files-list.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCardModule,
        MatButtonModule
    ],
    providers: [ComponentState.create(AppProfileModOverwrittenFilesListModal)]
})
export class AppProfileModOverwrittenFilesListModal extends BaseComponent {
    
    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(MOD_NAME_TOKEN) public readonly modName: string,
        @Inject(OVERWRITTEN_FILES_TOKEN) public readonly overwrittenFiles: ModOverwriteFilesEntry[],
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
    ) {
        super({ cdRef });
    }
}
