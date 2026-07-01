# vite-plugin-appsettings

[![npm](https://img.shields.io/npm/v/vite-plugin-appsettings?style=flat-square)](https://www.npmjs.com/package/vite-plugin-appsettings)
[![License](https://img.shields.io/github/license/cristiancastineiras/vite-plugin-appsettings?style=flat-square)](LICENSE.md)
[![CI](https://img.shields.io/github/actions/workflow/status/cristiancastineiras/vite-plugin-appsettings/ci.yaml?branch=main&style=flat-square)](https://github.com/cristiancastineiras/vite-plugin-appsettings/actions/workflows/ci.yaml)
[![Release](https://img.shields.io/github/actions/workflow/status/cristiancastineiras/vite-plugin-appsettings/release.yaml?style=flat-square)](https://github.com/cristiancastineiras/vite-plugin-appsettings/actions/workflows/release.yaml)

**Runtime environment for Vite.** Ship a single build, tweak the config
without recompiling — same idea as `appsettings.json` in .NET, powered by
Vite's own `.env` convention.

- Zero-embed: `import.meta.env.VITE_*` is **not** inlined in the JS bundle.
- Values live in `dist/appsettings.json`, next to `index.html`. Edit that
  file on the server (Docker volume, K8s ConfigMap, S3, …) and reload.
- Defaults are seeded from your `.env`, `.env.production`, etc.
- Fallback `envsubst`-style placeholder mode for immutable-filesystem
  deployments.
- Built with `tsdown` (Rolldown + oxc). Tiny, tree-shaken, minified.

## Install

```bash
pnpm add -D vite-plugin-appsettings
# or
npm i -D vite-plugin-appsettings
```

## Quick start

```ts
// vite.config.ts
import { defineConfig } from "vite";
import appsettings from "vite-plugin-appsettings";

export default defineConfig({
  plugins: [appsettings()],
});
```

Author your defaults with the usual Vite convention:

```
.env                     # committed defaults for every mode
.env.production          # production defaults
.env.production.local    # not committed
```

Then build once:

```bash
pnpm build
```

`dist/` will contain:

```
dist/
├── index.html            # <-- module scripts replaced by the runtime loader
├── appsettings.json      # <-- your defaults, ready to be overridden
└── assets/*.js           # <-- reads globalThis.__APP_ENV__.VITE_*
```

Deploy `dist/` as-is. In each environment, mount / rewrite
`appsettings.json` to change the config **without rebuilding**:

```json
{
  "VITE_API_URL": "https://api.staging.example.com",
  "VITE_FEATURE_FLAG": "true"
}
```

That's it. Reload the page → new values.

## How it works

1. During `vite build`, occurrences of `import.meta.env.VITE_FOO` are
   rewritten to `globalThis.__APP_ENV__.VITE_FOO`.
2. The plugin removes Vite's `<script type="module" src="...">` entry tags
   from `index.html` and injects a tiny loader that:
   - fetches `appsettings.json` (with `cache: "no-store"` by default),
   - assigns the result to `globalThis.__APP_ENV__`,
   - dynamically appends the original module scripts.
3. `appsettings.json` is emitted with defaults resolved from your `.env`
   files.

Dev mode is untouched — Vite's own `.env` HMR handles it.

## Options

```ts
appsettings({
  globalName: "__APP_ENV__",     // property on globalThis
  filename: "appsettings.json",  // emitted asset name
  strategy: "json",              // "json" | "placeholders"
  substitutionSyntax: "dollar-curly", // for "placeholders" mode
  ignoreEnv: ["VITE_BUILD_ID"],  // vars to keep statically inlined
  emitDefaults: true,            // seed appsettings.json from .env files
  noCache: true,                 // fetch with cache: "no-store"
  autoTypes: true,               // drop a vite-env.d.ts at the project root
  typesFile: "vite-env.d.ts",    // typings filename
});
```

### `globalName`
Property on `globalThis` that receives the runtime env. Must be a plain
identifier (no dots). Access it as `globalThis.__APP_ENV__` (or
`window.__APP_ENV__` in the browser).

### `filename`
The name of the JSON asset emitted next to `index.html`. Change it if
`appsettings.json` collides with something else in your deployment.

### `strategy: "json"` (default)
The recommended mode. Values live in an external file that can be swapped
independently from the bundle.

### `strategy: "placeholders"`
Use this when you cannot write files at deploy time (some serverless
platforms, immutable images without ConfigMaps). The plugin inlines a
mapping in `index.html`:

```html
<script>
  globalThis.__APP_ENV__ = JSON.parse('{"VITE_API_URL":"${VITE_API_URL}"}');
</script>
```

Then substitute at container start:

```sh
envsubst < dist/index.html.template > dist/index.html
# or
npx envsub dist/index.html
```

Supported syntaxes via `substitutionSyntax`:

| value            | placeholder     |
| ---------------- | --------------- |
| `dollar-curly`   | `${VITE_FOO}`   |
| `dollar-basic`   | `$VITE_FOO`     |
| `handlebars`     | `{{VITE_FOO}}`  |

### `ignoreEnv`
Names to skip. Ignored variables stay statically inlined by Vite —
useful for build-time-only info like a version stamp.

```ts
appsettings({ ignoreEnv: ["VITE_BUILD_ID"] });
appsettings({ ignoreEnv: (n) => n.endsWith("_BUILD_ID") });
```

### `emitDefaults`
Set to `false` to emit an empty `{}` scaffold instead of seeding it from
your `.env` chain.

### `noCache`
Set to `false` if you'd rather serve `appsettings.json` with normal HTTP
caching. Default is `true` so operators can hot-swap the file.

### `autoTypes` / `typesFile`
On every build, the plugin drops a `vite-env.d.ts` at the project root
that references `vite/client` and augments `ImportMetaEnv` with the union
of VITE_* keys known to the plugin (consumed by your code + present in
your `.env` chain). It also types the runtime global so
`globalThis.__APP_ENV__` is fully usable from TypeScript.

The plugin never overwrites a `vite-env.d.ts` you already committed. If
you want custom typings, add them in a separate `.d.ts` file. To disable
this behavior entirely, pass `autoTypes: false`. `typesFile` lets you
rename the output (e.g. to merge with an existing `env.d.ts`).

## Why not just use `vite build` at deploy time?

Because you want **build once, run anywhere**. Rebuilding on every
deploy:

- slows down rollouts (especially when scaling horizontally),
- violates the 12-factor "Build, release, run" separation,
- gives you a different binary per environment.

`appsettings.json` — like in .NET — keeps the artifact identical and
moves configuration into the environment where it belongs.

## TypeScript support

`import.meta.env.VITE_*` is still typed by Vite's own
`vite/client` types, plus by the `vite-env.d.ts` the plugin **generates
automatically on every build** (see [`autoTypes`](#autotypes--typesfile)
above). You don't have to write it by hand — delete the file and the
plugin will recreate it.

## Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Every commit message is validated by commitlint via the Husky
`commit-msg` hook.

```bash
git commit -m "feat: add support for handlebars substitution"
git commit -m "fix: avoid inlining VITE_BUILD_INFO"
```

Releases are fully automated via [release-it](https://github.com/release-it/release-it)
and [auto-changelog](https://github.com/cookpete/auto-changelog). Push a
commit to `main` (or trigger the **Release** workflow manually) and a
new GitHub release, git tag, CHANGELOG entry and npm publish are
created in one go.

## License

MIT
