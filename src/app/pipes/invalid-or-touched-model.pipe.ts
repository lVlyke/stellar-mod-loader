import { Pipe, PipeTransform } from "@angular/core";
import { NgForm, NgModel } from "@angular/forms";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

@Pipe({ name: "appInvalidOrTouchedModel$" })
export class AppInvalidOrTouchedModelPipe implements PipeTransform {

    public transform(model: NgModel | NgForm): Observable<boolean> {
        return model.valueChanges!.pipe(
            map(() => !!model.touched || !!model.invalid)
        );
    }
}
