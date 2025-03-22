import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ContentChild,
    EventEmitter,
    forwardRef,
    Input,
    Output,
    ViewChild
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import {
    ControlValueAccessor,
    NG_VALUE_ACCESSOR,
    FormsModule,
    NG_VALIDATORS,
    Validator,
    FormControl,
    ValidationErrors
} from "@angular/forms";
import { MatInput } from "@angular/material/input";
import { MatOption, MatSelect, MatSelectTrigger } from "@angular/material/select";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { ComponentState, ComponentStateRef, DeclareState } from "@lithiumjs/angular";
import { BaseComponent } from "../../core/base-component";
import { AppSelectEditControls } from "./select-edit-controls.directive";

@Component({
    selector: "app-select-edit",
    templateUrl: "./select-edit.component.html",
    styleUrls: ["./select-edit.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        NgTemplateOutlet,
        FormsModule,

        MatFormField,
        MatInput,
        MatLabel,
        MatSelect,
        MatSelectTrigger,
        MatOption,
        MatIconButton,
        MatIcon,
        MatTooltip
    ],
    providers: [
        ComponentState.create(AppSelectEditComponent),
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => AppSelectEditComponent),
            multi: true
        },
        {
            provide: NG_VALIDATORS,
            useExisting: forwardRef(() => AppSelectEditComponent),
            multi: true
        }
    ]
})
export class AppSelectEditComponent<T> extends BaseComponent implements ControlValueAccessor, Validator {

    @Output("valueChange")
    public readonly valueChange$: EventEmitter<T[]>;

    @Output("entryChange")
    public readonly entryChange$ = new EventEmitter<[number, T]>();

    @Output("checked")
    public readonly checked$ = new EventEmitter<void>();

    @Output("unchecked")
    public readonly unchecked$ = new EventEmitter<void>();

    @Input()
    public value: T[] = [];

    @Input()
    public selectedValueIndex = 0;

    @Input()
    @DeclareState()
    public valueField?: keyof T;

    @Input()
    @DeclareState()
    public valueIdentity?: T;

    @Input()
    public label: string = "";

    @Input()
    public required = false;

    @Input()
    public resizable = false;

    @Input()
    public disabled = false;

    @ContentChild(AppSelectEditControls)
    @DeclareState()
    public editControls?: AppSelectEditControls<T>;

    @ViewChild("valueSelect", { static: true })
    protected valueSelect!: MatSelect;

    constructor(
        cdRef: ChangeDetectorRef,
        private readonly stateRef: ComponentStateRef<AppSelectEditComponent<T>>
    ) {
        super({ cdRef });

        this.valueChange$ = stateRef.emitter("value");
    }

    public addEntry(value?: T): void {
        this.value.push(value ?? this.valueIdentity!);
        this.valueChange$.emit(this.value);

        // Update the select to focus the new value
        this.selectedValueIndex = this.value.length - 1;
        this.valueSelect.value = undefined;
        this.valueSelect.value = this.selectedValueIndex;
    }

    public deleteEntry(entryIndex: number): void {
        this.value.splice(entryIndex, 1);
        this.valueChange$.emit(this.value);
    }

    public writeValue(value: T[] | null): void {
        this.value = value ?? [];
    }

    public registerOnChange(fn: (value: T[]) => void): void {
        this.valueChange$.subscribe(fn);
    }

    public registerOnTouched(fn: any): void {
    }

    public validate(_control: FormControl): ValidationErrors | null {
        const invalid = this.value ? this.value.some(value => this.validateValue(value)) : this.required;
        return invalid ? { invalid: true } : null;
    }

    private validateValue(value: any): boolean {
        if (typeof value === "object") {
            return Object.values(value!).some(subVal => this.validateValue(subVal))
        } else {
            return value === "" || value === null || value === undefined;
        }
    }
}

export namespace AppValueCheckboxComponent {

    export type Value<T> = [T, boolean];
}