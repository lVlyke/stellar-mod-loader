export namespace Fomod {

    export enum Order {
        Ascending = "Ascending",
        Descending = "Descending",
        Explicit = "Explicit"
    }

    export interface Image {
        path: [string];
    }

    export interface HeaderImage extends Partial<Image> {
        showImage?: [boolean];// = true;
        showFade?: [boolean];// = true;
        height?: [number];// = -1;
    }

    export enum DependencyState {
        Missing = "Missing",
        Inactive = "Inactive",
        Active = "Active"
    }

    export interface ConditionFlag {
        name: [string];
        _?: string;
    }

    export namespace ConditionFlag {

        export interface List {
            flag: ConditionFlag[];
        }
    }

    export interface FileSystemItem {
        source: [string];
        destination?: [string];
        alwaysInstall?: [boolean];// = false;
        installIfUsable?: [boolean];// = false;
        priority?: [number];// = 0;
    }

    export interface FileList {
        file?: FileSystemItem[];
        folder?: FileSystemItem[];
    }
    
    export interface FileDependency {
        file: [string];
        state?: [DependencyState];
    }
    
    export interface FlagDependency {
        flag: [string];
        value: [string];
    }
    
    export interface VersionDependency {
        version: [string];
    }
    
    export interface CompositeDependency {
        operator?: [CompositeDependency.Operator];// = CompositeDependency.Operator.And;
        fileDependency?: FileDependency[];
        flagDependency?: FlagDependency[];
        dependencies?: CompositeDependency[];
        gameDependency?: [VersionDependency];
        fommDependency?: [VersionDependency];
    }

    export namespace CompositeDependency {

        export enum Operator {
            And = "And",
            Or = "Or"
        }
    }
    
    export interface PluginType {
        name: [PluginType.Name];
    }

    export namespace PluginType {

        export enum Name {
            Required = "Required",
            Optional = "Optional",
            Recommended = "Recommended",
            NotUsable = "NotUsable",
            CouldBeUsable = "CouldBeUsable"
        }
    }

    export interface DependencyPattern {
        dependencies: CompositeDependency[];
        type: [PluginType];
    }

    export namespace DependencyPattern {

        export interface List {
            pattern: DependencyPattern[];
        }
    }

    export interface DependencyPluginType {
        defaultType: [PluginType];
        patterns: [DependencyPattern.List];
    }

    export interface PluginTypeDescriptor {
        type?: [PluginType];
        dependencyType?: [DependencyPluginType];
    }

    export interface Plugin {
        typeDescriptor: [PluginTypeDescriptor];
        name: [string];
        files?: [FileList | undefined];
        conditionFlags?: [ConditionFlag.List];
        description?: [string];
        image?: [Image];
    }

    export namespace Plugin {

        export interface List {
            plugin: Plugin[];
            order?: [Order];// = Order.Ascending;
        }
    }

    export interface PluginGroup {
        name: [string];
        type: [PluginGroup.Type];
        plugins: [Plugin.List];
    }

    export namespace PluginGroup {

        export enum Type {
            SelectAtLeastOne = "SelectAtLeastOne",
            SelectAtMostOne = "SelectAtMostOne",
            SelectExactlyOne = "SelectExactlyOne",
            SelectAll = "SelectAll",
            SelectAny = "SelectAny"
        }

        export interface List {
            group: PluginGroup[];
            order?: [Order];// = Order.Ascending;
        }
    }

    export interface InstallStep {
        name: [string];
        optionalFileGroups: [PluginGroup.List];
        visible?: [CompositeDependency];
    }

    export namespace InstallStep {

        export interface List {
            installStep: InstallStep[];
            order?: [Order];// = Order.Ascending;
        }
    }

    export interface ConditionalInstallPattern {
        dependencies: CompositeDependency[];
        files: [FileList];
    }

    export namespace ConditionalInstallPattern {

        export interface List {
            pattern: ConditionalInstallPattern[];
        }
    }

    export namespace ConditionalFileInstall {

        export interface List {
            patterns: ConditionalInstallPattern.List[];
        }
    }

    export interface ModuleTitle {
        position?: [ModuleTitle.Position];// = ModuleTitle.Position.Left;
        colour?: [string];// = "#000000";
        _?: string;
    }

    export namespace ModuleTitle {

        export enum Position {
            Left = "Left",
            Right = "Right",
            RightOfImage = "RightOfImage"
        }
    }
    
    export interface ModuleConfig {
        config: {
            moduleName: [ModuleTitle];
            moduleDependencies?: CompositeDependency[];
            requiredInstallFiles?: [FileList];
            installSteps?: [InstallStep.List];
            conditionalFileInstalls?: [ConditionalFileInstall.List];
            moduleImage?: [HeaderImage];
        };
    }
    
    export interface ModuleInfo {
        fomod: {
            Name?: [string];
            Author?: string[];
            Version?: [string | { _: string }];
            Description?: string[];
            Website?: [string];
            Id?: [string];
            CategoryId?: string[];
        };
    }
}
