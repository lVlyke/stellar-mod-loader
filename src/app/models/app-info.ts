import { AppDependenciesInfo } from "./app-dependency-info";

export interface AppInfo {
    appName: string;
    appShortName: string;
    appVersion: string;
    depsInfo: AppDependenciesInfo;
    depsLicenseText: string;
}