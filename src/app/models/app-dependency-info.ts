export interface AppDependencyInfo {
    licenses: string;
    repository: string;
}

export type AppDependenciesInfo = Record<string, AppDependencyInfo>;
