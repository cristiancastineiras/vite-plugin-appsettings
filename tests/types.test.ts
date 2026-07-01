import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { build as viteBuild } from "vite";

import { appsettings } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "appsettings-types-"));
  // Anchor the resolver so it doesn't walk up to the user's home.
  writeFileSync(join(root, "package.json"), '{"name":"types-test"}');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function buildWith(opts: Parameters<typeof appsettings>[0] = {}) {
  // Minimal Vite project on disk: an html and a script that touches a
  // couple of VITE_* vars.
  writeFileSync(join(root, "index.html"), "<!doctype html><head></head><body></body>");
  writeFileSync(
    join(root, "main.ts"),
    `console.log(import.meta.env.VITE_API_URL, import.meta.env.VITE_FLAG);`,
  );
  writeFileSync(join(root, ".env"), "VITE_API_URL=https://example.com\nVITE_FLAG=true\n");

  // `writeBundle` only fires when Vite is writing the bundle, so the
  // typings feature is exercised end-to-end. We write into a sibling
  // `outDir` so we can clean it up in `afterEach`.
  const outDir = join(root, "dist");
  await viteBuild({
    root,
    logLevel: "silent",
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      modulePreload: { polyfill: false },
    },
    plugins: [appsettings(opts)],
  });
}

describe("auto-generated typings", () => {
  test("writes vite-env.d.ts to the project root on first build", async () => {
    await buildWith();

    const file = join(root, "vite-env.d.ts");
    expect(existsSync(file)).toBe(true);

    const src = readFileSync(file, "utf8");
    expect(src).toContain(`/// <reference types="vite/client" />`);
    expect(src).toMatch(/readonly VITE_API_URL: string;/);
    expect(src).toMatch(/readonly VITE_FLAG: string;/);
    expect(src).toContain("declare var __APP_ENV__: ImportMetaEnv");
  });

  test("does NOT overwrite an existing vite-env.d.ts", async () => {
    const guard = "/* USER MANAGED — DO NOT TOUCH */\n";
    writeFileSync(join(root, "vite-env.d.ts"), guard);

    await buildWith();

    const after = readFileSync(join(root, "vite-env.d.ts"), "utf8");
    expect(after).toBe(guard);
  });

  test("respects autoTypes: false", async () => {
    await buildWith({ autoTypes: false });
    expect(existsSync(join(root, "vite-env.d.ts"))).toBe(false);
  });

  test("respects a custom typesFile", async () => {
    await buildWith({ typesFile: "env.d.ts" });
    expect(existsSync(join(root, "env.d.ts"))).toBe(true);
    expect(existsSync(join(root, "vite-env.d.ts"))).toBe(false);
  });
});
