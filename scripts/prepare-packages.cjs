// @ts-check
const fs = require("fs-extra");
const path = require("path");
const Seven = require("node-7z");
const sevenBin = require("7zip-bin");
const { version } = require("../package.json");

const PKG_DIR = "./out";
const SEQUENTIAL_MODE = process.argv.includes("--sequential");

(async() => {
    process.chdir(PKG_DIR);

    const appLicensePath = path.join("..", "LICENSE");
    const appReadmePath = path.join("..", "README.md");
    const packages = fs.readdirSync(".");
    const tasks = [];

    for (const pkgPath of packages) {
        if (fs.existsSync(pkgPath)) {
            // Read each built package
            if (fs.lstatSync(pkgPath).isDirectory() && !pkgPath.includes("template")) {
                const archivePath = `${pkgPath}_${version}.7z`;
                const pkgLicensePath = path.join(pkgPath, "LICENSE");
                const pkgReadmePath = path.join(pkgPath, "README.md");

                // Remove any previous archive
                fs.rmSync(archivePath, { force: true });

                // Rename the Electron license
                if (fs.existsSync(pkgLicensePath)) {
                    fs.moveSync(pkgLicensePath, path.join(pkgPath, "LICENSE.electron"), { overwrite: true });
                }

                // Copy the app license to base dir
                fs.copySync(appLicensePath, pkgLicensePath, { overwrite: true });

                // Copy the README to base dir
                fs.copySync(appReadmePath, pkgReadmePath, { overwrite: true });

                console.log(`Archiving package ${archivePath}`);

                // Compress into archive
                const compressTask = new Promise((resolve, reject) => {
                    const compressStream = Seven.add(archivePath, pkgPath, {
                        $bin: sevenBin.path7za
                    });

                    compressStream.on("end", () => resolve(true));
                    compressStream.on("error", err => reject(err));
                });
        
                if (SEQUENTIAL_MODE) {
                    await compressTask;
                } else {
                    tasks.push(compressTask);
                }
            } else {
                fs.rmSync(pkgPath, { force: true });
            }
        }
    }

    await Promise.all(tasks);

    process.chdir("..");
})();
