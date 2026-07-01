import type { AppSettingsOptions, ResolvedOptions } from "./types.js";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function normalizeOptions(input: AppSettingsOptions = {}): ResolvedOptions {
  const globalName = input.globalName ?? "__APP_ENV__";
  if (!IDENT.test(globalName)) {
    throw new Error(
      `[vite-plugin-appsettings] "globalName" must be a valid JS identifier, got: ${JSON.stringify(globalName)}`,
    );
  }

  const ignoreEnv = input.ignoreEnv;
  const ignoreFn: ResolvedOptions["ignoreEnv"] = !ignoreEnv
    ? null
    : typeof ignoreEnv === "function"
      ? ignoreEnv
      : ((set) => (name: string) => set.has(name))(new Set(ignoreEnv));

  return {
    globalName,
    filename: input.filename ?? "appsettings.json",
    strategy: input.strategy ?? "json",
    substitutionSyntax: input.substitutionSyntax ?? "dollar-curly",
    ignoreEnv: ignoreFn,
    emitDefaults: input.emitDefaults ?? true,
    noCache: input.noCache ?? true,
    autoTypes: input.autoTypes ?? true,
    typesFile: input.typesFile ?? "vite-env.d.ts",
    defaults: input.defaults ? { ...input.defaults } : null,
    extraFiles: input.extraFiles ? [...input.extraFiles] : null,
    baseDir: input.baseDir ?? null,
    serveInDev: input.serveInDev ?? true,
  };
}

/** Vite internal envs that must NOT be rewritten (they are not real config). */
export const VITE_INTERNAL_ENVS: ReadonlySet<string> = new Set([
  "MODE",
  "BASE_URL",
  "PROD",
  "DEV",
  "SSR",
  "LEGACY",
]);

export function wrapPlaceholder(
  name: string,
  syntax: ResolvedOptions["substitutionSyntax"],
): string {
  switch (syntax) {
    case "dollar-basic":
      return `$${name}`;
    case "handlebars":
      return `{{${name}}}`;
    case "dollar-curly":
    default:
      return `\${${name}}`;
  }
}
