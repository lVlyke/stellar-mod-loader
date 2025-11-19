import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Inject, ViewChild } from "@angular/core";
import { AfterViewInit, ComponentState, DeclareState, ManagedSubject } from "@lithiumjs/angular";
import { AsyncPipe } from "@angular/common";
import { FormsModule, NgForm } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardMdImage, MatCardSubtitle, MatCardTitle } from "@angular/material/card";
import { MatButton } from "@angular/material/button";
import { MatDivider } from "@angular/material/divider";
import { MatIcon } from "@angular/material/icon";
import { EMPTY, Observable, of } from "rxjs";
import { filter, switchMap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";
import { AppModInstallerComponent } from "../../components/mod-installer";
import { ModImportRequest } from "../../models/mod-import-status";
import { DialogManager } from "../../services/dialog-manager";
import { AppDialogs } from "../../services/app-dialogs";
import { AppExternalUrlComponent } from "../../components/external-url";
import { AppModImportRequestImagePipe } from "../../pipes";

@Component({
    templateUrl: "./mod-installer.modal.html",
    styleUrls: ["./mod-installer.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,

        FormsModule,

        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardSubtitle,
        MatCardContent,
        MatCardActions,
        MatCardMdImage,
        MatButton,
        MatDivider,
        MatIcon,

        AppModInstallerComponent,
        AppExternalUrlComponent,
        AppModImportRequestImagePipe
    ],
    providers: [
        ComponentState.create(AppModInstallerModal),
    ]
})
export class AppModInstallerModal extends BaseComponent {

    public readonly onFormSubmit$ = new ManagedSubject<NgForm>(this);

    @DeclareState()
    public importRequest!: ModImportRequest;

    @ViewChild(AppModInstallerComponent)
    public readonly installerComponent!: AppModInstallerComponent;

    @AfterViewInit()
    public readonly afterViewInit$!: Observable<void>;

    constructor(
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
        appDialogs: AppDialogs,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });

        this.afterViewInit$.pipe(
            switchMap(() => this.installerComponent.onFormSubmit$),
            filter(form => !!form.valid),
            switchMap((form) => {
                // Make sure at least one file is selected for install
                if (Object.keys(this.importRequest.modFilePathMapFilter ?? {}).length > 0) {
                    return of(form);
                } else {
                    return appDialogs.showDefault({
                        prompt: "No files are active for this mod. Do you want to install it anyway?",
                        actions: [DialogManager.YES_ACTION, DialogManager.NO_ACTION_PRIMARY]
                    }).pipe(switchMap(continueInstall => continueInstall ? of(form) : EMPTY));
                }
            })
        ).subscribe((form) => {
            this.onFormSubmit$.next(form);
            overlayRef.close();
        });
    }

    protected cancelAndManuallyInstall(): void {
        this.importRequest.importStatus = "MANUALINSTALL";

        this.overlayRef.close().subscribe(() => {
            delete this.importRequest.modFilePathMapFilter;
        });
    }
}
