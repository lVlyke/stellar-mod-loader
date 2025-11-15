import { ComponentType } from "@angular/cdk/overlay";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { finalize, map, tap } from "rxjs/operators";
import { AppDefaultDialogComponent } from "../modals/default-dialog-modal/default-dialog-modal.component";
import { DIALOG_CONFIG_TOKEN, DialogAction, DialogComponent, DialogConfig } from "./dialog-manager.types";
import { OverlayHelpers } from "./overlay-helpers";
import { runOnce } from "../core/operators";

@Injectable({ providedIn: "root" })
export class DialogManager {

    constructor (
        public readonly overlayHelpers: OverlayHelpers
    ) {}

    public create<C extends DialogComponent, Config extends DialogConfig>(
        modalComponent: ComponentType<C>,
        config?: undefined | (Config & { withModalInstance?: false }),
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): Observable<DialogAction>;

    public create<C extends DialogComponent, Config extends DialogConfig>(
        modalComponent: ComponentType<C>,
        config?: Config & { withModalInstance: true },
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): Observable<DialogManager.ActionWithModalInstance<C>>;

    public create<C extends DialogComponent, Config extends DialogConfig>(
        modalComponent: ComponentType<C>,
        config?: Config,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): Observable<DialogAction | DialogManager.ActionWithModalInstance<C>> {
        config ??= {} as Config;
        
        if (!config.actions) {
            config.actions = DialogManager.DEFAULT_ACTIONS;
        }

        const overlayRef = this.overlayHelpers.createFullScreen<C>(modalComponent, {
            height: "auto",
            center: true,
            disposeOnBackdropClick: false,
            ...config ?? {}
        }, [
            [DIALOG_CONFIG_TOKEN, config],
            ...injectionTokens ?? []
        ]);
        
        return runOnce(overlayRef.component.instance.actionSelected$.pipe(
            map(action => config?.withModalInstance
                ? {
                    action,
                    modalInstance: overlayRef.component.instance,
                    close: () => overlayRef.close()
                }
                : ( action )
            ),
            tap(() => overlayRef.close()),
            finalize(() => overlayRef.close())
        ));
    }

    public createDefault(
        config: DialogConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): Observable<DialogAction> {
        return this.create(
            AppDefaultDialogComponent,
            {
                width: "30%",
                minHeight: "25%",
                maxHeight: "90%",
                hasBackdrop: true,
                disposeOnBackdropClick: config?.actions && config.actions.length <= 1,
                ...config,
                withModalInstance: false,
                panelClass: "panel-card"
            },
            injectionTokens
        );
    }

    public createNotice(
        config: DialogConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): Observable<DialogAction> {
        return this.createDefault({
            actions: [DialogManager.OK_ACTION],
            ...config ?? {}
        }, injectionTokens);
    }
}

export namespace DialogManager {

    export interface ActionWithModalInstance<C> {
        action: DialogAction;
        modalInstance: C;
        close: () => Observable<void>;
    }

    export const YES_ACTION = { label: "Yes" };
    export const YES_ACTION_PRIMARY = { ...YES_ACTION, primary: true };
    export const YES_ACTION_ACCENT = { ...YES_ACTION, accent: true };
    export const YES_ACTION_WARN = { ...YES_ACTION, warn: true };

    export const NO_ACTION = { label: "No" };
    export const NO_ACTION_PRIMARY = { ...NO_ACTION, primary: true };
    export const NO_ACTION_ACCENT = { ...NO_ACTION, accent: true };
    export const NO_ACTION_WARN = { ...NO_ACTION, warn: true };

    export const OK_ACTION = { label: "OK" };
    export const OK_ACTION_PRIMARY = { ...OK_ACTION, primary: true };
    export const OK_ACTION_ACCENT = { ...OK_ACTION, accent: true };
    export const OK_ACTION_WARN = { ...OK_ACTION, warn: true };

    export const CANCEL_ACTION = { label: "Cancel" };
    export const CANCEL_ACTION_PRIMARY = { ...CANCEL_ACTION, primary: true };
    export const CANCEL_ACTION_ACCENT = { ...CANCEL_ACTION, accent: true };
    export const CANCEL_ACTION_WARN = { ...CANCEL_ACTION, warn: true };

    export const SAVE_ACTION = { label: "Save" };
    export const SAVE_ACTION_PRIMARY = { ...SAVE_ACTION, primary: true };

    export const ADD_ACTION = { label: "Add" };
    export const ADD_ACTION_PRIMARY = { ...ADD_ACTION, primary: true };

    // Default actions:
    export const DEFAULT_ACTIONS: DialogAction[] = [
        OK_ACTION_PRIMARY,
        CANCEL_ACTION
    ];

    // Positive actions:
    export const POSITIVE_ACTIONS: DialogAction[] = [
        YES_ACTION,
        YES_ACTION_PRIMARY,
        YES_ACTION_ACCENT,
        YES_ACTION_WARN,
        OK_ACTION,
        OK_ACTION_PRIMARY,
        OK_ACTION_ACCENT,
        OK_ACTION_WARN,
        SAVE_ACTION,
        SAVE_ACTION_PRIMARY,
        ADD_ACTION,
        ADD_ACTION_PRIMARY
    ];

    // Negative actions:
    export const NEGATIVE_ACTIONS: DialogAction[] = [
        NO_ACTION,
        NO_ACTION_PRIMARY,
        NO_ACTION_ACCENT,
        NO_ACTION_WARN,
        CANCEL_ACTION,
        CANCEL_ACTION_PRIMARY,
        CANCEL_ACTION_ACCENT,
        CANCEL_ACTION_WARN
    ];

    export function positive(actions: DialogAction[]): DialogAction[] {
        return actions.filter(action => POSITIVE_ACTIONS.includes(action));
    }

    export function negative(actions: DialogAction[]): DialogAction[] {
        return actions.filter(action => NEGATIVE_ACTIONS.includes(action));
    }
}
