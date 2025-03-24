//@ts-check
const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");

const BUILD_DIR = "./dist";

// All deps used in `electron.js`
const DEPENDENCIES = [
    "es-toolkit",
    "electron-log",
    "fs-extra",
    "graceful-fs",
    "jsonfile",
    "universalify",
    "lodash.defaultsdeep",
    "lodash.defaultto",
    "lodash.flattendeep",
    "lodash.isempty",
    "lodash.negate",
    "node-7z",
    "debug",
    "ms",
    "normalize-path",
    "7zip-bin",
    "which",
    "isexe",
    "xml2js",
    "sax",
    "xmlbuilder",
    "detect-file-encoding-and-language",
    "mime-types",
    "mime-db",
    "win-version-info",
    "napi-macros",
    "node-gyp-build"
];

execSync(
    "node ./scripts/fix-7zip-bin-permissions.js",
    { stdio: "inherit" }
);

fs.mkdirSync(BUILD_DIR, { recursive: true })

DEPENDENCIES.forEach((dep) => {
    fs.copySync(`node_modules/${dep}`, path.join(BUILD_DIR, `node_modules/${dep}`));
});
