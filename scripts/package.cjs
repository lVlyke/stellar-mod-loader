// @ts-check
const { execSync } = require("child_process");
const appPackage = require("../package.json");
const fs = require("fs");
const fsPromises = require("fs").promises;

const BUILD_DIR = "./dist";
const PKG_DIR = "./out";
const ICON_FILE = "./public/favicon.ico";
const BUILD_ALL = process.argv.includes("--all");
const RELEASE_MODE = process.argv.includes("--release");

(async () => {
    const clearPkgDirTask = fsPromises.rm(PKG_DIR, { recursive: true, force: true });

    if (RELEASE_MODE || !fs.existsSync(BUILD_DIR)) {
        execSync(
            `node ./scripts/build.cjs ${RELEASE_MODE ? "--release" : ""}`,
            { stdio: "inherit" }
        );
    }

    // Clear out dir while doing prework
    await clearPkgDirTask;
    
    execSync([
        `npx electron-packager ${BUILD_DIR} ${appPackage.name} --out ${PKG_DIR} --overwrite --no-tmpdir --icon=${ICON_FILE}`,
        BUILD_ALL ? " --platform 'win32, linux' --arch 'ia32, x64, armv7l, arm64'" : ""
    ].join(""), { stdio: "inherit" });
})();
