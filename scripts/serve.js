// @ts-check
const fs = require("fs-extra");
const execSync = require("child_process").execSync;
const spawn = require("child_process").spawn;

const BUILD_DIR = "./dist";
const BUILD_DATE_FILE = `${BUILD_DIR}/lastbuild.txt`;
const RELEASE_MODE = process.argv.includes("--release");
const DISABLE_SANDBOX = process.argv.includes("--no-sandbox");

let electronProcess;

function buildApp() {
    return spawn("npx", [
        "ng",
        "build",
        "--configuration",
        RELEASE_MODE ? "production" : "development",
        "--watch",
        "--poll", 
        "1000"
    ], { detached: true });
}

function startApp(buildTask) {
    console.log("Starting Electron app");

    electronProcess = spawn("npx", [
        process.env.ELECTRON_BINARY ?? 'electron',
        BUILD_DIR,
        ...DISABLE_SANDBOX ? ["--no-sandbox"] : []
    ]);

    electronProcess.stdout.on("data", (data) => {
        console.log(data.toString());
    });

    electronProcess.stderr.on("data", (data) => {
        console.error(data.toString());
    });

    electronProcess.on("close", () => {
        console.log("Finished serving");

        // Kill ng build process
        if (buildTask.pid) {
            process.kill(-buildTask.pid);
            buildTask.kill();
        }

        process.exit();
    });
}

function prepareApp(buildTask) {
    // Make sure app files have been generated before continuing
    if (!fs.existsSync(BUILD_DIR)) {
        return setTimeout(() => prepareApp(buildTask), 1000);
    }

    // Copy app assets
    execSync(
        "node ./scripts/copy-assets.js",
        { stdio: "inherit" }
    );

    // Update the build date file (used for hot reloading)
    fs.writeJsonSync(BUILD_DATE_FILE, { date: new Date() });

    // Start the app if not started
    if (!electronProcess) {
        startApp(buildTask);
    }
}

(function main() {
    execSync(
        "node ./scripts/fix-7zip-bin-permissions.js",
        { stdio: "inherit" }
    );

    const buildTask = buildApp();
    
    buildTask.stdout.on("data", (data) => {
        console.log(data.toString());
    
        if (!data.includes("Output location")) {
            return;
        }
    
        prepareApp(buildTask);
    });
    
    buildTask.stderr.on("data", (data) => console.error(data.toString()));
})();