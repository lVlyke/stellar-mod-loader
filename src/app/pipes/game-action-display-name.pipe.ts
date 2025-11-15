import { Pipe, PipeTransform } from "@angular/core";
import { GameAction } from "../models/game-action";

@Pipe({ name: "appGameActionDisplayName" })
export class AppGameActionDisplayNamePipe implements PipeTransform {

    public transform(gameAction: GameAction): string {
        return `${gameAction.name}${gameAction.requiresSteam ? "*" : ""}`;
    }
}
