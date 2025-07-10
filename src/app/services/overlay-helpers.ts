import { last, remove } from "es-toolkit";
import { Injectable, ElementRef, ComponentRef, ViewRef, Injector, InjectionToken } from "@angular/core";
import {
    Overlay,
    OverlayRef,
    OverlayConfig,
    OverlayPositionBuilder,
    ConnectedPosition,
    GlobalPositionStrategy
} from "@angular/cdk/overlay";
import { ComponentPortal, ComponentType, Portal, TemplatePortal } from "@angular/cdk/portal";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { Observable, of } from "rxjs";
import { delay, tap, skip } from "rxjs/operators";
import { runOnce } from "../core/operators";
import { vec2 } from "../util/vec";

export const OverlayRefSymbol = new InjectionToken<OverlayHelpersRef>("OverlayRefSymbol");

export interface OverlayHelpersConfig extends OverlayConfig {
    disposeOnBackdropClick?: boolean;
    disposeOnBreakpointChange?: boolean;
    center?: boolean;
    centerHorizontally?: boolean;
    centerVertically?: boolean;
    injector?: Injector;
    autoResize?: boolean;
    managed?: boolean;
}

export interface AttachedOverlayHelpersConfig extends OverlayHelpersConfig {
    withPush?: boolean;
}

export interface OverlayHelpersRef {
    overlay: OverlayRef;
    close: () => Observable<void>;
    onClose$: Observable<void>;
}

export interface OverlayHelpersComponentRef<T> extends OverlayHelpersRef {
    component: ComponentRef<T>;
}

export interface OverlayHelpersViewRef extends OverlayHelpersRef {
    view: ViewRef;
}

@Injectable({
    providedIn: "root"
})
export class OverlayHelpers {

    public static readonly DefaultConnectionPosition: ConnectedPosition = {
        offsetX: 0,
        offsetY: 0,
        originX: "center",
        originY: "bottom",
        overlayX: "center",
        overlayY: "top"
    };

    public readonly position = this.overlay.position;
    public readonly scrollStrategies = this.overlay.scrollStrategies;

    private readonly overlayStack: OverlayHelpersRef[] = [];

    constructor(
        public readonly overlayPositionBuilder: OverlayPositionBuilder,
        private readonly overlay: Overlay,
        private readonly injector: Injector,
        private readonly breakpointObserver: BreakpointObserver
    ) {}

    public static fromDefaultConnectionPosition(overrides: Partial<ConnectedPosition> = {}): ConnectedPosition {
        return {
            ...this.DefaultConnectionPosition,
            ...overrides
        };
    }

    public closeOverlay(): void {
        if (this.overlayStack.length > 0) {
            last(this.overlayStack)?.close();
        } else {
            throw new Error("No overlays are open.");
        }
    }

    public createAttached<T>(
        componentType: ComponentType<T> | ComponentPortal<T>,
        anchor: HTMLElement | ElementRef<HTMLElement> | vec2,
        attachmentPosition?: ConnectedPosition | ConnectedPosition[],
        config?: AttachedOverlayHelpersConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): OverlayHelpersComponentRef<T>;

    public createAttached<T>(
        templatePortal: TemplatePortal,
        anchor: HTMLElement | ElementRef<HTMLElement> | vec2,
        attachmentPosition?: ConnectedPosition | ConnectedPosition[],
        config?: AttachedOverlayHelpersConfig
    ): OverlayHelpersViewRef;

    public createAttached<T>(
        view: ComponentType<T> | Portal<T>,
        anchor: HTMLElement | ElementRef<HTMLElement> | vec2,
        attachmentPosition: ConnectedPosition | ConnectedPosition[] = OverlayHelpers.DefaultConnectionPosition,
        config?: AttachedOverlayHelpersConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): OverlayHelpersComponentRef<T> | OverlayHelpersViewRef {

        // Set the overlay width to the width of the parent element if specified
        if (config && config.width === "parent") {
            if (anchor instanceof ElementRef || anchor instanceof HTMLElement) {
                config.width = ((anchor instanceof ElementRef) ? anchor.nativeElement : anchor).clientWidth;
            } else {
                throw new Error("Attached overlay `width` cannot be set to 'parent' when using an anchor point.");
            }
        }

        // Attach the overlay to the `anchorElement` with the specified `attachmentPosition`
        const positionStrategy = this.overlayPositionBuilder
            .flexibleConnectedTo(anchor)
            .withPush(!!(config && config.withPush))
            .withPositions(Array.isArray(attachmentPosition) ? attachmentPosition : [attachmentPosition]);

        return this.create<T>(view as any, Object.assign({ positionStrategy }, config || {}), injectionTokens);
    }

    public createFullScreen<T>(
        componentType: ComponentType<T> | ComponentPortal<T>,
        config?: OverlayHelpersConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): OverlayHelpersComponentRef<T>;

    public createFullScreen<T>(
        templatePortal: TemplatePortal,
        config?: OverlayHelpersConfig
    ): OverlayHelpersViewRef;

