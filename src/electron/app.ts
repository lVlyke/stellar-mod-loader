import type Electron from "electron";

import * as log from "electron-log/main";

import { AppConstants } from "./constants";
import { LogUtils } from "./util/log-utils";
import { AppDataManager } from "./services/app-data-manager";
import { ProfileDataManager } from "./services/profile-data-manager";
import { ProfileDeploymentManager } from "./services/profile-deployment-manager";
import { ProfileModManager } from "./services/profile-mod-manager";
import { RendererEventHandler } from "./services/renderer-event-handler";

// TODO - Figure out how to import runtime dependencies below without CommonJS via angular.json:

const { app, BrowserWindow, Menu, shell } = require("electron") as typeof Electron;
const url = require("url") as typeof import("url");
const path = require("path") as typeof import("path");

export class ElectronApp {

    private readonly CLI_COMMAND_EXECUTORS: Record<string, (...args: any[]) => Promise<boolean>> = {
        "-l": async (...args: any[]) => this.appDataManager.directLaunchProfileByName(args[0], args[1]),
        "--launch": async (...args: any[]) => this.appDataManager.directLaunchProfileByName(args[0], args[1]),
    }
    
    private readonly _appDataManager = new AppDataManager(this);
    private readonly _profileDataManager = new ProfileDataManager(this);
    private readonly _profileModManager = new ProfileModManager(this);
    private readonly _profileDeploymentManager = new ProfileDeploymentManager(this);
    private readonly _rendererEventHandler: RendererEventHandler;
    private _mainWindow?: Electron.BrowserWindow;
    private _menu: Electron.Menu;

    constructor() {
        // Set up logging
        log.initialize();
        
        log.transports.console.level = false;
        log.transports.ipc.level = false;
        log.transports.file.level = AppConstants.DEBUG_MODE ? "debug" : "info";
        log.transports.file.resolvePathFn = () => "app.log";

        this.enableConsoleLogHook();

        // Create the menu
        this._menu = this.createMenu();
        Menu.setApplicationMenu(this.menu);

        // Listen for events from the renderer
        this._rendererEventHandler = new RendererEventHandler(this);

        // This method will be called when Electron has finished
        // initialization and is ready to create browser windows.
        // Some APIs can only be used after this event occurs.
        app.whenReady().then(async () => {
            // Check for any launch commands
            await this.checkCliCommands();

            this.initWindow();

            app.on("activate", () => {
                // On macOS it's common to re-create a window in the app when the
                // dock icon is clicked and there are no other windows open.
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.initWindow();
                }
            });

            // Send all log entries to the renderer process
            log.hooks.push((message: any, transport: any) => {
                if (transport === log.transports.file) {
                    this.mainWindow!.webContents.send("app:log", {
                        level: message.level,
                        text: LogUtils.formatLogData(message.data),
                        timestamp: message.date
                    });
                }
    
                return message;
            });
        });

