import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, Output, EventEmitter } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatTooltip } from "@angular/material/tooltip";
import { ComponentState } from "@lithiumjs/angular";
import { BaseComponent } from "../../core/base-component";
import { DialogAction } from "../../services/dialog-manager.types";

@Component({
    selector: "app-dialog-actions",
    templateUrl: "./dialog-actions.component.html",
    styleUrls: ["./dialog-actions.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatButton,
        MatTooltip
    ],
    providers: [ComponentState.create(AppDialogActionsComponent)]
    
})
export class AppDialogActionsComponent extends BaseComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    @Input()
    public actions: DialogAction[] | undefined = [];

    constructor(cdRef: ChangeDetectorRef) {
        super({ cdRef });
    }
}
