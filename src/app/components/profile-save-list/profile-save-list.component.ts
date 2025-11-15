import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { Observable } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import { ComponentState, ComponentStateRef } from "@lithiumjs/angular";
import { NgxVirtualScrollModule } from "@lithiumjs/ngx-virtual-scroll";
import { BaseComponent } from "../../core/base-component";
import { AppProfile } from "../../models/app-profile";
import { AppDialogs } from "../../services/app-dialogs";
import { ProfileManager } from "../../services/profile-manager";
import { DialogManager } from "../../services/dialog-manager";
import { filterDefined, filterTrue, runOnce } from "../../core/operators";

@Component({
    selector: "app-profile-save-list",
    templateUrl: "./profile-save-list.component.html",
    styleUrls: ["./profile-save-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        DatePipe,

        MatCardModule,
        MatIconModule,

        NgxVirtualScrollModule
    ],
    providers: [ComponentState.create(AppProfileSaveListComponent)],
})
export class AppProfileSaveListComponent extends BaseComponent {

    @Input()
    public profile!: AppProfile;

    protected profileSaves: AppProfile.Save[] = [];

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppProfileSaveListComponent>,
        private readonly profileManager: ProfileManager,
        private readonly dialogs: AppDialogs
    ) {
        super({ cdRef });

        stateRef.get("profile").pipe(
            filterDefined(),
            switchMap(() => this.refresh())
        ).subscribe();
    }

    public refresh(): Observable<AppProfile.Save[]> {
        return runOnce(this.profileManager.readSaveFiles(this.profile).pipe(
            tap(profileSaves => this.profileSaves = profileSaves)
        ));
    }

    protected deleteSaveFile(save: AppProfile.Save): Observable<unknown> {
        return runOnce(this.dialogs.showDefault({
            prompt: "Are you sure you want to delete this save file?",
            actions: [DialogManager.YES_ACTION, DialogManager.NO_ACTION_PRIMARY]
        }).pipe(
            filterTrue(),
            switchMap(() => this.profileManager.deleteSaveFile(this.profile, save)),
            switchMap(() => this.refresh())
        ));
    }
}
