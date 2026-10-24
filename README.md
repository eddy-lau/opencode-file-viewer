# opencode-file-viewer

An [OpenCode](https://opencode.ai) **2.x** plugin that views files inline in the terminal — images, PDFs, ebooks, office documents, Markdown, code, and data files. Requires the v2 plugin API; OpenCode 1.x is **not supported**.

Rendering uses [OpenTUI](https://opentui.com)'s image pipeline: Kitty graphics protocol (Kitty, Ghostty, WezTerm), Sixel, or a Unicode-block fallback on terminals without graphics support.

## Formats

| Formats | Pipeline | Notes |
| --- | --- | --- |
| PNG, JPEG, WebP, GIF | direct render | full fidelity |
| PDF | [mupdf](https://mupdfjs.readthedocs.io) (WASM) | pages render lazily, on demand |
| EPUB, CBZ | mupdf (WASM) | paged view |
| DOCX, PPTX, XLSX, DOC, PPT, XLS, ODT, ODS, ODP, RTF, SVG | LibreOffice → PDF → mupdf | requires `soffice` on PATH (`brew install --cask libreoffice`); first conversion takes a few seconds |
| Markdown | native OpenTUI renderer | with syntax-highlighted fences |
| JS/TS/JSX/TSX/Zig + any text file | Tree-sitter or plain text | bundled grammars highlighted |
| CSV, TSV | aligned monospace table | quoted cells handled |
| JSON | pretty-printed | |
| unknown / binary | text or hex dump | |

## Install

Either the CLI:

```sh
opencode plugin add github:eddy-lau/opencode-file-viewer
```

or add it to `~/.config/opencode/opencode.json` (loads the server half and the TUI half automatically):

```jsonc
{
  "plugins": ["github:eddy-lau/opencode-file-viewer"]
}
```

For local development, point the entry at a checkout instead — or use the discovery directory, which needs no config entry:

```jsonc
{ "plugins": ["/Users/you/Projects/Personal/opencode-file-viewer"] }
```

```text
~/.config/opencode/plugins/opencode-file-viewer  # symlink/fs link to the checkout
```

Don't combine the last two: a config entry plus a discovery entry for the same plugin is a duplicate-ID conflict.

## Usage

Open a file yourself:

```
/view report.pdf          # open a file (relative to the workspace, ~ works)
/view                     # pick from viewable files in the workspace
```

or just ask the agent — it has a `view` tool and opens the panel itself:

> view the report

Then use the panel:

| Key | Action |
| --- | --- |
| `←` / `→` | previous / next page (paged formats) |
| `h` / `l` (or `p` / `n`) | same, vim-style |
| `↑` / `↓` | scroll by 3 lines (text formats); page turns on paged formats |
| `pgup` / `pgdn` | scroll a viewport (text) or a page (paged) |
| `j` / `k`, `g`, `shift+g` | scroll, top, bottom |
| `f` | toggle fullscreen |
| `o` | open in the system viewer (Preview etc.) |
| `esc` | close |

## Architecture

Two halves in one package (both loaded as one plugin):

- `src/index.ts` — server side: registers the agent-facing `view` tool; opening a file emits an event over plugin RPC
- `src/rpc.ts` — the `file-viewer` RPC channel (server → TUI bridge)
- `src/tui.tsx` — the TUI panel: subscribes to RPC events, also exposes the `/view` command

Formats are handled by a small registry (`src/handlers/`). Each handler maps a file to one of four content kinds the panel renders:

- `image` — a single image path, rendered via `<image>`
- `pages` — lazy per-page PNGs (PDF/EPUB/office), rendered via `<image>` with paging
- `markdown` — raw markdown, rendered via `<markdown>`
- `code` — source or text, rendered via `<code>` (with optional Tree-sitter filetype)

Handlers are order-sensitive: the `code` handler claims every text extension and must stay last. Adding format support = new handler + registry entry.

Conversions are cached under `os.tmpdir()/opencode-file-viewer/<sha1(path+mtime+size)>/` and pruned after 7 days. Editing a file invalidates its cache automatically.

## Development

The TUI entry ships **precompiled** (`tui.js` at the repo root) — OpenCode's plugin loader transpiles plugin TSX with default React JSX and ignores per-plugin tsconfigs, so raw `.tsx` fails to load at runtime. `build.ts` uses `@opentui/solid`'s Bun plugin for the real JSX transform and fails if the result still contains `jsxDEV`/`jsx-runtime`. After editing `src/tui.tsx`:

```sh
bun run build      # requires bun; regenerates tui.js and must be committed with the source change
bunx tsc --noEmit  # typecheck
bun run smoke      # conversion pipeline smoke test (fixture paths from argv)
```

## Requirements

- OpenCode 2.x with its bundled Bun runtime (open on Linux, macOS, and Windows; office lookup understands Windows Program Files and macOS app bundles)
- Image fidelity depends on the terminal: Kitty-protocol terminals (Kitty, Ghostty, WezTerm) show full-resolution images; others fall back to Sixel or Unicode blocks
- Optional: LibreOffice for office formats and SVG (`brew install --cask libreoffice`, or your package manager)

## Known limitations

- The panel is session-scoped: open a session before `/view`
- The viewer's keymap layer is active while the panel is open; `h/j/k/l` are taken by it
- mupdf's WASM build has no SVG document handler, so SVG goes through LibreOffice
- Animated GIFs render as a single frame; BMP/TIFF/HEIC are not handled (use `o` for those)
- Huge images render at a fixed ~150 DPI target, not terminal pixel density
- Syntax-highlighted fences cover the bundled Tree-sitter grammars (js/ts/jsx/tsx/md/zig); other languages render plain

## Roadmap

- [ ] npm publish

## License

MIT. The `mupdf` runtime dependency is AGPL-3.0 (loaded at runtime, not distributed here) — see [LICENSE](LICENSE).
