import { cloneDeep } from "es-toolkit";
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, ViewChild } from "@angular/core";
import { NgForm, FormsModule } from "@angular/forms";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatSelect } from "@angular/material/select";
import { MatOption } from "@angular/material/core";
import { MatInput } from "@angular/material/input";
import { ComponentState, ComponentStateRef, DeclareState, ManagedSubject } from "@lithiumjs/angular";
import { filter, switchMap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { AppData } from "../../models/app-data";
import { AppTheme } from "../../models/app-theme";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";

@Component({
    selector: "app-preferences",
    templateUrl: "./app-preferences.component.html",
    styleUrls: ["./app-preferences.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,

        MatCheckbox,
        MatIcon,
        MatTooltip,
        MatFormField,
        MatLabel,
        MatSelect,
        MatOption,
        MatInput
    ],
    providers: [
        ComponentState.create(AppPreferencesComponent),
    ]
})
export class AppPreferencesComponent extends BaseComponent {

    public readonly themes = AppTheme.values();
    public readonly onFormSubmit$ = new ManagedSubject<NgForm>(this);

    @Input()
    public preferences!: AppData;

    @ViewChild(NgForm)
    public readonly form!: NgForm;

    @DeclareState("formModel")
    private _formModel!: AppData;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppPreferencesComponent>,
        appManager: AppStateBehaviorManager
    ) {
        super({ cdRef });

        stateRef.get("preferences").subscribe((preferences) => {
            this._formModel = cloneDeep(preferences);
        });

        this.onFormSubmit$.pipe(
            filter(form => !!form.valid),
            switchMap(() => appManager.updateSettings(this.formModel))
        ).subscribe();
    }

    public get formModel(): AppData {
        return this._formModel;
    }
}
