/**
 * Project-root resolution.
 *
 * Vite's `config.root` is whatever the user passed (or CWD). The plugin
 * sometimes needs the *project root* — the directory that owns
 * `package.json` and `vite.config.*`. We walk upwards from `config.root`
 * looking for those markers so the typings file lands in the right place
 * even when the user has a "Vite lives in a subfolder" layout.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MARKERS = [
  "package.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
  "vite.config.cjs",
];

export interface ResolveProjectRootInput {
  /** `config.root` (Vite's working directory). May already be the project root. */
  configRoot: string;
  /**
   * The user's `vite.config.*` file, resolved by Vite. Optional but
   * strongly preferred when present.
   */
  configFile?: string | undefined;
}

/**
 * Best-effort lookup of the project root.
 *
 * Priority:
 *   1. The directory containing the user's `vite.config.*` (when known).
 *   2. The nearest ancestor of `configRoot` that has any of the markers,
 *      starting **at** `configRoot` itself (so a temp directory with a
 *      `package.json` is recognized as its own project root).
 *   3. `configRoot` itself (the safe default).
 */
export function resolveProjectRoot(input: ResolveProjectRootInput): string {
  if (input.configFile) {
    return dirname(resolve(input.configFile));
  }

  let dir = resolve(input.configRoot);
  // Bound the walk — a runaway loop would be embarrassing in CI.
  for (let i = 0; i < 16; i++) {
    if (MARKERS.some((m) => existsSync(resolve(dir, m)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(input.configRoot);
}
