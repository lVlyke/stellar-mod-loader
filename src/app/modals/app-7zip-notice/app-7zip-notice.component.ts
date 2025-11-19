import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Output } from "@angular/core";
import { MatCard, MatCardActions, MatCardContent } from "@angular/material/card";
import { ComponentState } from "@lithiumjs/angular";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { BaseComponent } from "../../core/base-component";
import { AppExternalUrlComponent } from "../../components/external-url";

@Component({
    templateUrl: "./app-7zip-notice.component.html",
    styleUrls: ["./app-7zip-notice.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardContent,
        MatCardActions,

        AppDialogActionsComponent,
        AppExternalUrlComponent
    ],
    providers: [ComponentState.create(App7ZipNoticeComponent)]
})
export class App7ZipNoticeComponent extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    constructor(
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: DialogConfig,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });
    }
}
