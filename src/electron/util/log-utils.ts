export namespace LogUtils {

    export function formatLogData(logData: any[]): string {
        return logData?.map(arg => formatLogArg(arg)).join(" ") ?? "";
    }

    export function formatLogArg(arg: any): string {
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