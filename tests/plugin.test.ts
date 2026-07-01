import { describe, expect, test } from "vitest";

import { appsettings } from "../src/index.js";
import { assetSource, build, findAsset, findChunk } from "./utils.js";

describe("json strategy", () => {
  test("emits appsettings.json with defaults from Vite's .env chain", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings()],
    });

    const json = JSON.parse(assetSource(findAsset(result, "appsettings.json")));
    expect(json).toEqual({
      VITE_API_URL: "https://api.example.com",
      VITE_FEATURE_FLAG: "true",
      VITE_BUILD_ID: "prod-1.0.0",
    });
  });

  test("rewrites import.meta.env.VITE_* to globalThis.__APP_ENV__.*", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings()],
    });

    const entry = findChunk(result, (n) => n.endsWith(".js"));
    expect(entry.code).toContain("globalThis.__APP_ENV__.VITE_API_URL");
    expect(entry.code).toContain("globalThis.__APP_ENV__.VITE_FEATURE_FLAG");
    expect(entry.code).not.toContain('"https://api.example.com"');
  });

  test("strips module scripts from index.html and injects loader", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings()],
    });

    const html = assetSource(findAsset(result, "index.html"));
    // Original entry script tag must be removed…
    expect(html).not.toMatch(/<script[^>]*type=["']module["'][^>]*src=/i);
    // …and the loader must be present.
    expect(html).toContain('"appsettings.json"');
    expect(html).toContain('"__APP_ENV__"');
    expect(html).toContain("globalThis[g]=e||{}");
    expect(html).toContain('cache:"no-store"');
  });

  test("respects a custom globalName", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings({ globalName: "MY_ENV" })],
    });

    const entry = findChunk(result, (n) => n.endsWith(".js"));
    expect(entry.code).toContain("globalThis.MY_ENV.VITE_API_URL");
    const html = assetSource(findAsset(result, "index.html"));
    expect(html).toContain('"MY_ENV"');
  });

  test("respects a custom filename", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings({ filename: "runtime-config.json" })],
    });

    expect(() => findAsset(result, "runtime-config.json")).not.toThrow();
    const html = assetSource(findAsset(result, "index.html"));
    expect(html).toContain('"runtime-config.json"');
  });

  test("ignoreEnv keeps a var statically inlined and out of appsettings.json", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings({ ignoreEnv: ["VITE_BUILD_ID"] })],
    });

    const entry = findChunk(result, (n) => n.endsWith(".js"));
    expect(entry.code).toContain('"prod-1.0.0"');
    expect(entry.code).not.toContain("globalThis.__APP_ENV__.VITE_BUILD_ID");

    const json = JSON.parse(assetSource(findAsset(result, "appsettings.json")));
    expect(json).not.toHaveProperty("VITE_BUILD_ID");
    expect(json).toHaveProperty("VITE_API_URL");
  });

  test("ignoreEnv accepts a predicate", async () => {
    const result = await build({
      mode: "production",
      plugins: [
        appsettings({ ignoreEnv: (n) => n.endsWith("_BUILD_ID") }),
      ],
    });

    const json = JSON.parse(assetSource(findAsset(result, "appsettings.json")));
    expect(json).not.toHaveProperty("VITE_BUILD_ID");
  });

  test("emitDefaults: false yields an empty scaffold", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings({ emitDefaults: false })],
    });

    expect(assetSource(findAsset(result, "appsettings.json")).trim()).toBe("{}");
  });
});

describe("placeholders strategy", () => {
  test("inlines a JSON mapping using ${VAR} placeholders by default", async () => {
    const result = await build({
      mode: "production",
      plugins: [appsettings({ strategy: "placeholders" })],
    });

    const html = assetSource(findAsset(result, "index.html"));
    expect(html).toContain(
      'globalThis.__APP_ENV__=JSON.parse(\'{"VITE_API_URL":"${VITE_API_URL}"',
    );
    // No appsettings.json is emitted in placeholder mode.
    expect(
      result.output.some((o: { fileName: string }) => o.fileName === "appsettings.json"),
    ).toBe(false);
  });

  test("supports handlebars syntax", async () => {
    const result = await build({
      mode: "production",
      plugins: [
        appsettings({ strategy: "placeholders", substitutionSyntax: "handlebars" }),
      ],
    });

    const html = assetSource(findAsset(result, "index.html"));
    expect(html).toContain('"VITE_API_URL":"{{VITE_API_URL}}"');
  });

  test("supports basic dollar syntax", async () => {
    const result = await build({
      mode: "production",
      plugins: [
        appsettings({ strategy: "placeholders", substitutionSyntax: "dollar-basic" }),
      ],
    });

    const html = assetSource(findAsset(result, "index.html"));
    expect(html).toContain('"VITE_API_URL":"$VITE_API_URL"');
  });
});

describe("options validation", () => {
  test("throws when globalName is not a valid identifier", () => {
    expect(() => appsettings({ globalName: "window.env" })).toThrow(
      /valid JS identifier/,
    );
  });
});

describe("prefix boundary", () => {
  test("does not capture a bare prefix (e.g. VITE_* from a doc comment)", async () => {
    // Add a fixture-like plugin that emits a comment referencing the bare
    // prefix. If the plugin were to treat `VITE_` as a real var, it would
    // show up as an empty string in appsettings.json.
    const result = await build({
      mode: "production",
      plugins: [
        {
          name: "test-inject-comment",
          enforce: "pre",
          transform(code: string, id: string) {
            if (id.endsWith("main.ts")) {
              return `// import.meta.env.VITE_*\n${code}`;
            }
            return null;
          },
        },
        appsettings(),
      ],
    });

    const json = JSON.parse(assetSource(findAsset(result, "appsettings.json")));
    expect(json).not.toHaveProperty("VITE_");
  });
});
