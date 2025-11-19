import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Output } from "@angular/core";
import { ComponentState } from "@lithiumjs/angular";
import { FormsModule } from "@angular/forms";
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from "@angular/material/card";
import { MatFormField,  MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatIcon } from "@angular/material/icon";
import { MatOption, MatSelect, MatSelectTrigger } from "@angular/material/select";
import { BaseComponent } from "../../core/base-component";
import { DialogAction, DialogComponent, DIALOG_CONFIG_TOKEN, DialogConfig } from "../../services/dialog-manager.types";
import { AppDialogActionsComponent } from "../../components/dialog-actions";
import { ModSection } from "../../models/mod-section";

export namespace AppModSectionDialog {

    export interface Config extends DialogConfig {
        section?: ModSection;
    }
}

@Component({
    templateUrl: "./mod-section-dialog.modal.html",
    styleUrls: ["./mod-section-dialog.modal.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,
        
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatFormField,
        MatLabel,
        MatInput,
        MatSelect,
        MatSelectTrigger,
        MatOption,
        MatIcon,

        AppDialogActionsComponent
    ],
    providers: [
        ComponentState.create(AppModSectionDialog)
    ]
})
export class AppModSectionDialog extends BaseComponent implements DialogComponent {

    @Output("actionSelected")
    public readonly actionSelected$ = new EventEmitter<DialogAction>();

    public modSection: ModSection = AppModSectionDialog.DEFAULT_SECTION();

    protected readonly iconNames: string[] = [
        "list",
        "extension",
        "lightbulb",
        "light_mode",
        "mode_night",
        "thunderstorm",
        "mood",
        "house",
        "music_note",
        "terminal",
        "image",
        "calendar_today",
        "schedule",
        "display_settings",
        "tab"
    ];

    constructor(
        cdRef: ChangeDetectorRef,
        @Inject(DIALOG_CONFIG_TOKEN) public readonly dialogConfig: AppModSectionDialog.Config
    ) {
        super({ cdRef });

        this.modSection = dialogConfig.section ?? this.modSection;
    }

    private static DEFAULT_SECTION(): ModSection {
        return { name: "" };
    }
}
