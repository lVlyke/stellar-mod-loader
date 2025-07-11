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
    "README.md": "README.md"
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
