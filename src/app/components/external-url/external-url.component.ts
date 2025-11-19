import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { MatAnchor, MatIconAnchor } from "@angular/material/button";
import { ComponentState, ComponentStateRef, DeclareState } from "@lithiumjs/angular";
import { switchMap } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { filterDefined } from "../../core/operators";
import { AppStateBehaviorManager } from "../../services/app-state-behavior-manager";
import { AppResource } from "../../models/app-resource";

@Component({
    selector: "app-external-url",
    templateUrl: "./external-url.component.html",
    styleUrls: ["./external-url.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        NgTemplateOutlet,

        MatAnchor,
        MatIconAnchor
    ],
    providers: [ComponentState.create(AppExternalUrlComponent)]
    
})
export class AppExternalUrlComponent extends BaseComponent {

    @Input()
    public variant: AppExternalUrlComponent.Variant = "default";

    @Input()
    @DeclareState()
    public href?: string;

    @Input()
    @DeclareState()
    public resource?: AppResource;

    @Input()
    @DeclareState()
    public color?: string;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppExternalUrlComponent>,
        appManager: AppStateBehaviorManager
    ) {
        super({ cdRef });

        stateRef.get("resource").pipe(
            filterDefined(),
            switchMap(resource => appManager.resolveResourceUrl(resource))
        ).subscribe(href => this.href = href);
    }
}

export namespace AppExternalUrlComponent {

    export type Variant = "default" | "stroked-button" | "icon" | "link";
}