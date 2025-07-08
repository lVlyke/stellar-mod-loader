import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Inject, ViewChild } from "@angular/core";
import { ComponentState, ComponentStateRef, DeclareState } from "@lithiumjs/angular";
import { AsyncPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatDividerModule } from "@angular/material/divider";
import { Observable } from "rxjs";
import { delay, share, switchMap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { filterDefined } from "../../core/operators";
import { AppProfile } from "../../models/app-profile";
import { AppProfileSettingsComponent } from "../../components/profile-settings";
import { OverlayHelpersRef, OverlayRefSymbol } from "../../services/overlay-helpers";
import { GameInstallation } from "../../models/game-installation";

@Component({
    templateUrl: "./profile-settings.modal.html",
    styleUrls: ["./profile-settings.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AsyncPipe,
        FormsModule,
        
        MatCardModule,
        MatButtonModule,
        MatDividerModule,

        AppProfileSettingsComponent
    ],
    providers: [
        ComponentState.create(AppProfileSettingsModal),
    ]
})
export class AppProfileSettingsModal extends BaseComponent {

    public readonly onFormSubmit$!: Observable<AppProfile>;
    public readonly formModel$!: Observable<Partial<AppProfile.Form>>;

    @DeclareState()
    public profile!: Partial<AppProfile>;

    @DeclareState()
    public createMode = false;

    @DeclareState()
    public copyMode = false;

    @DeclareState()
    public remedyMode: keyof AppProfile | keyof GameInstallation | false = false;

    @ViewChild(AppProfileSettingsComponent, { static: true })
    public readonly profileSettingsComponent!: AppProfileSettingsComponent;

    constructor(
        @Inject(OverlayRefSymbol) public readonly overlayRef: OverlayHelpersRef,
        stateRef: ComponentStateRef<AppProfileSettingsModal>,
        cdRef: ChangeDetectorRef
    ) {
        super({ cdRef });

        const profileSettingsComponent$ = stateRef.get("profileSettingsComponent").pipe(
            filterDefined()
        );

        this.onFormSubmit$ = profileSettingsComponent$.pipe(
            switchMap(profileSettingsComponent => profileSettingsComponent.onFormSubmit$),
            this.managedSource(),
            share()
        );

        this.formModel$ = profileSettingsComponent$.pipe(
            switchMap(profileSettingsComponent => profileSettingsComponent.formModel$)
        );

        this.onFormSubmit$.pipe(
            delay(0)
        ).subscribe(() => overlayRef.close());
    }
}
