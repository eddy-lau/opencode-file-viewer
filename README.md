# opencode-file-viewer

An [OpenCode](https://opencode.ai) TUI plugin that views files inline in the terminal — images, PDFs, ebooks, office documents, Markdown, code, and data files.

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

```jsonc
// ~/.config/opencode/cli.json — TUI plugins are client-local
{
  "plugins": ["github:eddy-lau/opencode-file-viewer"]
}
```

For local development, point the entry at a checkout instead:

```jsonc
{ "plugins": ["/Users/you/Projects/Personal/opencode-file-viewer"] }
```

Config reloads on save; `/reload` forces a full refresh.

## Usage

```
/view report.pdf          # open a file (relative to the workspace, ~ works)
/view                     # pick from viewable files in the workspace
```

Then use the panel:

| Key | Action |
| --- | --- |
| `h` / `l` (or `p` / `n`) | previous / next page (paged formats) |
| `j` / `k` | scroll down / up (text formats), `g` top, `shift+g` bottom |
| `f` | toggle fullscreen |
| `o` | open in the system viewer (Preview etc.) |
| `esc` | close |

## Architecture

Formats are handled by a small registry (`src/handlers/`). Each handler maps a file to one of four content kinds the panel renders:

- `image` — a single image path, rendered via `<image>`
- `pages` — lazy per-page PNGs (PDF/EPUB/office), rendered via `<image>` with paging
- `markdown` — raw markdown, rendered via `<markdown>`
- `code` — source or text, rendered via `<code>` (with optional Tree-sitter filetype)

Conversions are cached under `os.tmpdir()/opencode-file-viewer/<sha1(path+mtime+size)>/` and pruned after 7 days. Editing a file invalidates its cache automatically.

## Development

The TUI entry ships **precompiled** (`dist/tui.js`) — OpenCode's plugin loader transpiles plugin TSX with default React JSX and ignores per-plugin tsconfigs, so raw `.tsx` fails to load. After editing `src/tui.tsx`:

```sh
bun run build && git add -A && git commit -m "..." && git push
opencode plugin update   # re-resolves the pinned Git install
```

## Requirements

- OpenCode V2 with its bundled Bun runtime
- Image fidelity depends on the terminal: Kitty-protocol terminals (Kitty, Ghostty, WezTerm) show full-resolution images; others fall back to Sixel or Unicode blocks
- Optional: LibreOffice for office formats and SVG

## Known limitations

- The panel is session-scoped: open a session before `/view`
- The viewer's keymap layer is active while the panel is open; `h/l/j/k` are taken by it
- mupdf's WASM build has no SVG document handler, so SVG goes through LibreOffice
- Huge images render at a fixed ~150 DPI target, not terminal pixel density

## Roadmap

- [ ] `view` tool so the agent can open the panel itself
- [ ] npm publish
- [ ] content-aware image DPI matching terminal pixel geometry

## License

MIT. The `mupdf` runtime dependency is AGPL-3.0 (loaded at runtime, not distributed here) — see [LICENSE](LICENSE).
