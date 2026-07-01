import { defineConfig } from "tsdown";

// tsdown = rolldown + oxc. Ship both ESM (index.js) and CJS (index.cjs),
// with hand-written types, tree-shaken and minified for the smallest
// possible install size.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node18",
  platform: "node",
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: false,
  outExtensions: (ctx) => ({
    js: ctx.format === "es" ? ".js" : ".cjs",
    dts: ctx.format === "es" ? ".d.ts" : ".d.cts",
  }),
  outputOptions: {
    exports: "named",
  },
  unbundle: false,
  deps: {
    neverBundle: ["vite"],
  },
});
