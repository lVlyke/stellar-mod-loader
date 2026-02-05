import { ElectronApp } from "./app";

// Handle uncaught exceptions gracefully
process.on("uncaughtException", (err) => {
    console.error("Uncaught error - Main: ", err);
});

// Load the app
new ElectronApp();