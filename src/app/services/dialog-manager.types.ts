import { EventEmitter, InjectionToken } from "@angular/core";
import { OverlayHelpersConfig } from "./overlay-helpers";

export interface DialogConfig extends OverlayHelpersConfig {
    actions?: DialogAction[];
    prompt?: string;
    title?: string;
    withModalInstance?: boolean;
}

export const DIALOG_CONFIG_TOKEN = new InjectionToken<DialogConfig>("DIALOG_CONFIG");

export interface DialogAction {
    label: string;
    primary?: boolean;
    accent?: boolean;
    warn?: boolean;
    tooltip?: string;
}

export interface DialogComponent {
    actionSelected$: EventEmitter<DialogAction>;
}
