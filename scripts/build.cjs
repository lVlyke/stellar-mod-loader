// @ts-check
const { execSync } = require("child_process");
const fs = require("fs");

const BUILD_DIR = "./dist";
const RELEASE_MODE = process.argv.includes("--release");

fs.rmSync(BUILD_DIR, { recursive: true, force: true })

execSync(
    "node ./scripts/fix-7zip-bin-permissions.cjs",
    { stdio: "inherit" }
);

execSync(
    `npx ng build electron --configuration ${RELEASE_MODE ? "production" : "development"}`,
    { stdio: "inherit" }
);

execSync(
    `npx ng build browser --configuration ${RELEASE_MODE ? "production" : "development"}`,
    { stdio: "inherit" }
);

execSync(
    "node ./scripts/copy-assets.cjs",
    { stdio: "inherit" }
);
