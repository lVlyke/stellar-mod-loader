import { isEqualWith } from "es-toolkit";

export namespace LangUtils {

    export function entries<T extends object>(value: T): Array<[keyof T, T[keyof T]]> {
        return Object.entries(value) as Array<[keyof T, T[keyof T]]>;
    }

    /** @description Determines if two objects are value-equal by a deep comparison of the objects. */
    export function isEqual(a: unknown, b: unknown): boolean {
        return isEqualWith(a, b, function (value: any, other: any): boolean | undefined {

            // Preserve ordering of `Map` keys during comparison as they are de facto order-dependent
            if (value instanceof Map && other instanceof Map) {
                return isEqual(Array.from(value.entries()), Array.from(other.entries()));
            }

            return undefined;
        });
    }

    export function normalizeFilePath(path: string, sep: string): string {
        return path
            .toLowerCase()
            .replace(/[/\\]/g, sep);
    }

    export function compareVersions(a: string, b: string): number {
        if (a.startsWith(b + "-")) {
            return -1;
        }

        if (b.startsWith(a + "-")) {
            return 1;
        }

        return a.localeCompare(b, undefined, {
            numeric: true,
            caseFirst: "upper",
            sensitivity: "case"
        });
    }
}
