// @ts-check
const { ipcRenderer, contextBridge, webUtils } = require("electron");

const ALLOWED_CHANNEL_PREFIXES = ["app:", "profile:"];

// Expose `ipcRender.on` and `ipcRender.invoke` to the renderer
contextBridge.exposeInMainWorld("appMessenger", {
    invoke: (
        /** @type { string } */ channel,
        /** @type { any[] } */ ...args
    ) => {
        if (ALLOWED_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix))) {
            return ipcRenderer.invoke(channel, ...args);
        } else {
            throw new Error(`Unknown channel ${channel}`);
        }
    },
    on: (
        /** @type { string } */ channel,
        /** @type { (event: import("electron").IpcRendererEvent, ...args: any[]) => void } */ func
    ) => {
        if (ALLOWED_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix))) {
            ipcRenderer.on(channel, func);
        } else {
            throw new Error(`Unknown channel ${channel}`);
        }
    },
    getFilePath: (/** @type { File } */ file) => {
        return webUtils.getPathForFile(file);
    }
});