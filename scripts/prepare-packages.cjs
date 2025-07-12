// @ts-check
const fs = require("fs-extra");
const path = require("path");
const Seven = require("node-7z");
const which = require("which");
const { version } = require("../package.json");

const PKG_DIR = "./out";
const SEQUENTIAL_MODE = process.argv.includes("--sequential");

function resolve7zBinaryPath() {
    // Look for 7-Zip installed on system
    const _7zBinaries = [
        "7zzs",
        "7zz",
        "7z",
        "7z.exe"
    ];

    const _7zBinaryLocations = [
        "C:\\Program Files\\7-Zip\\7z.exe",
        "C:\\Program Files (x86)\\7-Zip\\7z.exe"
    ];

    let _7zBinaryPath = _7zBinaryLocations.find(_7zPath => fs.existsSync(_7zPath));
    
    if (!_7zBinaryPath) {
        _7zBinaryPath = _7zBinaries.reduce((_7zBinaryPath, _7zBinaryPathGuess) => {
            try {
                const which7zBinaryPath = which.sync(_7zBinaryPathGuess);
                _7zBinaryPath ||= (Array.isArray(which7zBinaryPath)
                    ? which7zBinaryPath[0]
                    : which7zBinaryPath
                ) ?? undefined;
            } catch (_err) {}

            return _7zBinaryPath;
        }, _7zBinaryPath);
    }

    return _7zBinaryPath;
}

(async() => {
    const _7zBinaryPath = resolve7zBinaryPath();

    if (!_7zBinaryPath) {
        throw new Error("prepare-packages: 7-Zip is not installed or could not be found on PATH.");
    }

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
                        $bin: _7zBinaryPath
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
