# assets/grammars/<filetype>/

Pinned Tree-sitter grammars for the runtime-registered filetypes (js/ts/tsx/md/zig
ship bundled with OpenTUI's core instead).

Each directory holds `tree-sitter-<language>.wasm` (a parser) and
`highlights.scm` (capturing query). The wasm and the query must stay in sync —
they were taken from the versions below.

| filetype | parser | query |
| --- | --- | --- |
| python | tree-sitter-python v0.21.0 (tree-sitter-wasms 0.1.13) | tree-sitter-python v0.21.0 `queries/highlights.scm` |
| rust | tree-sitter-rust v0.20.4 (tree-sitter-wasms 0.1.13) | tree-sitter-rust v0.20.4 `queries/highlights.scm` |
| c | tree-sitter-c v0.20.7 (tree-sitter-wasms 0.1.13) | tree-sitter-c v0.20.7 `queries/highlights.scm` |
| cpp | tree-sitter-cpp v0.20.4 (tree-sitter-wasms 0.1.13) | tree-sitter-cpp v0.20.4 `queries/highlights.scm` |
| go | tree-sitter-go v0.20.0 (tree-sitter-wasms 0.1.13) | tree-sitter-go v0.20.0 `queries/highlights.scm` |
| java | tree-sitter-java v0.20.2 (tree-sitter-wasms 0.1.13) | tree-sitter-java v0.20.2 `queries/highlights.scm` |
| kotlin | tree-sitter-kotlin 0.3.1/fwcd (tree-sitter-wasms 0.1.13) | fwcd/tree-sitter-kotlin 0.3.1 `queries/highlights.scm` |
| swift | alex-pinkus/tree-sitter-swift 0.4.0 (tree-sitter-wasms 0.1.13) | alex-pinkus/tree-sitter-swift 0.4.0 `queries/highlights.scm` |
| objc | tree-sitter-objc 2.1.0 (tree-sitter-grammars, master at vendoring) | tree-sitter-grammars/tree-sitter-objc master `queries/highlights.scm` |
| json | tree-sitter-json v0.20.2 (tree-sitter-wasms 0.1.13) | tree-sitter-json v0.20.2 `queries/highlights.scm` |
| yaml | tree-sitter-grammars/tree-sitter-yaml v0.7.2 release wasm | tree-sitter-grammars/tree-sitter-yaml v0.7.2 `queries/highlights.scm` |
| toml | tree-sitter-grammars/tree-sitter-toml v0.7.0 release wasm | tree-sitter-grammars/tree-sitter-toml v0.7.0 `queries/highlights.scm` |

Wasm prebuilds: https://github.com/Gregoor/tree-sitter-wasms (build-time source —
binaries are committed here so the plugin installs with no extra native/wasm deps).
Yaml/toml don't come from there: their 0.19/0.20-era tree-sitter-wasms builds fail
to instantiate in the web-tree-sitter 0.25 worker, so the maintained
`tree-sitter-grammars` release wasm (ABI ≤ 15) is vendored instead.
