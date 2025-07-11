// @ts-check
const { execSync } = require("child_process");
const sevenBin = require("7zip-bin");

// Workaround for 7zip-bin issue: https://github.com/develar/7zip-bin/issues/19
// TODO - Remove when this issue is fixed
if (process.platform !== "win32") {
    execSync(
        `chmod +x ${sevenBin.path7za}`,
        { stdio: "inherit" }
    );

    execSync(
        `chmod +x ${sevenBin.path7x}`,
        { stdio: "inherit" }
    );
}