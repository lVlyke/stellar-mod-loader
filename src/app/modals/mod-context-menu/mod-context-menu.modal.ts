import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Inject } from "@angular/core";
import { MatCard, MatCardContent } from "@angular/material/card";
import { BasePage } from "../../core/base-page";
import { ComponentState, DeclareState } from "@lithiumjs/angular";
import { OverlayRefSymbol, OverlayHelpersRef } from "../../services/overlay-helpers";
import { ModProfileRef } from "../../models/mod-profile-ref";
import { AppModActionsComponent } from "../../components/mod-actions";

@Component({
    templateUrl: "./mod-context-menu.modal.html",
    styleUrls: ["./mod-context-menu.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardContent,

        AppModActionsComponent
    ],
    providers: [
        ComponentState.create(AppModContextMenuModal)
    ]
})
export class AppModContextMenuModal extends BasePage {

    @DeclareState()
    public root!: boolean;

    @DeclareState()
    public modName!: string;

    @DeclareState()
    public modRef!: ModProfileRef;

    constructor(
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });
    }
}
