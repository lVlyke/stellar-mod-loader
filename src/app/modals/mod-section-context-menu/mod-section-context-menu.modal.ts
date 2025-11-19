import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Inject } from "@angular/core";
import { MatCard, MatCardContent } from "@angular/material/card";
import { BasePage } from "../../core/base-page";
import { ComponentState, DeclareState } from "@lithiumjs/angular";
import { OverlayRefSymbol, OverlayHelpersRef } from "../../services/overlay-helpers";
import { AppModSectionActionsComponent } from "../../components/mod-section-actions";
import { ModSection } from "../../models/mod-section";

@Component({
    templateUrl: "./mod-section-context-menu.modal.html",
    styleUrls: ["./mod-section-context-menu.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatCard,
        MatCardContent,
        
        AppModSectionActionsComponent
    ],
    providers: [
        ComponentState.create(AppModSectionContextMenuModal)
    ]
})
export class AppModSectionContextMenuModal extends BasePage {

    @DeclareState()
    public root!: boolean;

    @DeclareState()
    public section!: ModSection;

    constructor(
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });
    }
}
