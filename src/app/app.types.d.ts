// This import is required to load electron-specific DOM API augmentations
import type electron from "electron";

declare global {
    interface Window {
        // Exposed in `electron/preload.js`:
        appMessenger: {
            on: (channel: string, func: any) => void;
            invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>;
            getFilePath: (file: File) => string;
        };
    }
}