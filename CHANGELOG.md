# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## [2.0.0](https://github.com/cristiancastineiras/vite-plugin-appsettings/releases/tag/v2.0.0) - 2026-07-01

### Features

- Initial public release of `vite-plugin-appsettings`.
- Emit `appsettings.json` next to `index.html` for runtime configuration.
- Two strategies: `"json"` (default) and `"placeholders"` (`envsubst`-style).
- Automatic `vite-env.d.ts` generation with augmented `ImportMetaEnv` typings.
- Support for extra files (`.json`, `.env`, `.js`, `.ts`) merged on top of the Vite `.env` chain.
- Tree-shaken, minified ESM + CJS bundle built with `tsdown` (Rolldown + oxc).
