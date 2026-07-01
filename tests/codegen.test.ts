import { describe, expect, test } from "vitest";

import { collectEnvKeys, renderViteEnvDts } from "../src/codegen.js";

const ALLOW = (n: string) => n.startsWith("VITE_");

describe("collectEnvKeys", () => {
  test("merges consumed + env-chain keys and dedupes", () => {
    const keys = collectEnvKeys({
      used: new Set(["VITE_API_URL", "VITE_FEATURE_FLAG"]),
      env: {
        VITE_API_URL: "https://example.com",
        VITE_FEATURE_FLAG: "true",
        VITE_ENVIRONMENT_LABEL: "production",
        MODE: "production", // should be filtered
        SECRET_KEY: "no", // wrong prefix
      },
      globalName: "__APP_ENV__",
      envPrefix: "VITE_",
      shouldReplace: ALLOW,
    });

    expect(keys).toEqual([
      "VITE_API_URL",
      "VITE_ENVIRONMENT_LABEL",
      "VITE_FEATURE_FLAG",
    ]);
  });

  test("respects a custom envPrefix array", () => {
    const keys = collectEnvKeys({
      used: new Set<string>(),
      env: {
        VITE_FOO: "x",
        PUBLIC_BAR: "y",
        OTHER: "z",
      },
      globalName: "__APP_ENV__",
      envPrefix: ["VITE_", "PUBLIC_"],
      shouldReplace: (n) =>
        n.startsWith("VITE_") || n.startsWith("PUBLIC_"),
    });

    expect(keys.sort()).toEqual(["PUBLIC_BAR", "VITE_FOO"]);
  });
});

describe("renderViteEnvDts", () => {
  test("emits a reference to vite/client and a typed ImportMetaEnv", () => {
    const out = renderViteEnvDts(["VITE_API_URL", "VITE_FLAG"], "__APP_ENV__");
    expect(out).toContain(`/// <reference types="vite/client" />`);
    expect(out).toMatch(/readonly VITE_API_URL: string;/);
    expect(out).toMatch(/readonly VITE_FLAG: string;/);
    expect(out).toMatch(/interface ImportMeta \{[\s\S]+readonly env: ImportMetaEnv/);
    expect(out).toMatch(/interface Window \{[\s\S]+__APP_ENV__: ImportMetaEnv/);
    expect(out).toMatch(/declare var __APP_ENV__: ImportMetaEnv/);
  });

  test("still emits the global even when no VITE_* keys are known", () => {
    const out = renderViteEnvDts([], "__APP_ENV__");
    expect(out).toContain("declare var __APP_ENV__: ImportMetaEnv");
    expect(out).toContain(`readonly [key: \`\${string}\`]: unknown;`);
  });
});
