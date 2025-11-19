import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Inject, ViewChild } from "@angular/core";
import { ComponentState } from "@lithiumjs/angular";
import { AsyncPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatButton } from "@angular/material/button";
import { MatDivider } from "@angular/material/divider";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Observable, of } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";
import { AppGameManagerComponent } from "../../components/game-manager";
import { filterTrue, runOnce } from "../../core/operators";
import { AppDialogs } from "../../services/app-dialogs";
import { DialogManager } from "../../services/dialog-manager";

@Component({
    templateUrl: "./game-manager.modal.html",
    styleUrls: ["./game-manager.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        
        FormsModule,

        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatButton,
        MatDivider,

        AppGameManagerComponent
    ],
    providers: [
        ComponentState.create(AppGameManagerModal),
    ]
})
export class AppGameManagerModal extends BaseComponent {

    @ViewChild(AppGameManagerComponent, { static: true })
    public readonly appGameManagerComponent!: AppGameManagerComponent;

    constructor(
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
        private readonly snackbar: MatSnackBar,
        private readonly appDialogs: AppDialogs,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });
    }

    public saveActiveChanges(): Observable<unknown> {
        return runOnce(this.appGameManagerComponent.saveActiveChanges().pipe(
            tap(() => this.snackbar.open(
                `Game "${this.appGameManagerComponent.activeGameDetails?.title}" has been updated.`,
                undefined,
                { duration: 5000 }
            ))
        ));
    }

    public verifyDone(): Observable<unknown> {
        return runOnce(this.appGameManagerComponent.hasUnsavedChanges().pipe(
            switchMap((hasUnsavedChanges) => {
                if (hasUnsavedChanges) {
                    return runOnce(this.appDialogs.showDefault({
                        prompt: "Discard unsaved changes?",
                        actions: [DialogManager.OK_ACTION, DialogManager.CANCEL_ACTION_PRIMARY]
                    }).pipe(
                        filterTrue(),
                        tap(() => this.overlayRef.close())
                    ));
                } else {
                    return of(this.overlayRef.close());
                }
            })
        ));
    }
}
