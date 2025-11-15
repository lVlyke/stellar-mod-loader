import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Inject,
    Output,
    SecurityContext
} from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { ComponentState, ComponentStateRef } from "@lithiumjs/angular";
import {
    DialogAction,
    DialogComponent,
    DialogConfig,
    DIALOG_CONFIG_TOKEN
} from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { BaseComponent } from "../../core/base-component";

@Component({
    templateUrl: "./default-dialog-modal.component.html",
    styleUrls: ["./default-dialog-modal.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,

        AppDialogActionsComponent
    ],
    providers: [ComponentState.create(AppDefaultDialogComponent)]
})
export class AppDefaultDialogComponent extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    protected renderedPrompt: string | SafeHtml | null = null;

    constructor(
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: DialogConfig,
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppDefaultDialogComponent>,
        domSanitizer: DomSanitizer
    ) {
        super({ cdRef });

        stateRef.get("dialogConfig").subscribe(({ prompt }) => {
            this.renderedPrompt = domSanitizer.sanitize(SecurityContext.HTML, prompt ?? "");
        });
    }
}
