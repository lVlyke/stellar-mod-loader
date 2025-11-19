import { Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { OverlayHelpers } from "./overlay-helpers";
import { DialogManager } from "./dialog-manager";
import { DialogConfig, DialogAction } from "./dialog-manager.types";
import { GameAction } from "../models/game-action";
import { AppModRenameDialog } from "../modals/mod-rename-dialog";
import { AppProfileBackupNameDialog } from "../modals/profile-backup-name-dialog";
import { AppProfileFolderMoveDialog } from "../modals/profile-folder-move-dialog";
import { AppSymlinkWarningDialog } from "../modals/symlink-warning-dialog";
import { AppCustomGameActionDialog } from "../modals/custom-game-action-dialog";
import { ModSection } from "../models/mod-section";
import { AppModSectionDialog } from "../modals/mod-section-dialog";
import { AppVersionUpdateNoticeComponent } from "../modals/app-version-update-notice";
import { AppInfo } from "../models/app-info";
import { App7ZipNoticeComponent } from "../modals/app-7zip-notice";
import { AppProfile } from "../models/app-profile";

@Injectable({ providedIn: "root" })
export class AppDialogs {

    constructor(
        public readonly dialogManager: DialogManager
    ) {}

    public showDefault(
        config: DialogConfig,
        actionMatch: DialogAction[] = DialogManager.POSITIVE_ACTIONS
    ): Observable<boolean> {
        return this.dialogManager.createDefault(config).pipe(
            map(result => actionMatch.includes(result))
        );
    }

    public showNotice(
        notice: string,
        action: DialogAction = DialogManager.OK_ACTION
    ): Observable<true> {
        return this.dialogManager.createNotice({
            prompt: notice,
            actions: [action]
        }).pipe(
            map(() => true)
        );
    }

    public showError(
        error: string,
        action: DialogAction = DialogManager.OK_ACTION
    ): Observable<true> {
        return this.dialogManager.createNotice({
            title: "Error",
            prompt: error,
            actions: [action]
        }).pipe(
            map(() => true)
        );
    }

    public showAppVersionUpdateNotice(appInfo: AppInfo, appLatestVersion: string): Observable<DialogAction> {
        return this.dialogManager.create<AppVersionUpdateNoticeComponent, AppVersionUpdateNoticeComponent.Config>(
            AppVersionUpdateNoticeComponent, {
                actions: [DialogManager.CLOSE_ACTION_PRIMARY],
                appInfo,
                appLatestVersion,
                maxWidth: "35%",
                panelClass: "mat-app-background",
                hasBackdrop: true,
                disposeOnBackdropClick: true
            }
        );
    }

    public show7ZipNotice(): Observable<boolean> {
        const RETRY_ACTION = { label: "Retry", primary: true };
        const EXIT_ACTION = { label: "Exit" };

        return this.dialogManager.create(App7ZipNoticeComponent, {
            actions: [RETRY_ACTION, EXIT_ACTION],
            maxWidth: "35%",
            panelClass: "mat-app-background",
            hasBackdrop: true,
            disposeOnBackdropClick: false
        }).pipe(
            map(result => result === RETRY_ACTION)
        );
    }

    public showModRenameDialog(modCurName: string): Observable<string | undefined> {
        return this.dialogManager.create<AppModRenameDialog, AppModRenameDialog.Config>(AppModRenameDialog, {
            modCurName,
            actions: [DialogManager.OK_ACTION_PRIMARY, DialogManager.CANCEL_ACTION],
            withModalInstance: true,
            maxWidth: "35%",
            panelClass: "mat-app-background"
        }).pipe(
            map(result => result.action === DialogManager.OK_ACTION_PRIMARY
                ? result.modalInstance.modName
                : undefined
            )
        );
    }

    public showProfileBackupNameDialog(): Observable<string | undefined> {
        return this.dialogManager.create(AppProfileBackupNameDialog, {
            actions: [
                DialogManager.OK_ACTION_PRIMARY,
                DialogManager.CANCEL_ACTION
            ],
            hasBackdrop: true,
            disposeOnBackdropClick: true,
            withModalInstance: true,
            maxWidth: "35%",
            panelClass: "mat-app-background"
        }).pipe(
            map(result => result.action === DialogManager.OK_ACTION_PRIMARY
                ? result.modalInstance.backupName
                : undefined
            )
        );
    }

    public showProfileMoveFolderDialog(
        oldPath: string,
        newPath: string
    ): Observable<{ overwrite: boolean, destructive: boolean } | undefined> {
        return this.dialogManager.create<AppProfileFolderMoveDialog, AppProfileFolderMoveDialog.Config>(
            AppProfileFolderMoveDialog, {
                oldPath,
                newPath,
                actions: [DialogManager.YES_ACTION_PRIMARY, DialogManager.NO_ACTION],
                withModalInstance: true,
                hasBackdrop: true,
                maxWidth: "55%",
                panelClass: "mat-app-background"
            }
        ).pipe(
            map(result => result.action === DialogManager.YES_ACTION_PRIMARY ? {
                overwrite: result.modalInstance.overwrite,
                destructive: !result.modalInstance.keepExisting
            } : undefined)
        );
    }

    public showSymlinkWarningDialog(): Observable<DialogAction> {
        return this.dialogManager.create(AppSymlinkWarningDialog, {
            actions: [DialogManager.OK_ACTION_PRIMARY],
            hasBackdrop: true,
            disposeOnBackdropClick: true,
            maxWidth: "35%",
            panelClass: "mat-app-background"
        });
    }

    public showAddCustomGameActionDialog(
        profile: AppProfile,
        gameAction?: GameAction,
        gameActionIndex?: number
    ): Observable<GameAction | undefined> {
        return this.dialogManager.create<AppCustomGameActionDialog, AppCustomGameActionDialog.Config>(
            AppCustomGameActionDialog, {
                profile,
                gameAction,
                gameActionIndex,
                actions: [
                    DialogManager.SAVE_ACTION_PRIMARY,
                    DialogManager.CANCEL_ACTION
                ],
                withModalInstance: true,
                hasBackdrop: true,
                maxWidth: "70%",
                panelClass: "mat-app-background"
            }
        ).pipe(
            map(result => result.action === DialogManager.SAVE_ACTION_PRIMARY ? result.modalInstance.gameAction : undefined)
        );
    }

    public showAddModSectionDialog(section?: ModSection): Observable<ModSection | undefined> {
        return this.dialogManager.create<AppModSectionDialog, AppModSectionDialog.Config>(AppModSectionDialog, {
            section,
            actions: [DialogManager.OK_ACTION_PRIMARY, DialogManager.CANCEL_ACTION],
            withModalInstance: true,
            hasBackdrop: true,
            maxWidth: "55%",
            panelClass: "mat-app-background"
        }).pipe(
            map(result => result.action === DialogManager.OK_ACTION_PRIMARY ? result.modalInstance.modSection : undefined)
        );
    }
}