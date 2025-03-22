import type { AppSelectEditComponent } from "./select-edit.component";
import { Directive, TemplateRef } from "@angular/core";

@Directive({
    selector: "[appSelectEditControls]"
})
export class AppSelectEditControls<T> {

    constructor(
        public readonly templateRef: TemplateRef<AppSelectEditControls.ViewContext<T>>
    ) {}
}

export namespace AppSelectEditControls {

    export type ViewContext<T> = { $implicit: AppSelectEditComponent<T>, index: number };
}