    public createFullScreen<T>(
        view: ComponentType<T> | Portal<T>,
        config?: OverlayHelpersConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): OverlayHelpersComponentRef<T> | OverlayHelpersViewRef {
        config = Object.assign({}, { width: "100%", height: "100%"}, config);

        if (config.centerHorizontally === undefined) {
            config.centerHorizontally = config.center ?? true;
        }

        if (config.centerVertically === undefined) {
            config.centerVertically = config.center ?? true;
        }

        if (config.autoResize === undefined) {
            config.autoResize = true;
        }

        // Create an overlay that covers the entire view area
        const positionStrategy = config.positionStrategy ?? this.overlayPositionBuilder.global();

        if (config.centerHorizontally) {
            (positionStrategy as GlobalPositionStrategy)
                .centerHorizontally();
        }

        if (config.centerVertically) {
            (positionStrategy as GlobalPositionStrategy)
                .centerVertically();
        }

        return this.create<T>(view as any, Object.assign({}, config, { positionStrategy }), injectionTokens);
    }

    private create<T>(
        componentType: ComponentType<T> | ComponentPortal<T>,
        config: OverlayHelpersConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): OverlayHelpersComponentRef<T>;

    private create(
        templatePortal: TemplatePortal,
        config: OverlayHelpersConfig
    ): OverlayHelpersViewRef;

    private create<T>(
        view: ComponentType<T> | Portal<T>,
        config: OverlayHelpersConfig,
        injectionTokens?: OverlayHelpers.InjetorTokens
    ): OverlayHelpersComponentRef<T> | OverlayHelpersViewRef {

        function appendBackdropClass(className: string) {
            config.backdropClass = [config.backdropClass ?? [], className].flat();
        }

        if (!injectionTokens) {
            injectionTokens = [];
        }

        // Set config defaults
        if (config.managed === undefined) {
            config.managed = false;
        }

        if (config.hasBackdrop && config.backdropClass === undefined) {
            appendBackdropClass("backdrop-dark");
        }

        if (config.disposeOnBackdropClick === undefined && config.hasBackdrop !== false) {
            // Make the backdrop clear if one wasn"t given originally
            if (config.hasBackdrop !== true && !config.backdropClass) {
                config.backdropClass = "backdrop-clear";
            }

            // Dispose the overlay on backdrop click
            config.hasBackdrop = true;
            config.disposeOnBackdropClick = true;
        }

        if (config.disposeOnNavigation === undefined) {
            config.disposeOnNavigation = true;
        }

        if (config.injector === undefined) {
            config.injector = this.injector;
        }

        if (config.autoResize) {
            appendBackdropClass("backdrop-auto-size");
        }

        // Close the previous managed overlay if open
        if (config.managed && this.overlayStack.length > 0) {
            this.closeOverlay();
        }

        // Create the overlayRef and viewRef using the given `view`
        const overlayRef: OverlayRef = this.overlay.create(config);
        const basicOverlayHelpersRef = this.createHelpersRef<T>(overlayRef);

        // Add the basic overlay ref as an injection token so the modal can close itself
        injectionTokens.push([ OverlayRefSymbol, basicOverlayHelpersRef ]);

        const viewRef: ComponentRef<T> | ViewRef = overlayRef.attach(
            view instanceof Portal ? view : new ComponentPortal(
                view,
                undefined,
                injectionTokens ? Injector.create({
                    parent: config.injector,
                    providers: injectionTokens.map(([injectionToken, data]) => ({
                        provide: injectionToken,
                        useValue: data
                    }))
                }) : config.injector
            ));
        const helpersRef = this.createHelpersRef<T>(overlayRef, viewRef);

        // Dismiss the overlay when the backdrop is clicked
        if (config.disposeOnBackdropClick) {
            overlayRef.backdropClick().subscribe(() => helpersRef.close());
        }

        if (config.disposeOnBreakpointChange) {
            // Close the overlay on view state change if managed
            this.breakpointObserver.observe([
                Breakpoints.Handset,
                Breakpoints.Web
            ]).pipe(skip(1)).subscribe(() => helpersRef.close());
        }

        if (config.managed) {
            // Add the overlay to the stack if managed
            this.overlayStack.push(helpersRef);
        }

        // When the overlay is closed, remove it from the stack
        helpersRef.onClose$.subscribe(() => remove(this.overlayStack, overlayRef => overlayRef === helpersRef));

        return helpersRef;
    }

    private isViewRef<T>(ref?: ComponentRef<T> | ViewRef): ref is ViewRef {
        return !(ref instanceof ComponentRef);
    }

    private createHelpersRef<T>(
        overlayRef: OverlayRef,
        viewRef?: ComponentRef<T> | ViewRef,
    ): OverlayHelpersComponentRef<T> | OverlayHelpersViewRef {
        function close(): Observable<void> {
            // Detach the overlay component and wait 500ms to allow animations to play
            return runOnce(of(overlayRef.detach()).pipe(
                delay(500),
                tap(() => overlayRef.dispose()), // Remove the overlay component
            ));
        }

        return {
            close,
            onClose$: overlayRef.detachments(),
            overlay: overlayRef,
            ...this.isViewRef<T>(viewRef)
                ? { view: viewRef! }
                : { component: viewRef! }
        };
    }
}

export namespace OverlayHelpers {

    export type InjetorTokens = Array<[InjectionToken<any>, any]>;

    export namespace ConnectionPositions {

        export const contextMenu = [
            OverlayHelpers.DefaultConnectionPosition,
            OverlayHelpers.fromDefaultConnectionPosition({
                originY: "top",
                overlayY: "bottom"
            })
        ];

        export const nestedContextMenu = [
            OverlayHelpers.fromDefaultConnectionPosition({
                originX: "end",
                originY: "top",
                overlayX: "start"
            }),
            OverlayHelpers.fromDefaultConnectionPosition({
                originX: "start",
                originY: "top",
                overlayX: "end"
            })
        ];
    }
}