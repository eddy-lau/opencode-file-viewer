# AGENTS.md

OpenCode TUI plugin (Bun + TypeScript + Solid via OpenTUI). No bundler/watch config beyond `build.ts`; no test framework, no lint.

## Build is mandatory and non-obvious

- `tui.js` at the repo root is a **committed build artifact** compiled from `src/tui.tsx`. Editing the `.tsx` alone does nothing until `bun run build`.
- Why precompiled: OpenCode's plugin loader transpiles plugin TSX with default React JSX semantics and ignores per-plugin tsconfigs; Solid needs getter-wrapped props, so raw `.tsx` breaks at runtime.
- `build.ts` uses `@opentui/solid`'s Bun plugin for the real JSX transform and **fails the build** if output contains `jsxDEV`/`jsx-runtime` (i.e. Bun's builtin transform leaked through). That's why `tsconfig.build.json` is intentionally minimal/empty — it stands Bun's builtin JSX transform down. Don't "fix" the empty tsconfig or set `jsx` in it.
- After changing `src/tui.tsx`: `bun run build`, and commit `tui.js` together with the source change. For testing via a Git install, `git push` then `opencode plugin update`.
- **Handler/registry changes are NOT "server-half only"**: `tui.tsx` imports `pickHandler`/`registry`, so the TUI binary contains the handler code too — any handler edit needs `bun run build` + committed `tui.js` or the panel keeps the old logic (burned time: image.ts change without rebuild made the panel hexdump BMPs via the stale fallback).

## Local dev loop (how the checkout is actually loaded)

- A discovery symlink `~/.config/opencode/plugins/opencode-file-viewer` → this checkout loads both halves. The global `opencode.json` `plugins` array stays `[]` — pointing both at the same plugin causes a duplicate-ID conflict (plugin shows as "failed").
- TUI hot-reload: OpenCode watches the plugin and reconciles on source/config changes. If it doesn't pick up a rebuild, touch `~/.config/opencode/cli.json` to force re-reconcile, or restart the TUI.
- Verify load state with `opencode api get /api/plugin` (expect `opencode.file-viewer | active | {"server": true, "tui": true}`). The `opencode plugin list` CLI shows only package plugins, **not** local-dir ones.
- `opencode plugin add` against this repo has hit `NpmInstallFailedError: git dep preparation failed` before; the symlink is the reliable path.

## Plugin resolution quirk

- Local *directory* installs resolve literally: `<dir>/index.ts` (server half) + `<dir>/tui.js` (TUI half), **ignoring the package.json exports map**. Git/npm installs use the exports map (`.` → `./src/index.ts`, `./tui` → `./tui.js`). Both root `index.ts` (one-line re-export) and root `tui.js` must stay where they are.

## Verification

- No testrunner/lint. Typecheck: `bunx tsc --noEmit` (tsconfig covers `src/` only; root `index.ts`, `build.ts`, `test/` are not typechecked).
- Smoke test (non-UI, conversion pipeline): `bun run smoke <dir-with-fixtures> [optional-docx]` — `test/smoke.ts` reads fixture paths from argv: `sample.csv/json/md/svg/ts/binary.dat` under argv[2], PNG/PDF come from macOS system files, optional DOCX path is argv[3]. PDF/PNG entries are macOS-specific hardcodes.
- Manual test is the real loop: edit → build → reload OpenCode → `/view <file>`.

## Architecture in one screen

- Two halves, one package: `src/index.ts` — server-side plugin, registers the agent-facing `view` tool and relays open-requests over plugin RPC; `src/tui.tsx` — OpenTUI/Solid panel that subscribes to `requested` events.
- RPC: `src/rpc.ts` declares `FileViewerRpc` as a plain `PortableDefinition` (not `Rpc.define`) because `register()` requires JSON-Schema-shaped, zero-method definitions.
- Format support = handler registry (`src/handlers/`). Each handler maps a file to one of five content kinds: `image`, `pages` (lazy per-page PNGs), `animation` (decoded GIF frames + delays), `markdown`, `code`. Handlers in `registry.ts` are order-sensitive: `codeHandler` claims every extension and must stay **last** (it's the fallback). Adding format support = new handler + registry entry.
- Highlighted languages: OpenTUI bundles six grammars (js/ts/tsx/md/zig + md_inline). More are registered at TUI startup from `src/lib/grammars.ts`; wasm + `highlights.scm` are pinned **as a pair** and committed under `assets/grammars/` — provenance in `assets/grammars/SOURCES.md`. Don't bump one without the other (query/wasm mismatch = dead or crashed highlighting; yaml/toml from `tree-sitter-wasms` 0.1.13 crash web-tree-sitter 0.25 — kept on `tree-sitter-grammars` release builds instead).
- Office/SVG pipeline: LibreOffice (`soffice` on PATH) → PDF → mupdf. mupdf's WASM build has no SVG document handler — that's why SVG goes through LibreOffice.
- Converted/derived files cache under `os.tmpdir()/opencode-file-viewer/<sha1(path+mtime+size)>/`, pruned after 7 days; edits auto-invalidate.

## Dependency note

`mupdf` is a runtime dep but AGPL-3.0 (loaded at runtime, not distributed here) — see LICENSE. Keep it a dependency, not bundled source. `omggif` is a tiny runtime dep (GIF frame decode; mupdf has no frame API). Grammar wasm blobs are committed, not dependencies.
