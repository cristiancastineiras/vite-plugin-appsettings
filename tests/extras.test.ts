import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { build as viteBuild } from "vite";

import { appsettings } from "../src/index.js";
import { defaultsToJsonStrings, loadDefaults, mergeDefaults, parseEnvText } from "../src/defaults.js";
import { resolveProjectRoot } from "../src/project-root.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "appsettings-extras-"));
  // Anchor the resolver so it doesn't walk up to the user's home.
  writeFileSync(join(root, "package.json"), '{"name":"extras-test"}');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function buildWith(
  opts: Parameters<typeof appsettings>[0] = {},
  files: Record<string, string> = {},
) {
  writeFileSync(join(root, "index.html"), "<!doctype html><head></head><body></body>");
  writeFileSync(
    join(root, "main.ts"),
    `console.log(import.meta.env.VITE_FROM_ENV, import.meta.env.VITE_FROM_FILE);`,
  );

  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }

  await viteBuild({
    root,
    logLevel: "silent",
    build: {
      outDir: join(root, "dist"),
      emptyOutDir: true,
      minify: false,
      modulePreload: { polyfill: false },
    },
    plugins: [appsettings(opts)],
  });
}

describe("parseEnvText", () => {
  test("parses simple key=value", () => {
    expect(parseEnvText("FOO=bar\nBAZ=qux\n# comment\n\n")).toEqual({
      FOO: "bar",
      BAZ: "qux",
    });
  });

  test("strips surrounding quotes", () => {
    expect(parseEnvText('FOO="bar baz"\nQ=\'one\'')).toEqual({
      FOO: "bar baz",
      Q: "one",
    });
  });
});

describe("mergeDefaults", () => {
  test("shallow merge with last-wins", () => {
    expect(mergeDefaults({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({
      a: 1,
      b: 3,
      c: 4,
    });
  });

  test("deep merges nested objects", () => {
    expect(mergeDefaults({ a: { x: 1, y: 2 } }, { a: { y: 99, z: 3 } })).toEqual({
      a: { x: 1, y: 99, z: 3 },
    });
  });
});

describe("loadDefaults", () => {
  test("loads a .json extraFile", async () => {
    writeFileSync(join(root, "extra.json"), JSON.stringify({ FOO: "json", BAR: 1 }));
    const out = await loadDefaults({
      viteEnv: {},
      extraFiles: ["extra.json"],
      baseDir: root,
    });
    expect(out).toEqual({ FOO: "json", BAR: 1 });
  });

  test("loads a .env extraFile", async () => {
    writeFileSync(join(root, "staging.env"), "A=1\nB=two\n");
    const out = await loadDefaults({
      viteEnv: {},
      extraFiles: ["staging.env"],
      baseDir: root,
    });
    expect(out).toEqual({ A: "1", B: "two" });
  });

  test("inline defaults merge with extra files", async () => {
    writeFileSync(join(root, "extra.json"), JSON.stringify({ A: "from-file" }));
    const out = await loadDefaults({
      viteEnv: { A: "vite", B: "vite" },
      defaults: { B: "inline" },
      extraFiles: ["extra.json"],
      baseDir: root,
    });
    expect(out).toEqual({ A: "from-file", B: "inline" });
  });

  test("warns on missing file and continues", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await loadDefaults({
      viteEnv: { A: "vite" },
      extraFiles: ["does-not-exist.json"],
      baseDir: root,
    });
    expect(out).toEqual({ A: "vite" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("defaultsToJsonStrings", () => {
  test("coerces non-string values to strings", () => {
    expect(
      defaultsToJsonStrings({ A: 1, B: true, C: null, D: undefined, E: "x" }),
    ).toEqual({ A: "1", B: "true", C: "", D: "", E: "x" });
  });
});

describe("resolveProjectRoot", () => {
  test("walks up from configRoot until it finds package.json", () => {
    const sub = join(root, "a", "b", "c");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    expect(resolveProjectRoot({ configRoot: sub })).toBe(root);
  });

  test("prefers the directory of the explicit configFile", () => {
    const sub = join(root, "configs", "deep");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    expect(
      resolveProjectRoot({
        configRoot: sub,
        configFile: join(sub, "vite.config.ts"),
      }),
    ).toBe(sub);
  });

  test("returns configRoot when an ancestor has a marker", () => {
    // We placed a package.json in `root` in beforeEach. A leaf under
    // `root` has no marker of its own, so the resolver should climb to
    // `root` and stop there.
    const isolated = mkdtempSync(join(root, "leaf-"));
    expect(resolveProjectRoot({ configRoot: isolated })).toBe(root);
  });
});

describe("plugin end-to-end with extras", () => {
  test("merges an extraFiles JSON into appsettings.json", async () => {
    await buildWith(
      {
        extraFiles: ["entornos/staging.json"],
        autoTypes: false,
        emitDefaults: true,
      },
      {
        "entornos/staging.json": JSON.stringify({
          VITE_FROM_FILE: "from-extra",
        }),
        ".env": "VITE_FROM_ENV=from-env\n",
      },
    );

    const json = JSON.parse(
      readFileSync(join(root, "dist", "appsettings.json"), "utf8"),
    );
    expect(json.VITE_FROM_ENV).toBe("from-env");
    expect(json.VITE_FROM_FILE).toBe("from-extra");
  });

  test("inline defaults override everything", async () => {
    await buildWith(
      {
        defaults: { VITE_FROM_FILE: "from-inline" },
        extraFiles: ["entornos/staging.json"],
        autoTypes: false,
      },
      {
        "entornos/staging.json": JSON.stringify({ VITE_FROM_FILE: "from-file" }),
      },
    );

    const json = JSON.parse(
      readFileSync(join(root, "dist", "appsettings.json"), "utf8"),
    );
    expect(json.VITE_FROM_FILE).toBe("from-inline");
  });

  test("types file lands in a subfolder when typesFile contains one", async () => {
    await buildWith(
      {
        autoTypes: true,
        typesFile: "entornos/appsettings.d.ts",
        defaults: { VITE_FROM_FILE: "x" },
      },
      {},
    );
    const target = join(root, "entornos", "appsettings.d.ts");
    expect(readFileSync(target, "utf8")).toContain("VITE_FROM_FILE");
  });
});
