/**
 * `vite-plugin-appsettings` — Runtime environment for Vite.
 *
 * Fuses two ideas:
 *   1. `.env` convention from Vite (.env, .env.[mode], .env.[mode].local).
 *   2. `.NET`-style `appsettings.json` served next to the bundle at runtime,
 *      so operators can change config **without rebuilding** the app.
 */

export type SubstitutionSyntax =
  | "dollar-basic" // $MY_VAR
  | "dollar-curly" // ${MY_VAR}
  | "handlebars"; // {{MY_VAR}}

/**
 * Two runtime strategies:
 *
 *   - `"json"` (default): emit `appsettings.json` next to `index.html`. The
 *     plugin rewrites index.html so that Vite's entry `<script type="module">`
 *     tags are only booted **after** the JSON is fetched. Operators can edit
 *     the JSON in place (Docker/K8s ConfigMap, mounted volume, etc.).
 *
 *   - `"placeholders"`: inline a mapping in index.html using `${VAR}` /
 *     `{{VAR}}` / `$VAR` placeholders. Meant for `envsubst`-style deployments
 *     where the config lives in real environment variables and the HTML is
 *     substituted at container start.
 */
export type Strategy = "json" | "placeholders";

export interface AppSettingsOptions {
  /**
   * Property name on `globalThis` that will hold the runtime env object.
   * The plugin rewrites `import.meta.env.VITE_FOO` to
   * `globalThis.<globalName>.VITE_FOO`. Defaults to `"__APP_ENV__"`.
   *
   * Must be a valid JavaScript identifier — no dots.
   */
  globalName?: string;

  /**
   * Filename emitted next to `index.html`. Defaults to `"appsettings.json"`.
   */
  filename?: string;

  /**
   * Runtime loading strategy. Defaults to `"json"`.
   */
  strategy?: Strategy;

  /**
   * When `strategy === "placeholders"`, controls the placeholder syntax.
   * Defaults to `"dollar-curly"`.
   */
  substitutionSyntax?: SubstitutionSyntax;

  /**
   * Envs to skip. Ignored envs stay statically inlined by Vite.
   * Useful for build-time-only info such as the current version.
   */
  ignoreEnv?: readonly string[] | ((name: string) => boolean);

  /**
   * When `strategy === "json"`, whether the emitted `appsettings.json`
   * should contain the values that Vite resolved at build time as
   * defaults. Defaults to `true`.
   */
  emitDefaults?: boolean;

  /**
   * Skip caching when fetching the JSON at runtime. Defaults to `true`,
   * so operators can hot-swap the file without cache-busting URLs.
   */
  noCache?: boolean;

  /**
   * Whether to auto-generate a `vite-env.d.ts` at the project root on
   * build. The file references `vite/client` and augments `ImportMetaEnv`
   * with every VITE_* key known to the plugin (consumed by the code or
   * present in the .env chain). If a `vite-env.d.ts` already exists, it
   * is left untouched. Defaults to `true`.
   */
  autoTypes?: boolean;

  /**
   * Filename of the generated typings file, relative to the project root.
   * Defaults to `"vite-env.d.ts"`. Change this if you ship a non-standard
   * setup (for example, a single `env.d.ts` covering multiple contexts).
   * May include subdirectories, e.g. `"entornos/appsettings.d.ts"`.
   */
  typesFile?: string;

  /**
   * Inline defaults. Merged on top of the .env chain with last-wins
   * semantics. Useful for things you don't want to expose in `.env`
   * files (e.g. build-time feature flags set from CI variables).
   *
   * Values are coerced to strings when written to `appsettings.json` so
   * the operator-facing file stays a flat string map.
   */
  defaults?: Record<string, unknown>;

  /**
   * Extra files to load defaults from. Each entry is a path that may be
   * absolute or relative to the project root. Supported extensions:
   *   - `.json` — parsed with `JSON.parse`
   *   - `.env`  — parsed by a tiny KEY=VALUE reader
   *   - `.js` / `.cjs` / `.mjs` / `.ts` / `.mts` — dynamic `import()`;
   *     the default export is used when present, otherwise the module's
   *     own object shape.
   *
   * Files are loaded in the order given, so the last entry wins.
   * Missing files produce a warning but do not abort the build.
   *
   * Example:
   *   extraFiles: ["entornos/staging.json", "entornos/secrets.local.ts"]
   */
  extraFiles?: readonly string[];

  /**
   * Directory used to resolve relative `extraFiles` paths. Defaults to
   * the directory containing the user's `vite.config.*`. You usually
   * don't need to set this.
   */
  baseDir?: string;

  /**
   * When `true`, the plugin serves the resolved `appsettings.json` over
   * Vite's dev middleware under the same path the loader expects at
   * runtime (i.e. `/appsettings.json` by default). This lets you point
   * your browser at `index.html` and see the production-style runtime
   * in dev mode too, without having to ship a static file next to the
   * app or run a second server. Defaults to `true`.
   */
  serveInDev?: boolean;
}

/** Fully-resolved options after normalization. */
export interface ResolvedOptions {
  globalName: string;
  filename: string;
  strategy: Strategy;
  substitutionSyntax: SubstitutionSyntax;
  ignoreEnv: ((name: string) => boolean) | null;
  emitDefaults: boolean;
  noCache: boolean;
  autoTypes: boolean;
  typesFile: string;
  defaults: Record<string, unknown> | null;
  extraFiles: readonly string[] | null;
  baseDir: string | null;
  serveInDev: boolean;
}
