/**
 * Loading the value of every env var that should land in
 * `appsettings.json` (or be exposed in the generated typings).
 *
 * Sources, in priority order (later wins):
 *   1. Vite-resolved `config.env` (`.env`, `.env.[mode]`, `.env.[mode].local`).
 *   2. `options.defaults` — an inline object the user passes in JS.
 *   3. `options.extraFiles` — extra JSON/JS/TS files referenced by path,
 *      for setups like `entornos/staging.json` or `config/extra.json`.
 *
 * Resolving a TS/JS file is intentionally simple: we hand the path to a
 * dynamic `import()`. That lets the user use `import.meta.env`-style code
 * and gets tree-shaken bundling. JSON files are read with `readFile` and
 * parsed with `JSON.parse` — fast and zero-dep.
 */
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type DefaultsObject = Record<string, unknown>;

export interface LoadDefaultsInput {
  /** Vite's resolved `config.env` map. May be empty in test environments. */
  viteEnv: Readonly<Record<string, unknown>>;
  /** Inline defaults the user passed in JS. */
  defaults?: DefaultsObject | undefined;
  /**
   * Extra files to load. Paths can be absolute or relative to `baseDir`.
   * Supported extensions: `.json`, `.env`, `.js`, `.cjs`, `.mjs`, `.ts`,
   * `.mts`. Unknown extensions fall back to a JSON parse.
   */
  extraFiles?: readonly string[] | undefined;
  /** Directory used to resolve relative `extraFiles` paths. */
  baseDir: string;
}

const JSON_EXT = new Set([".json"]);
const TEXT_EXT = new Set([".env"]);
const MODULE_EXT = new Set([".js", ".cjs", ".mjs", ".ts", ".mts"]);

/**
 * A tiny `.env` parser — good enough for our use case.
 *
 *   KEY=value
 *   KEY="quoted value"
 *   # comments
 *   empty lines
 */
export function parseEnvText(text: string): DefaultsObject {
  const out: DefaultsObject = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadFileAsDefaults(absPath: string): Promise<DefaultsObject> {
  const ext = extname(absPath).toLowerCase();
  if (JSON_EXT.has(ext)) {
    const raw = readFileSync(absPath, "utf8");
    return JSON.parse(raw) as DefaultsObject;
  }
  if (TEXT_EXT.has(ext)) {
    return parseEnvText(readFileSync(absPath, "utf8"));
  }
  if (MODULE_EXT.has(ext)) {
    // Dynamic import supports TS via the active loader (tsx, vite-node,
    // tsx-watch, etc.). In a real Vite build the file is also resolvable
    // through Vite's plugin pipeline if it sits inside `root`.
    const mod = (await import(pathToFileURL(absPath).href)) as
      | { default?: DefaultsObject }
      | DefaultsObject;
    if (mod && typeof mod === "object" && "default" in mod && mod.default) {
      return mod.default as DefaultsObject;
    }
    return mod as DefaultsObject;
  }
  // Unknown extension — try JSON, otherwise give up with an empty object.
  try {
    return JSON.parse(readFileSync(absPath, "utf8")) as DefaultsObject;
  } catch {
    return {};
  }
}

/**
 * Merge N objects with last-wins semantics. Non-object values overwrite;
 * nested objects are shallow-merged.
 */
export function mergeDefaults(...layers: readonly DefaultsObject[]): DefaultsObject {
  const out: DefaultsObject = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof out[k] === "object" &&
        out[k] !== null &&
        !Array.isArray(out[k])
      ) {
        out[k] = { ...(out[k] as DefaultsObject), ...(v as DefaultsObject) };
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * Top-level loader used by the plugin. Always succeeds (errors in any
 * extra file are surfaced as a console warning and skipped — the rest of
 * the defaults still apply).
 *
 * Merge order (last wins):
 *   1. Vite's resolved `config.env`.
 *   2. Each entry of `extraFiles`, in order.
 *   3. The inline `defaults` object — the user's most explicit knob.
 */
export async function loadDefaults(input: LoadDefaultsInput): Promise<DefaultsObject> {
  const layers: DefaultsObject[] = [];

  // 1) Vite's resolved env.
  if (input.viteEnv && typeof input.viteEnv === "object") {
    layers.push({ ...input.viteEnv });
  }

  // 2) Extra files.
  if (input.extraFiles && input.extraFiles.length > 0) {
    for (const f of input.extraFiles) {
      const abs = isAbsolute(f) ? f : resolve(input.baseDir, f);
      if (!existsSync(abs)) {
        // eslint-disable-next-line no-console
        console.warn(`[vite-plugin-appsettings] extraDefaults file not found: ${abs}`);
        continue;
      }
      try {
        const obj = await loadFileAsDefaults(abs);
        layers.push(obj);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[vite-plugin-appsettings] failed to load ${abs}:`,
          (err as Error).message,
        );
      }
    }
  }

  // 3) Inline defaults — the most explicit source.
  if (input.defaults) {
    layers.push({ ...input.defaults });
  }

  return mergeDefaults(...layers);
}

/**
 * Stringify a defaults object to the JSON Vite will write into the
 * emitted `appsettings.json` asset. Non-string values are coerced via
 * `String(...)` so we keep the file flat (operators expect to edit it
 * as JSON in vim / kubectl / GitHub).
 */
export function defaultsToJsonStrings(
  defaults: Readonly<DefaultsObject>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(defaults)) {
    out[k] = v === null || v === undefined ? "" : typeof v === "string" ? v : String(v);
  }
  return out;
}
