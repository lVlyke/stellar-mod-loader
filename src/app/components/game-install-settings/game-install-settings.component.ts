import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Input,
    ViewChild,
    forwardRef,
    Output,
    EventEmitter
} from "@angular/core";
import {
    NgForm,
    FormsModule,
    NG_VALUE_ACCESSOR,
    ControlValueAccessor,
    NG_VALIDATORS,
    Validator, 
    FormControl,
    ValidationErrors
} from "@angular/forms";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { ComponentState, ComponentStateRef } from "@lithiumjs/angular";
import { filter } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { GameInstallation } from "../../models/game-installation";
import { AppGameInstallFieldsPipe } from "./game-install-fields.pipe";
import { AppProfileFormFieldComponent } from "../profile-form-field";
import { AppProfileFormFieldInput } from "../../models/app-profile-form-field";
import { AppSelectEditComponent } from "../select-edit";

@Component({
    selector: "app-game-install-settings",
    templateUrl: "./game-install-settings.component.html",
    styleUrls: ["./game-install-settings.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,

        MatFormField,
        MatInput,
        MatLabel,
        
        AppProfileFormFieldComponent,
        AppSelectEditComponent,
        AppGameInstallFieldsPipe,
    ],
    providers: [
        ComponentState.create(AppGameInstallSettingsComponent),
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => AppGameInstallSettingsComponent),
            multi: true
        },
        {
            provide: NG_VALIDATORS,
            useExisting: forwardRef(() => AppGameInstallSettingsComponent),
            multi: true
        }
    ]
})
export class AppGameInstallSettingsComponent extends BaseComponent implements ControlValueAccessor, Validator {

    @Output("valueChange")
    public readonly valueChange$: EventEmitter<Partial<GameInstallation>>;

    @ViewChild(NgForm, { static: true })
    public readonly form!: NgForm;

    @Input()
    public value: Partial<GameInstallation> = {};

    @Input()
    public custom: boolean = false;

    @Input()
    public disabled: boolean = false;

    @Input()
    public fieldInput?: AppProfileFormFieldInput | null;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppGameInstallSettingsComponent>
    ) {
        super({ cdRef });

        this.valueChange$ = stateRef.emitter("value");
    }

    public writeValue(value: GameInstallation | null | undefined): void {
        this.value = value ?? {};
    }

    public registerOnChange(fn: (value: Partial<GameInstallation>) => void): void {
        this.valueChange$.subscribe(fn);
    }

    public registerOnTouched(fn: any): void {
        this.valueChange$.pipe(
            filter(() => !!this.form.touched)
        ).subscribe(fn);
    }

    public validate(_control: FormControl): ValidationErrors | null {
        return this.form.status === "VALID" || this.form.status === "DISABLED"
            ? null
            : { invalid: true };
    }
}
