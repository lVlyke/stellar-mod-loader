import { enableProdMode, inject, provideAppInitializer, provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { provideStore } from "@ngxs/store";
import { withNgxsReduxDevtoolsPlugin } from "@ngxs/devtools-plugin";
import { environment } from "./environments/environment";
import { APP_ROUTES } from "./app/app.routes";
import { AppComponent } from "./app/app.component";
import { appStates } from "./app/state";
import { log } from "./app/util/logger";

import { ProfileManager } from "./app/services/profile-manager";
import { AppMessageHandler } from "./app/services/app-message-handler";
import { AppStateBehaviorManager } from "./app/services/app-state-behavior-manager";

if (environment.production) {
    enableProdMode();
}

bootstrapApplication(AppComponent, {
    providers: [
        provideZonelessChangeDetection(),
        provideAnimations(),
        provideStore(
            appStates,
            { developmentMode: !environment.production },
            withNgxsReduxDevtoolsPlugin({ disabled: environment.production })
        ),
        provideAppInitializer(() => {
            // Startup services:
            inject(AppMessageHandler);
            inject(AppStateBehaviorManager);
            inject(ProfileManager);
        }),
        provideRouter(APP_ROUTES)
    ]
}).catch(err => log.error(err));