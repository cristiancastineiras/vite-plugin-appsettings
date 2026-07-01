import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createServer } from "vite";

import { appsettings } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "appsettings-dev-"));
  writeFileSync(join(root, "package.json"), '{"name":"dev-test"}');
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><head></head><body></body>",
  );
  writeFileSync(
    join(root, "main.ts"),
    `console.log(import.meta.env.VITE_API_URL, import.meta.env.VITE_FLAG);`,
  );
  writeFileSync(
    join(root, ".env"),
    "VITE_API_URL=https://example.com\nVITE_FLAG=true\n",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("configureServer middleware", () => {
  test("serves the resolved appsettings.json in dev mode", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [appsettings()],
    });

    try {
      // Manually drive the connect middleware stack: this is the
      // same path Vite uses when an HTTP request hits the dev server.
      const url = "/appsettings.json";
      const handler = (server.middlewares as unknown as {
        stack: { route: string; handle: (req: unknown, res: unknown, next: (err?: unknown) => void) => void }[];
      }).stack.find((m) => m.route === url)?.handle;

      expect(handler, "expected /appsettings.json middleware to be registered").toBeDefined();

      const body = await new Promise<string>((resolve, reject) => {
        const req = { url } as unknown;
        let captured = "";
        const resHeaders: Record<string, string> = {};
        const res = {
          statusCode: 0,
          setHeader(k: string, v: string) {
            resHeaders[k] = v;
          },
          end(chunk: string) {
            captured += chunk;
            resolve(captured);
          },
        } as unknown as { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void };
        handler!(req, res, (err) => (err ? reject(err as Error) : reject(new Error("next() called"))));
      });

      const parsed = JSON.parse(body);
      expect(parsed.VITE_API_URL).toBe("https://example.com");
      expect(parsed.VITE_FLAG).toBe("true");
    } finally {
      await server.close();
    }
  });

  test("is opt-out via serveInDev: false", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [appsettings({ serveInDev: false })],
    });

    try {
      const handler = (server.middlewares as unknown as {
        stack: { route: string }[];
      }).stack.find((m) => m.route === "/appsettings.json");
      expect(handler).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  test("is skipped under the placeholders strategy", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [appsettings({ strategy: "placeholders" })],
    });

    try {
      const handler = (server.middlewares as unknown as {
        stack: { route: string }[];
      }).stack.find((m) => m.route === "/appsettings.json");
      expect(handler).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  test("respects a custom filename", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [appsettings({ filename: "config.json" })],
    });

    try {
      const handler = (server.middlewares as unknown as {
        stack: { route: string }[];
      }).stack.find((m) => m.route === "/config.json");
      expect(handler, "expected /config.json middleware to be registered").toBeDefined();
    } finally {
      await server.close();
    }

    expect(existsSync(root)).toBe(true);
  });
});
