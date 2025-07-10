import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from "@angular/core";
import { RouterModule } from "@angular/router";
import { AsyncState, ComponentState } from "@lithiumjs/angular";
import { Store } from "@ngxs/store";
import { MatIconModule, MatIconRegistry } from "@angular/material/icon";
import { ThemeContainer } from "@lithiumjs/ngx-material-theming";
import { Observable } from "rxjs";
import { BaseComponent } from "./core/base-component";
import { AppState } from "./state";
import { AppTheme } from "./models/app-theme";
@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        RouterModule,
        MatIconModule,
        
        ThemeContainer
    ],
    providers: [
        ComponentState.create(AppComponent)
    ]
})
export class AppComponent extends BaseComponent {

    public readonly theme$: Observable<AppTheme>;

    @AsyncState()
    public readonly theme!: AppTheme;

    constructor (cdRef: ChangeDetectorRef, store: Store, iconRegistry: MatIconRegistry) {
        super({ cdRef });

        // Register Material Icons font
        iconRegistry.setDefaultFontSetClass("material-icons-font-set");

        this.theme$ = store.select(AppState.getTheme);
    }
}
