import { resolve } from "node:path";
import type { InlineConfig } from "vite";
import { build as viteBuild } from "vite";

export const FIXTURE_ROOT = resolve(__dirname, "fixture");

export type BuildConfig = Omit<InlineConfig, "root" | "build">;

/** Ad-hoc narrowing so we don't need to depend on `rollup` types directly. */
export interface OutputAsset {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
}
export interface OutputChunk {
  type: "chunk";
  fileName: string;
  code: string;
}
export type OutputItem = OutputAsset | OutputChunk;
export interface RollupOutputLike {
  output: OutputItem[];
}

export async function build(config: BuildConfig = {}): Promise<RollupOutputLike> {
  const result = await viteBuild({
    ...config,
    root: FIXTURE_ROOT,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  });

  if (Array.isArray(result) || !("output" in (result as object))) {
    throw new Error("Expected a single build output");
  }
  return result as unknown as RollupOutputLike;
}

export function findAsset(result: RollupOutputLike, fileName: string): OutputAsset {
  const asset = result.output.find(
    (o): o is OutputAsset => o.type === "asset" && o.fileName === fileName,
  );
  if (!asset) {
    throw new Error(
      `Asset ${fileName} not found. Output: ${result.output.map((o) => o.fileName).join(", ")}`,
    );
  }
  return asset;
}

export function findChunk(
  result: RollupOutputLike,
  predicate: (name: string) => boolean,
): OutputChunk {
  const chunk = result.output.find(
    (o): o is OutputChunk => o.type === "chunk" && predicate(o.fileName),
  );
  if (!chunk) {
    throw new Error(
      `Chunk not found. Output: ${result.output.map((o) => o.fileName).join(", ")}`,
    );
  }
  return chunk;
}

export function assetSource(asset: OutputAsset): string {
  return typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString();
}
