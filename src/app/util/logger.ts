import { remove } from "es-toolkit";
import { environment } from "../../environments/environment";

export type LogLevel = "info" | "debug" | "error" | "warn";
export type LogHook = (entry: LogEntry) => LogEntry | undefined;
export type LogFunction = (...params: any[]) => void;

export interface LogEntry {
    level: LogLevel;
    text: string;
    timestamp: Date
}

export interface LogOptions {
    shadowConsole?: boolean;
    logToConsole?: boolean;
}

class Log {
    private static readonly CONSOLE = window.console;

    private hooks: LogHook[] = [];

    public readonly log = this._logFn("info");
    public readonly info = this._logFn("info");
    public readonly debug = this._logFn("debug");
    public readonly error = this._logFn("error");
    public readonly warn = this._logFn("warn");

    constructor (private readonly options: LogOptions = {}) {
        if (options.shadowConsole) {
            // Intercept all console logs
            window.console = Object.assign({}, Log.CONSOLE, {
                log: (...params: any[]) => (log.log(...params)),
                info: (...params: any[]) => (log.info(...params)),
                warn: (...params: any[]) => (log.warn(...params)),
                error: (...params: any[]) => (log.error(...params)),
                debug: (...params: any[]) => (log.debug(...params)),
            });
        }
    }

    public addHook(hook: LogHook): void {
        this.hooks.push(hook);
    }

    public removeHook(hook: LogHook): void {
        remove<LogHook>(this.hooks, curHook => curHook === hook);
    }

    private _logFn(level: LogLevel): LogFunction {
        return (...logData: any[]) => this._log(level, ...logData);
    }

    private _log(level: LogLevel, ...logData: any[]): void {
        if (this.options.logToConsole) {
            Log.CONSOLE[level](...logData);
        }

        this.notifyHooks(this.createEntry(level, ...logData));
    }

    private notifyHooks(entry: LogEntry): void {
        for (const hook of this.hooks) {
            entry = hook(entry) ?? entry;
        }
    }

    private createEntry(level: LogLevel, ...logData: any[]): LogEntry {
        return {
            level,
            text: this.formatLogData(...logData),
            timestamp: new Date()
        };
    }

    private formatLogData(...logData: any[]): string {
        return logData.map(arg => this.formatLogArg(arg)).join(" ");
    }

    private formatLogArg(arg: any): string {
        if (arg === undefined) {
            return "undefined";
        } else if (arg === null) {
            return "null";
        } else if (arg instanceof Error) {
            return arg.toString();
        } else if (arg !== undefined && arg !== null && typeof arg === "object") {
            return JSON.stringify(arg);
        } else {
            return arg?.toString();
        }
    }
}

export const log = new Log({
    shadowConsole: true,
    logToConsole: !environment.production
});