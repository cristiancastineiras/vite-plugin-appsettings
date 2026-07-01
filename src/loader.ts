/**
 * Runtime loader emitted into `index.html`. Written by hand so it stays
 * tiny (< 500 bytes gzipped) and doesn't rely on any TS/bundler helper.
 *
 * Contract:
 *   1. Vite's entry `<script type="module" src="...">` tags have been
 *      stripped from the HTML at build time by the plugin.
 *   2. Our loader fetches `appsettings.json`, assigns it to
 *      `globalThis[<globalName>]`, then dynamically injects the module
 *      scripts so the app boots with the runtime config ready.
 *
 * The snippet is intentionally kept as plain ES5-ish JS to survive
 * heavy minification and to work in any evergreen browser.
 */

export interface StrippedScript {
  src: string;
  /** `null` = no crossorigin attribute. Empty string = bare attribute. */
  crossorigin: string | null;
}

export interface LoaderInput {
  globalName: string;
  filename: string;
  noCache: boolean;
  scripts: readonly StrippedScript[];
}

/**
 * Render the loader as a single-line string suitable for embedding as an
 * inline `<script>`. Ordering: we assign the env FIRST, then create the
 * script tags, so importer code can synchronously read the global on module
 * evaluation.
 */
export function renderLoader(input: LoaderInput): string {
  const gn = JSON.stringify(input.globalName);
  const fn = JSON.stringify(input.filename);
  const scripts = JSON.stringify(input.scripts);
  const fetchOpts = input.noCache ? `,{cache:"no-store"}` : "";

  // A single IIFE. `boot` runs both on success and on failure so the app
  // always starts — a broken/missing appsettings.json falls back to `{}`.
  return (
    `(function(){var g=${gn},f=${fn},s=${scripts};` +
    `function boot(e){globalThis[g]=e||{};` +
    `for(var i=0;i<s.length;i++){var o=s[i],n=document.createElement("script");` +
    `n.type="module";n.src=o.src;` +
    `if(o.crossorigin!==null)n.setAttribute("crossorigin",o.crossorigin);` +
    `document.head.appendChild(n)}}` +
    `fetch(f${fetchOpts}).then(function(r){return r.ok?r.json():{}}).then(boot).catch(function(){boot({})})})();`
  );
}

/**
 * Regex used to remove Vite's entry module scripts from `index.html`.
 * Captures the `src` and (optional) `crossorigin` attribute values.
 *
 * Vite emits e.g.: `<script type="module" crossorigin src="/assets/x.js"></script>`
 */
const MODULE_SCRIPT_RE = /<script\b([^>]*\btype=(?:"module"|'module'|module)[^>]*)>\s*<\/script>/gi;

const SRC_RE = /\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const CROSSORIGIN_RE = /\bcrossorigin(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/i;

export interface StripResult {
  html: string;
  scripts: StrippedScript[];
}

/**
 * Remove Vite's `<script type="module" src>` tags from the HTML and return
 * them so the runtime loader can re-inject them after the JSON has loaded.
 * Inline module scripts (no `src`) are left untouched — they may contain
 * user code that must run at HTML parse time.
 */
export function stripEntryScripts(html: string): StripResult {
  const scripts: StrippedScript[] = [];
  const out = html.replace(MODULE_SCRIPT_RE, (whole, attrs: string) => {
    const src = SRC_RE.exec(attrs);
    if (!src) return whole;
    const srcVal = (src[1] ?? src[2] ?? src[3] ?? "").trim();
    if (!srcVal) return whole;
    const co = CROSSORIGIN_RE.exec(attrs);
    const coVal = co ? (co[1] ?? co[2] ?? co[3] ?? "") : null;
    scripts.push({ src: srcVal, crossorigin: coVal });
    return "";
  });
  return { html: out, scripts };
}
