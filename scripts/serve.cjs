// @ts-check
const fs = require("fs-extra");
const path = require("path");
const execSync = require("child_process").execSync;
const spawn = require("child_process").spawn;

const BUILD_DIR = "./dist";
const BUILD_DATE_FILE = `${BUILD_DIR}/lastbuild.txt`;
const RELEASE_MODE = process.argv.includes("--release");
const DISABLE_SANDBOX = process.argv.includes("--no-sandbox");

const IS_WSL = !!process.env["WSLENV"];

function buildProject(projectName) {
    return spawn("npx", [
        "ng",
        "build",
        projectName,
        "--configuration",
        RELEASE_MODE ? "production" : "development",
        "--watch",
        "--poll", 
        "1000"
    ], { detached: true });
}

function startApp(buildTasks) {
    console.log("Starting app...");

    const electronProcess = spawn("npx", [
        process.env.ELECTRON_BINARY ?? "electron",
        path.join(BUILD_DIR, "electron", "main.js"),
        ...DISABLE_SANDBOX ? ["--no-sandbox"] : []
    ], { stdio: IS_WSL ? "inherit" : undefined });

    electronProcess.stdout?.on("data", (data) => {
        console.log(data.toString());
    });

    electronProcess.stderr?.on("data", (data) => {
        console.error(data.toString());
    });

    electronProcess.on("close", () => {
        console.log("Finished serving");

        // Kill all ng build processes
        buildTasks.forEach((buildTask) => {
            if (buildTask.pid) {
                process.kill(-buildTask.pid);
                buildTask.kill();
            }
        });

        process.exit();
    });

    return electronProcess;
}

function updateAppDeployment() {
    // Make sure app files have been generated before continuing
    if (!fs.existsSync(BUILD_DIR)) {
        return setTimeout(() => updateAppDeployment(), 1000);
    }

    try {
        // Copy app assets
        execSync(
            "node ./scripts/copy-assets.cjs",
            { stdio: "inherit" }
        );
    } catch (err) {
        console.error("Failed to copy assets: ", err);
    }

    // Update the build date file (used for hot reloading)
    fs.writeJsonSync(BUILD_DATE_FILE, { date: new Date() });
}

function main() {
    const buildElectronTask = buildProject("electron");
    const buildBrowserTask = buildProject("browser");

    let electronReady = false;
    let browserReady = false;
    /** @type {import("child_process").ChildProcessWithoutNullStreams | undefined} */
    let mainProcess;

    function deployApp() {
        // Re-deploy app on build updates
        updateAppDeployment();

        // Start the app when ready
        if (!mainProcess && electronReady && browserReady) {
            mainProcess = startApp([buildElectronTask, buildBrowserTask]);
        }
    }

    // Monitor Electron build process
    buildElectronTask.stdout.on("data", (data) => {
        console.log("Electron: ", data.toString());
    
        if (!data.includes("Output location")) {
            return;
        }

        electronReady = true;
    
        // Re-deploy app on build updates
        deployApp();
        
    });
    
    // Monitor Browser build process
    buildBrowserTask.stdout.on("data", (data) => {
        console.log("Browser: ", data.toString());

        if (!data.includes("Output location")) {
            return;
        }

        browserReady = true;
    
        // Re-deploy app on build updates
        deployApp();
    });
    
    buildElectronTask.stderr.on("data", (data) => console.error(data.toString()));
    buildBrowserTask.stderr.on("data", (data) => console.error(data.toString()));
}

try {
    main();
} catch (err) {
    console.error("Uncaught error: ", err);
}