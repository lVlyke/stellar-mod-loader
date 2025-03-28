export interface  ModOverwriteFilesEntry {
    modName?: string;
    files: string[];
}

export type ModOverwriteFiles = Record<string, ModOverwriteFilesEntry[]>;