//@ts-check
const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");

const BUILD_DIR = "./dist";

const ASSETS = {
    "resources" : "resources",
    "package.json": "package.json",
    "game-db.json": "game-db.json",
    "game-db.schema.json": "game-db.schema.json",
    "README.md": "README.md",

    // Electron unpackaged deps:
    "node_modules/node-gyp-build": "electron/node_modules/node-gyp-build",
    "node_modules/win-version-info": "electron/node_modules/win-version-info"
};

fs.mkdirSync(BUILD_DIR, { recursive: true })

const assetFiles = Object.keys(ASSETS);
assetFiles.forEach((assetFile) => {
    fs.copySync(assetFile, path.join(BUILD_DIR, ASSETS[assetFile]));
});

// Copy license info for prod dependencies to `3rdpartylicenses.json`
execSync(
    `npx license-checker-rseidelsohn --production --relativeLicensePath --relativeModulePath --json --out ${path.join(BUILD_DIR, "3rdpartylicenses.json")}`,
    { stdio: "inherit" }
);
