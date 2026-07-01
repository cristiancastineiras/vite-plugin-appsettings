import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

import { collectEnvKeys, renderViteEnvDts } from "./codegen.js";
import { defaultsToJsonStrings, loadDefaults, type DefaultsObject } from "./defaults.js";
import { renderLoader, stripEntryScripts } from "./loader.js";
import { VITE_INTERNAL_ENVS, normalizeOptions, wrapPlaceholder } from "./options.js";
import { resolveProjectRoot } from "./project-root.js";
import { transformCode } from "./transform.js";
import type { AppSettingsOptions } from "./types.js";

/**
 * Runtime environment for Vite. Rewrites `import.meta.env.VITE_*` accesses
 * to a global object that is populated at page load from an external
 * `appsettings.json`. Defaults follow Vite's own `.env` convention.
 */
export function appsettings(options: AppSettingsOptions = {}): Plugin {
  const opts = normalizeOptions(options);
  const target = `globalThis.${opts.globalName}`;
  const used = new Set<string>();

  let config!: ResolvedConfig;
  let isServe = false;
  let envPrefix: string | readonly string[] = "VITE_";
  let projectRoot: string | null = null;
  // `extrasDefaults` is the merge of `opts.defaults` and every entry
  // from `opts.extraFiles`. Resolved asynchronously before the first
  // `generateBundle` call so build output is deterministic.
  let extrasDefaults: DefaultsObject = {};
  let extrasReady: Promise<void> | null = null;

  const inPrefix = (name: string): boolean => {
    // The name must have at least one character AFTER the prefix, so a
    // bare `import.meta.env.VITE_` (e.g. `VITE_*` in a doc comment) does
    // not slip in as an empty key.
    if (typeof envPrefix === "string") {
      return name.length > envPrefix.length && name.startsWith(envPrefix);
    }
    return envPrefix.some(
      (p) => name.length > p.length && name.startsWith(p),
    );
  };

  const shouldReplace = (name: string): boolean => {
    if (VITE_INTERNAL_ENVS.has(name)) return false;
    if (!inPrefix(name)) return false;
    return opts.ignoreEnv === null || !opts.ignoreEnv(name);
  };

  return {
    name: "vite-plugin-appsettings",
    // Must run before Vite's built-in `vite:define` plugin, which otherwise
    // statically inlines `import.meta.env.VITE_*` into the bundle.
    enforce: "pre",

    configResolved(resolved) {
      config = resolved;
      isServe = resolved.command === "serve";
      if (resolved.envPrefix) envPrefix = resolved.envPrefix;

      projectRoot = resolveProjectRoot({
        configRoot: resolved.root,
        configFile: resolved.configFile,
      });

      // Kick off async loading of extra defaults so the result is ready
      // by the time `generateBundle` runs (Vite awaits plugin promises).
      if (opts.extraFiles && opts.extraFiles.length > 0) {
        const baseDir = opts.baseDir ?? projectRoot;
        const promise = loadDefaults({
          viteEnv: {},
          defaults: opts.defaults ?? undefined,
          extraFiles: opts.extraFiles,
          baseDir,
        })
          .then((merged) => {
            extrasDefaults = merged;
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(
              "[vite-plugin-appsettings] failed to load extra defaults:",
              (err as Error).message,
            );
          });
        extrasReady = promise;
      } else if (opts.defaults) {
        extrasDefaults = { ...opts.defaults };
      }
    },

    transform(code, id) {
      // During dev, Vite already serves `import.meta.env` from .env files
      // with HMR — there is nothing to rewrite.
      if (isServe) return null;
      // Skip virtual modules and dependencies that never hit env directly.
      if (id.includes("/node_modules/")) return null;
      if (id.startsWith("\0")) return null;

      const result = transformCode(code, {
        targetExpr: target,
        shouldReplace,
        sourcemap: !!config.build.sourcemap,
      });
      if (result === null) return null;
      for (const name of result.used) used.add(name);
      return result.map === null
        ? result.code
        : { code: result.code, map: result.map };
    },

    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (isServe) return html;

        if (opts.strategy === "placeholders") {
          if (used.size === 0) return html;
          const entries: string[] = [];
          for (const name of used) {
            entries.push(
              `${JSON.stringify(name)}:${JSON.stringify(
                wrapPlaceholder(name, opts.substitutionSyntax),
              )}`,
            );
          }
          const inline = `${target}=JSON.parse('{${entries.join(",")}}');`;
          return injectHead(html, `<script>${inline}</script>`);
        }

        // JSON strategy — strip module entries and inject a loader that
        // populates `globalThis[globalName]` from `appsettings.json` before
        // re-inserting them.
        const stripped = stripEntryScripts(html);
        if (stripped.scripts.length === 0) return html;
        const loader = renderLoader({
          globalName: opts.globalName,
          filename: opts.filename,
          noCache: opts.noCache,
          scripts: stripped.scripts,
        });
        return injectHead(stripped.html, `<script>${loader}</script>`);
      },
    },

    async generateBundle() {
      if (isServe) return;
      if (opts.strategy !== "json") return;

      // Wait for the async extras load to finish so the JSON we emit is
      // the *final* merge, not a half-baked intermediate.
      if (extrasReady) await extrasReady;

      if (!opts.emitDefaults) {
        // Still emit an empty scaffold so ops teams see the file exists.
        this.emitFile({
          type: "asset",
          fileName: opts.filename,
          source: "{}\n",
        });
        return;
      }

      const defaults: Record<string, string> = {};

      // 1) Vite's .env chain.
      for (const [key, value] of Object.entries(config.env)) {
        if (VITE_INTERNAL_ENVS.has(key)) continue;
        if (typeof value !== "string") continue;
        if (!shouldReplace(key)) continue;
        defaults[key] = value;
      }

      // 2) Inline defaults + extraFiles (already merged into
      //    `extrasDefaults` by the time we get here). Values are
      //    coerced to strings so the emitted file is flat.
      for (const [k, v] of Object.entries(defaultsToJsonStrings(extrasDefaults))) {
        defaults[k] = v;
      }

      // 3) Make sure every var actually consumed by the app has an
      //    entry, even if it is missing everywhere — otherwise operators
      //    can't discover what knobs exist.
      for (const name of used) {
        if (!(name in defaults)) defaults[name] = "";
      }

      this.emitFile({
        type: "asset",
        fileName: opts.filename,
        source: `${JSON.stringify(defaults, null, 2)}\n`,
      });
    },

    /**
     * After the bundle is written, drop a typings file next to the
     * user's `vite.config.*` so TypeScript knows about the VITE_* vars
     * the plugin will manage at runtime.
     */
    async writeBundle() {
      if (isServe) return;
      if (!opts.autoTypes) return;
      // Wait for async extras — we need their keys to type-check.
      if (extrasReady) await extrasReady;

      const root = projectRoot ?? config.root;
      const target = join(root, opts.typesFile);
      // Respect a user-managed file — the user is the source of truth
      // for their own typings, and the plugin is a polite guest.
      if (existsSync(target)) return;

      const keys = collectEnvKeys({
        used,
        env: config.env,
        extras: extrasDefaults,
        globalName: opts.globalName,
        envPrefix,
        shouldReplace,
      });

      // Always reference at least the global so `globalThis[globalName]`
      // is typed even when the project consumes zero VITE_* vars.
      const source = renderViteEnvDts(keys, opts.globalName);

      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source, "utf8");
    },
  };
}

function injectHead(html: string, snippet: string): string {
  const idx = html.search(/<\/head>/i);
  if (idx === -1) {
    // No <head> — fall back to prepending at document start.
    return snippet + html;
  }
  return html.slice(0, idx) + snippet + html.slice(idx);
}