        // Quit when all windows are closed, except on macOS. There, it's common
        // for applications and their menu bar to stay active until the user quits
        // explicitly with Cmd + Q.
        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") {
                app.quit();
            }
        });
    }

    public get mainWindow(): Electron.BrowserWindow | undefined {
        return this._mainWindow;
    }

    public get menu(): Electron.Menu {
        return this._menu;
    }

    public get appDataManager(): AppDataManager {
        return this._appDataManager;
    }

    public get profileDataManager(): ProfileDataManager {
        return this._profileDataManager;
    }

    public get profileModManager(): ProfileModManager {
        return this._profileModManager;
    }

    public get profileDeploymentManager(): ProfileDeploymentManager {
        return this._profileDeploymentManager;
    }

    public showAppAboutInfo() {
        this.mainWindow!.webContents.send("app:showAboutInfo", this.appDataManager.getAppAboutInfo());
    }

    public showAppSupportInfo() {
        this.mainWindow!.webContents.send("app:showSupportInfo", this.appDataManager.getAppAboutInfo());
    }

    public exit(): void {
        app.quit();
    }

    private initWindow(): void {
        // Create the browser window
        this._mainWindow = new BrowserWindow({
            title: AppConstants.APP_NAME,
            icon: AppConstants.APP_ICON_IMG,
            width: 1280,
            height: 720,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: AppConstants.PRELOAD_SCRIPT
            }
        });

        // Enable HMR in debug mode
        if (AppConstants.DEBUG_MODE) {
            this.enableHotReload();
        }

        // Load the web app
        this.loadApp();

        // Disable page navigation
        this.mainWindow!.webContents.on("will-navigate", (event) => {
            event.preventDefault();
        });

        // Open all renderer links in the user's browser instead of the app
        this.mainWindow!.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: "deny" };
        });
    }

    private async checkCliCommands(): Promise<void> {
        const cliArgNames = Object.keys(this.CLI_COMMAND_EXECUTORS);

        // Check if any known commands were issued
        for (let argi = 1; argi < process.argv.length; ++argi) {
            const argToken = process.argv[argi].toLowerCase();

            if (cliArgNames.includes(argToken)) {
                const cliExecutor = this.CLI_COMMAND_EXECUTORS[argToken];
                const startArgi = argi;

                while (++argi < process.argv.length) {
                    const nextToken = process.argv[argi];

                    if (cliArgNames.includes(nextToken.toLowerCase())) {
                        break;
                    }
                }

                const params = process.argv.slice(startArgi + 1, argi);

                console.log(argToken, ...params);
                const result = await cliExecutor(...params);
                if (!result) {
                    log.error("Failed to run CLI command", argToken, ...params);
                }
            }
        }
    }

    private loadApp(): void {
        // load the index.html of the app.
        this.mainWindow!.loadURL(
            url.format({
                pathname: path.join(AppConstants.BROWSER_DIR, `index.html`),
                protocol: "file:",
                slashes: true,
            })
        );
    }

    private enableConsoleLogHook(): void {
        const originalConsole = console;

        console = Object.assign({}, console, {
            log: (...params: any[]) => (originalConsole.log(...params), log.log(...params)),
            info: (...params: any[]) => (originalConsole.info(...params), log.info(...params)),
            warn: (...params: any[]) => (originalConsole.warn(...params), log.warn(...params)),
            error: (...params: any[]) => (originalConsole.error(...params), log.error(...params)),
            debug: (...params: any[]) => (originalConsole.debug(...params), log.debug(...params)),
        });
    }

    private enableHotReload(): void {
        const chokidar = require("chokidar");

        chokidar.watch(AppConstants.BUILD_DATE_FILE, {
            interval: 500,
            usePolling: true,
            awaitWriteFinish: true,
            ignoreInitial: true
        }).on("change", () => {
            console.info("Changes detected, reloading app...");
    
            this.loadApp();

            console.info("App reloaded");
        });
    }

    private createMenu(): Electron.Menu {
        return Menu.buildFromTemplate([
            {
                label: 'File',
                submenu: [
                    {
                        label: "Preferences",
                        click: () => this.mainWindow!.webContents.send("app:showPreferences")
                    },
                    {
                        label: "Manage Games",
                        click: () => this.mainWindow!.webContents.send("app:showManageGames")
                    },
                    {
                        type: "separator"
                    },
                    {
                        label: "View Project Homepage",
                        click: () => shell.openExternal(AppConstants.APP_RESOURCES["homepage"])
                    },
                    {
                        label: "Check for Updates",
                        click: () => this.mainWindow!.webContents.send("app:checkLatestVersion")
                    },
                    {
                        type: "separator"
                    },
                    {
                        role: "quit"
                    }
                ]
            },

            {
                label: "Profile",
                submenu: [
                    {
                        id: "new-profile",
                        label: "New Profile",
                        click: () => this.mainWindow!.webContents.send("app:newProfile")
                    },
                    {
                        id: "add-external-profile",
                        label: "Add External Profile",
                        click: () => this.mainWindow!.webContents.send("app:importProfile", { directImport: true })
                    },
                    {
                        id: "import-profile",
                        label: "Import Profile",
                        click: () => this.mainWindow!.webContents.send("app:importProfile", { directImport: false })
                    },
                    {
                        id: "copy-profile",
                        label: "Copy Profile",
                        click: () => this.mainWindow!.webContents.send("app:copyProfile")
                    },
                    {
                        id: "export-profile",
                        label: "Export Profile",
                        click: () => this.mainWindow!.webContents.send("app:exportProfile")
                    },
                    {
                        id: "delete-profile",
                        label: "Delete Profile",
                        click: () => this.mainWindow!.webContents.send("app:deleteProfile")
                    },
                    {
                        id: "lock-profile",
                        label: "Lock Profile",
                        click: () => this.mainWindow!.webContents.send("profile:toggleLockState")
                    },
                    {
                        id: "unlock-profile",
                        label: "Unlock Profile",
                        click: () => this.mainWindow!.webContents.send("profile:toggleLockState")
                    },
                    {
                        type: "separator"
                    },
                    {
                        id: "mods",
                        label: "Mods",
                        submenu: [
                            {
                                label: "Add Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModAdd")
                            },
                            {
                                label: "Import Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModExternalImport")
                            },
                            {
                                label: "Add Mod Section",
                                click: () => this.mainWindow!.webContents.send("profile:addModSection")
                            },
                            {
                                label: "Add Root Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModAdd", { root: true })
                            },
                            {
                                label: "Import Root Mod",
                                click: () => this.mainWindow!.webContents.send("profile:beginModExternalImport", { root: true })
                            },
                            {
                                label: "Add Root Mod Section",
                                click: () => this.mainWindow!.webContents.send("profile:addModSection", { root: true })
                            },
                        ]
                    },
                    {
                        id: "profile-settings",
                        label: "Profile Settings",
                        click: () => this.mainWindow!.webContents.send("profile:settings")
                    },
                ]
            },

            {
                label: "View",
                submenu: [
                    {
                        label: "Mod List Columns",
                        submenu: [
                            {
                                id: "mod-list-col-enabled",
                                type: "checkbox",
                                label: "Mod Enabled",
                                checked: false,
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { column: "enabled" })
                            },
                            {
                                id: "mod-list-col-name",
                                type: "checkbox",
                                label: "Mod Name",
                                checked: false,
                                enabled: false,
                            },
                            {
                                id: "mod-list-col-updatedDate",
                                type: "checkbox",
                                label: "Mod Updated Date",
                                checked: false,
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { column: "updatedDate" })
                            },
                            {
                                id: "mod-list-col-order",
                                type: "checkbox",
                                label: "Mod Order",
                                checked: false,
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { column: "order" })
                            },
                            {
                                type: "separator"
                            },
                            {
                                label: "Reset Defaults",
                                click: () => this.mainWindow!.webContents.send("app:toggleModListColumn", { reset: true })
                            }
                        ]
                    },
                    {
                        id: "show-log-panel",
                        label: "Show Log Panel",
                        type: "checkbox",
                        checked: false,
                        click: () => this.mainWindow!.webContents.send("app:toggleLogPanel")
                    },
                    ...this.createDebugMenuOption({
                        type: "separator"
                     }),
                     ...this.createDebugMenuOption({
                        role: "toggleDevTools"
                     })
                ]
            },

            {
                label: "Help",
                submenu: [
                    {
                        label: "View README",
                        click: () => shell.openExternal(AppConstants.APP_RESOURCES["readme_online"])
                    },
                    {
                        label: `About ${AppConstants.APP_SHORT_NAME}`,
                        click: () => this.showAppAboutInfo()
                    },
                    {
                        type: "separator"
                    },
                    {
                        label: `Support ${AppConstants.APP_SHORT_NAME}`,
                        click: () => this.showAppSupportInfo()
                    },
                ]
            }
        ]);
    }

    private createDebugMenuOption(menuOption: Record<any, any>): [Record<any, any>] | [] {
        return AppConstants.DEBUG_MODE ? [menuOption] : [];
    }
}