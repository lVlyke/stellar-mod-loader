import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, Output, EventEmitter } from "@angular/core";
import { MatActionList, MatListItem } from "@angular/material/list";
import { MatIcon } from "@angular/material/icon";
import { MatLine } from "@angular/material/core";
import { ComponentState } from "@lithiumjs/angular";
import { Observable } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { ProfileManager } from "../../services/profile-manager";
import { DialogManager } from "../../services/dialog-manager";
import { AppDialogs } from "../../services/app-dialogs";
import { ModSection } from "../../models/mod-section";
import { filterTrue, runOnce } from "../../core/operators";

@Component({
    selector: "app-mod-section-actions",
    templateUrl: "./mod-section-actions.component.html",
    styleUrls: ["./mod-section-actions.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatActionList,
        MatListItem,
        MatLine,
        MatIcon
    ],
    providers: [
        ComponentState.create(AppModSectionActionsComponent),
    ]
})
export class AppModSectionActionsComponent extends BaseComponent {

    @Output("actionSelect")
    public readonly actionSelect$ = new EventEmitter<void>();

    @Input()
    public root!: boolean;

    @Input()
    public section!: ModSection;

    constructor(
        cdRef: ChangeDetectorRef,
        private readonly profileManager: ProfileManager,
        private readonly appDialogs: AppDialogs
    ) {
        super({ cdRef });
    }

    protected renameSection(): void {
        this.profileManager.updateModSectionFromUser(this.root, this.section);

        this.actionSelect$.emit();
    }

    protected updateMods(enabled: boolean): void {
        this.profileManager.updateModsInSection(this.root, this.section, enabled);

        this.actionSelect$.emit();
    }

    protected deleteSection(): Observable<unknown> {
        return runOnce(this.appDialogs.showDefault({
            prompt: "Are you sure you want to delete this section?",
            actions: [DialogManager.YES_ACTION, DialogManager.NO_ACTION_PRIMARY]
        }).pipe(
            filterTrue(),
            switchMap(() => this.profileManager.deleteModSection(this.root, this.section)),
            tap(() => this.actionSelect$.emit())
        ));
    }
}
