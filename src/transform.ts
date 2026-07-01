import MagicString from "magic-string";

/**
 * Fast pattern matching `import.meta.env.<IDENT>`.
 *
 * We only invoke `MagicString` when the raw text `"import.meta.env"` is
 * present in the file — that early skip keeps big node_modules-style
 * bundles essentially free.
 */
const RE = /import\.meta\.env\.([A-Za-z_$][A-Za-z0-9_$]*)/g;

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]> | null;
  used: string[];
}

export interface TransformOptions {
  targetExpr: string;
  shouldReplace: (name: string) => boolean;
  sourcemap: boolean;
}

/**
 * Rewrite `import.meta.env.FOO` → `<targetExpr>.FOO` for each name that
 * `shouldReplace` accepts. Returns `null` when no rewrite happened so the
 * caller can bail out of the Vite transform hook cheaply.
 */
export function transformCode(
  code: string,
  opts: TransformOptions,
): TransformResult | null {
  if (code.indexOf("import.meta.env") === -1) return null;

  const used: string[] = [];
  let s: MagicString | null = null;

  RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RE.exec(code)) !== null) {
    const name = match[1]!;
    if (!opts.shouldReplace(name)) continue;
    if (s === null) s = new MagicString(code);
    s.overwrite(match.index, match.index + match[0].length, `${opts.targetExpr}.${name}`);
    used.push(name);
  }

  if (s === null) return null;

  return {
    code: s.toString(),
    map: opts.sourcemap ? s.generateMap({ hires: true }) : null,
    used,
  };
}
