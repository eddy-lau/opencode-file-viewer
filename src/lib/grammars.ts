import path from "node:path"
import { addDefaultParsers } from "@opentui/core"

/**
 * Grammars registered at runtime on top of OpenTUI's bundled six
 * (js/ts/tsx/md/md_inline/zig). The wasm files come from the
 * `tree-sitter-wasms` package (version-pinned to grammar revisions matching
 * the vendored queries); the highlights queries are vendored per grammar
 * under assets/grammars/<filetype>/highlights.scm.
 */
interface GrammarSpec {
  readonly filetype: string
  /** File name in tree-sitter-wasms/out, without the tree-sitter- prefix. */
  readonly wasm: string
  readonly aliases: readonly string[]
}

const GRAMMARS: readonly GrammarSpec[] = [
  { filetype: "python", wasm: "python", aliases: ["py"] },
  { filetype: "rust", wasm: "rust", aliases: ["rs"] },
  { filetype: "c", wasm: "c", aliases: [] },
  { filetype: "cpp", wasm: "cpp", aliases: [] },
  { filetype: "go", wasm: "go", aliases: [] },
  { filetype: "java", wasm: "java", aliases: [] },
  { filetype: "kotlin", wasm: "kotlin", aliases: ["kt"] },
  { filetype: "swift", wasm: "swift", aliases: [] },
  { filetype: "objc", wasm: "objc", aliases: [] },
  { filetype: "json", wasm: "json", aliases: [] },
  { filetype: "yaml", wasm: "yaml", aliases: ["yml"] },
  { filetype: "toml", wasm: "toml", aliases: [] },
]

/**
 * Must be called in the TUI process before the first `<code>` render — the
 * tree-sitter worker snapshots these defaults at client init. Safe to call
 * repeatedly (later calls replace same-filetype entries).
 *
 * Both the parser wasm and the queries are committed under assets/grammars/
 * (see assets/grammars/SOURCES.md for the pinned versions) so no extra
 * dependency is needed at install time.
 */
export function registerGrammars(pluginDirectory: string): void {
  const grammars = path.join(pluginDirectory, "assets", "grammars")
  addDefaultParsers(
    GRAMMARS.map((grammar) => ({
      filetype: grammar.filetype,
      aliases: [...grammar.aliases],
      wasm: path.join(grammars, grammar.filetype, `tree-sitter-${grammar.wasm}.wasm`),
      queries: { highlights: [path.join(grammars, grammar.filetype, "highlights.scm")] },
    })),
  )
}
