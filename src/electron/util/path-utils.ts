const path = require("path") as typeof import("path");
const fs = require("fs-extra") as typeof import("fs-extra");
const os = require("os") as typeof import("os");

export type SymlinkType = "file" | "dir" | "junction";

export namespace PathUtils {

    const LINK_SUPPORT_TEST_FILE = ".sml_link_test";

    export function expandPath(_path: string): string {
    
        // Normalize separators for the current platform
        _path = _path.replace(/[\\/]/g, path.sep);

        // Expand home dir
        if (_path[0] === "~") {
            _path = _path.replace(/~/, os.homedir());
        }

        // Expand Windows env vars
        return resolveWindowsEnvironmentVariables(_path);
    }

    export function firstValidPath(
        paths: string[],
        pathCheckTransformer: ((path: string) => string) | undefined
    ): string | undefined {
        return paths
                .map(_path => expandPath(_path))
                .find(_path => fs.existsSync(pathCheckTransformer ? pathCheckTransformer(_path) : _path));
    }

    // Credit: https://stackoverflow.com/a/57253723
    /**
    * Replaces all environment variables with their actual value.
    * Keeps intact non-environment variables using '%'.
    * @param  filePath The input file path with percents
    * @return          The resolved file path
    */
    export function resolveWindowsEnvironmentVariables(filePath: string): string {
        if (!filePath || typeof (filePath) !== "string") {
            return "";
        }

        /**
         * @param withPercents    "%USERNAME%"
         * @param withoutPercents "USERNAME"
         */
        filePath = filePath.replace(/%([^%]+)%/g, (withPercents: string, withoutPercents: string): string => {
            return process.env[withoutPercents] || withPercents;
        });

        return filePath;
    }

    export function asFileName(text: string): string {
        return text.replace(/[*?"<>|:./\\]/g, "_");
    }

    export function currentDateTimeAsFileName(): string {
        return asFileName(new Date().toISOString());
    }

    export function checkLinkSupported(
        targetPath: string,
        destPaths: string[],
        symlink: boolean,
        symlinkType?: SymlinkType
    ): boolean {
        if (!targetPath || !destPaths || destPaths.length === 0) {
            return false;
        }
        
        let srcTestFile = "";
        let srcCreatedDir = "";

        try {
            if (!fs.existsSync(targetPath)) {
                srcCreatedDir = mkdirpSync(targetPath);
            }

            if (fs.lstatSync(targetPath).isFile()) {
                targetPath = path.dirname(targetPath);
            }

            srcTestFile = path.resolve(path.join(targetPath, LINK_SUPPORT_TEST_FILE));
        
            if (!fs.existsSync(srcTestFile)) {
                fs.writeFileSync(srcTestFile, "");
            }

            return destPaths.every((destPath) => {
                let destTestFile = "";
                let destCreatedDir = "";

                try {
                    if (!destPath) {
                        return false;
                    }

                    if (!fs.existsSync(destPath)) {
                        destCreatedDir = mkdirpSync(destPath);
                    }

                    if (fs.lstatSync(destPath).isFile()) {
                        destPath = path.dirname(destPath);
                    }

                    destTestFile = path.resolve(path.join(destPath, LINK_SUPPORT_TEST_FILE));

                    // Allow link tests to the same dir if symlink type is file
                    if (srcTestFile === destTestFile && (!symlinkType || symlinkType === "file")) {
                        destTestFile = `${destTestFile}.1`;
                    }
    
                    // Create a test link
                    if (symlink) {
                        fs.symlinkSync(srcTestFile, destTestFile, symlinkType ?? null);
                    } else {
                        fs.linkSync(srcTestFile, destTestFile);
                    }
    
                    return true;
                } catch (err) {
                    return false;
                } finally {
                    if (destTestFile) {
                        try {
                            fs.removeSync(destTestFile);
                        } catch (err) {}
                    }

                    if (destCreatedDir) {
                        try {
                            fs.removeSync(destCreatedDir);
                        } catch (err) {}
                    }
                }

                return false;
            });
        } catch(err) {
            return false;
        } finally {
            if (srcTestFile) {
                try {
                    fs.removeSync(srcTestFile);
                } catch (err) {}
            }

            if (srcCreatedDir) {
                try {
                    fs.removeSync(srcCreatedDir);
                } catch (err) {}
            }
        }

        return false;
    }

    /** @return The outermost directory that was created. */ 
    export function mkdirpSync(pathToCreate: string): string {
        const pathParts = pathToCreate.split(path.sep);

        for (let i = 0, curPath = ""; i < pathParts.length; ++i) {
            let pathPart = pathParts[i];
            if (pathPart.length === 0) {
                pathPart = path.sep;
            }

            curPath = curPath.length === 0 ? pathPart : path.join(curPath, pathPart);

            if (!fs.existsSync(curPath)) {
                fs.mkdirpSync(pathToCreate);
                return curPath;
            }
        }

        return "";
    }
}