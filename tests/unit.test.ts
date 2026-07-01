import { describe, expect, test } from "vitest";

import { transformCode } from "../src/transform.js";
import { renderLoader, stripEntryScripts } from "../src/loader.js";

describe("transformCode", () => {
  const opts = {
    targetExpr: "globalThis.__APP_ENV__",
    sourcemap: false,
    shouldReplace: (n: string) => n.startsWith("VITE_"),
  };

  test("returns null when no import.meta.env is present", () => {
    expect(transformCode("const x = 1;", opts)).toBeNull();
  });

  test("returns null when nothing matches the predicate", () => {
    expect(
      transformCode("const x = import.meta.env.MODE;", opts),
    ).toBeNull();
  });

  test("rewrites matching identifiers", () => {
    const result = transformCode(
      "console.log(import.meta.env.VITE_FOO, import.meta.env.MODE);",
      opts,
    );
    expect(result).not.toBeNull();
    expect(result!.code).toContain("globalThis.__APP_ENV__.VITE_FOO");
    expect(result!.code).toContain("import.meta.env.MODE");
    expect(result!.used).toEqual(["VITE_FOO"]);
  });

  test("handles repeated occurrences of the same var", () => {
    const result = transformCode(
      "a=import.meta.env.VITE_A;b=import.meta.env.VITE_A;",
      opts,
    );
    expect(result!.used).toEqual(["VITE_A", "VITE_A"]);
    expect(result!.code).toBe(
      "a=globalThis.__APP_ENV__.VITE_A;b=globalThis.__APP_ENV__.VITE_A;",
    );
  });
});

describe("stripEntryScripts", () => {
  test("removes module scripts with src and captures crossorigin", () => {
    const html = [
      "<head>",
      '<script type="module" crossorigin src="/assets/index.js"></script>',
      '<script type="module" src="/assets/other.js"></script>',
      "</head>",
    ].join("");
    const { html: out, scripts } = stripEntryScripts(html);
    expect(out).toBe("<head></head>");
    expect(scripts).toEqual([
      { src: "/assets/index.js", crossorigin: "" },
      { src: "/assets/other.js", crossorigin: null },
    ]);
  });

  test("leaves inline module scripts untouched", () => {
    const html = '<head><script type="module">import "./x"</script></head>';
    const { html: out, scripts } = stripEntryScripts(html);
    expect(out).toBe(html);
    expect(scripts).toEqual([]);
  });
});

describe("renderLoader", () => {
  test("produces a self-invoking snippet with fetch + boot", () => {
    const snippet = renderLoader({
      globalName: "__APP_ENV__",
      filename: "appsettings.json",
      noCache: true,
      scripts: [{ src: "/assets/index.js", crossorigin: null }],
    });
    expect(snippet.startsWith("(function(){")).toBe(true);
    expect(snippet.endsWith("})();")).toBe(true);
    expect(snippet).toContain('"appsettings.json"');
    expect(snippet).toContain('"__APP_ENV__"');
    expect(snippet).toContain('cache:"no-store"');
  });

  test("omits no-store when noCache is false", () => {
    const snippet = renderLoader({
      globalName: "__APP_ENV__",
      filename: "appsettings.json",
      noCache: false,
      scripts: [],
    });
    expect(snippet).not.toContain("cache:");
  });
});
