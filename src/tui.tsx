import { readdir, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import type { PanelInput } from "@opencode/plugin/tui/context"
import { SyntaxStyle, type ScrollBoxRenderable } from "@opentui/core"
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { knownExtensions, pickHandler } from "./handlers/registry"
import { FileViewerRpc } from "./rpc"
import type { ViewContent } from "./handlers/types"

const PANEL_NAME = "fileviewer.view"
const COMMAND_PREFIX = "fileviewer."

function expandPath(raw: string, base: string | undefined): string {
  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw
  return path.resolve(base ?? process.cwd(), expanded)
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/** Validates and opens a file in the viewer panel; toasts on failure. */
async function requestOpen(context: ReturnType<typeof usePlugin>, file: string): Promise<void> {
  if (!(await isFile(file))) {
    context.ui.toast.show({ title: "File viewer", message: `${file}: not found`, variant: "error" })
    return
  }
  setCurrentFile(file)
  const opened = context.ui.panel.open(PANEL_NAME)
  if (!opened) {
    context.ui.toast.show({
      title: "File viewer",
      message: "Open a session first — the viewer panel is session-scoped",
      variant: "warning",
    })
  }
}

/** File picker over the current location, limited to formats with a dedicated handler. */
async function pickFile(
  directory: string | undefined,
  context: ReturnType<typeof usePlugin>,
): Promise<string | undefined> {
  const dir = directory ?? process.cwd()
  const entries = await readdir(dir, { withFileTypes: true })
  const options = entries
    .filter((entry) => {
      if (!entry.isFile()) return false
      const ext = entry.name.split(".").pop()?.toLowerCase()
      return ext !== undefined && knownExtensions.includes(ext)
    })
    .slice(0, 500)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ title: entry.name, value: path.join(dir, entry.name) }))
  if (options.length === 0) {
    context.ui.toast.show({ title: "File viewer", message: `No viewable files in ${dir}`, variant: "warning" })
    return undefined
  }
  return context.ui.dialog.select({ title: "View file", options })
}

export default Plugin.define({
  id: "opencode.file-viewer.tui",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: `${COMMAND_PREFIX}view`,
          title: "View file",
          group: "File viewer",
          description: "Open a file in the inline viewer (PNG, PDF, EPUB, PPTX, DOCX, Markdown, CSV, …)",
          palette: true,
          slash: { name: "view", arguments: true },
          suggested: true,
          run: async (input) => {
            const raw = input?.trim()
            const file = raw
              ? expandPath(raw, context.location?.directory)
              : await pickFile(context.location?.directory, context)
            if (!file) return
            await requestOpen(context, file)
          },
        },
      ],
    }))

    context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === PANEL_NAME}>
          <Viewer panel={panel} />
        </Show>
      ),
    })

    // Agent-side `view` tool → server RPC event → open the panel here.
    const fileViewer = context.client.rpc(FileViewerRpc)
    const unsubscribeRpc = fileViewer.events.on("requested", async (event) => {
      const here = context.location?.directory
      if (here && event.location?.directory && event.location.directory !== here) return
      const file = (event.data as { path: string }).path
      if (await isFile(file)) await requestOpen(context, file)
    })

    return () => unsubscribeRpc()
  },
})

/** Cross-setup handoff: the /view command sets it, the panel component reads it. */
const [currentFile, setCurrentFile] = createSignal<string>()

function Viewer(props: { panel: PanelInput }) {
  const context = usePlugin()
  const [status, setStatus] = createSignal<"loading" | "ready" | "error">("loading")
  const [content, setContent] = createSignal<ViewContent>()
  const [error, setError] = createSignal("")
  const [handlerId, setHandlerId] = createSignal("")
  const [page, setPage] = createSignal(0)
  const [pageCount, setPageCount] = createSignal(0)
  const [pageImage, setPageImage] = createSignal<string>()
  const [pageBusy, setPageBusy] = createSignal(false)
  const [fileLabel, setFileLabel] = createSignal("")
  let scrollbox: ScrollBoxRenderable | undefined
  let style: SyntaxStyle | undefined

  onMount(() => {
    // SyntaxStyle is a native resource owned by the host scene.
    style = SyntaxStyle.fromStyles(
      {
        default: { fg: "#d4d4d4" },
        // code tokens
        keyword: { fg: "#ff7b72", bold: true },
        string: { fg: "#a5d6ff" },
        comment: { fg: "#8b949e", italic: true },
        number: { fg: "#79c0ff" },
        boolean: { fg: "#79c0ff" },
        constant: { fg: "#79c0ff" },
        function: { fg: "#d2a8ff" },
        "function.call": { fg: "#d2a8ff" },
        type: { fg: "#ffa657" },
        constructor: { fg: "#ffa657" },
        variable: { fg: "#d4d4d4" },
        "variable.member": { fg: "#79c0ff" },
        property: { fg: "#79c0ff" },
        operator: { fg: "#ff7b72" },
        punctuation: { fg: "#f0f6fc" },
        "punctuation.bracket": { fg: "#f0f6fc" },
        "punctuation.delimiter": { fg: "#c9d1d9" },
        // markdown tokens
        "markup.heading": { fg: "#58a6ff", bold: true },
        "markup.heading.1": { fg: "#58a6ff", bold: true, underline: true },
        "markup.heading.2": { fg: "#79c0ff", bold: true },
        "markup.heading.3": { fg: "#79c0ff", bold: true },
        bold: { fg: "#f0f6fc", bold: true },
        "markup.bold": { fg: "#f0f6fc", bold: true },
        "markup.strong": { fg: "#f0f6fc", bold: true },
        "markup.italic": { fg: "#f0f6fc", italic: true },
        "markup.list": { fg: "#ff7b72" },
        "markup.quote": { fg: "#8b949e", italic: true },
        "markup.raw": { fg: "#a5d6ff" },
        "markup.raw.block": { fg: "#a5d6ff" },
        "markup.link": { fg: "#58a6ff", underline: true },
        "markup.link.url": { fg: "#58a6ff", underline: true },
      },
      context.renderer.nativeScene,
    )
    onCleanup(() => {
      void context.renderer.idle().then(() => style?.destroy())
    })

    context.keymap.layer(() => ({
      mode: "global",
      priority: 20,
      commands: [
        { id: `${COMMAND_PREFIX}page.next`, title: "Next page", bind: "l", run: () => setPage((p) => p + 1) },
        { id: `${COMMAND_PREFIX}page.next.alt`, title: "Next page", bind: "n", run: () => setPage((p) => p + 1) },
        {
          id: `${COMMAND_PREFIX}page.prev`,
          title: "Previous page",
          bind: "h",
          run: () => setPage((p) => Math.max(0, p - 1)),
        },
        {
          id: `${COMMAND_PREFIX}page.prev.alt`,
          title: "Previous page",
          bind: "p",
          run: () => setPage((p) => Math.max(0, p - 1)),
        },
        { id: `${COMMAND_PREFIX}page.next.arrow`, title: "Next page", bind: "right", run: () => setPage((p) => p + 1) },
        {
          id: `${COMMAND_PREFIX}page.prev.arrow`,
          title: "Previous page",
          bind: "left",
          run: () => setPage((p) => Math.max(0, p - 1)),
        },
        {
          id: `${COMMAND_PREFIX}page.pgdn`,
          title: "Page down",
          bind: "pagedown",
          run: () => {
            if (content()?.kind === "pages") setPage((p) => p + 1)
            else scrollbox?.scrollBy(1, "viewport")
          },
        },
        {
          id: `${COMMAND_PREFIX}page.pgup`,
          title: "Page up",
          bind: "pageup",
          run: () => {
            if (content()?.kind === "pages") setPage((p) => Math.max(0, p - 1))
            else scrollbox?.scrollBy(-1, "viewport")
          },
        },
        { id: `${COMMAND_PREFIX}scroll.down`, bind: "j", run: () => scrollbox?.scrollBy(3) },
        { id: `${COMMAND_PREFIX}scroll.up`, bind: "k", run: () => scrollbox?.scrollBy(-3) },
        {
          id: `${COMMAND_PREFIX}scroll.down.arrow`,
          title: "Scroll down",
          bind: "down",
          run: () => {
            if (content()?.kind === "pages") setPage((p) => p + 1)
            else scrollbox?.scrollBy(3)
          },
        },
        {
          id: `${COMMAND_PREFIX}scroll.up.arrow`,
          title: "Scroll up",
          bind: "up",
          run: () => {
            if (content()?.kind === "pages") setPage((p) => Math.max(0, p - 1))
            else scrollbox?.scrollBy(-3)
          },
        },
        { id: `${COMMAND_PREFIX}scroll.top`, bind: "g", run: () => scrollbox?.scrollTo(0) },
        {
          id: `${COMMAND_PREFIX}scroll.bottom`,
          bind: "shift+g",
          run: () => scrollbox?.scrollBy(Number.MAX_SAFE_INTEGER),
        },
        { id: `${COMMAND_PREFIX}fullscreen`, title: "Toggle fullscreen", bind: "f", run: () => props.panel.toggleFullscreen() },
        {
          id: `${COMMAND_PREFIX}open`,
          title: "Open externally",
          bind: "o",
          run: () => {
            const file = currentFile()
            if (!file) return
            const command =
              process.platform === "darwin"
                ? ["open", file]
                : process.platform === "win32"
                  ? ["cmd", "/c", "start", "", file]
                  : ["xdg-open", file]
            Bun.spawn(command, { stdout: "ignore", stderr: "ignore" })
          },
        },
        { id: `${COMMAND_PREFIX}close`, title: "Close viewer", bind: "escape", run: () => props.panel.close() },
      ],
    }))

    void loadFile()
  })

  async function loadFile(): Promise<void> {
    const file = currentFile()
    if (!file) {
      setStatus("error")
      setError("no file selected — use /view <path>")
      return
    }
    setFileLabel(path.basename(file))
    setStatus("loading")
    setError("")
    setPage(0)
    setPageImage(undefined)
    try {
      const handler = pickHandler(file)
      setHandlerId(handler.id)
      const loaded = await handler.load(file)
      setContent(loaded)
      if (loaded.kind === "pages") setPageCount(loaded.count)
      setStatus("ready")
    } catch (cause) {
      setStatus("error")
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  // Render pages lazily: pagePath may convert a whole page on first visit.
  createEffect(() => {
    const loaded = content()
    if (loaded?.kind !== "pages") return
    const index = Math.min(Math.max(page(), 0), loaded.count - 1)
    setPageBusy(true)
    loaded
      .pagePath(index)
      .then((image) => {
        // ignore stale renders after rapid paging
        if (page() === index) {
          setPageImage(image)
          setPageBusy(false)
        }
      })
      .catch((cause) => {
        setStatus("error")
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  })

  const pageInfo = () => {
    const loaded = content()
    if (loaded?.kind !== "pages") return undefined
    return `${Math.min(page(), loaded.count - 1) + 1}/${loaded.count}`
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexGrow={1} flexDirection="column">
        <Switch>
          <Match when={status() === "loading"}>
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg="#8b949e">{handlerId() === "office" ? "converting with LibreOffice…" : "loading…"}</text>
            </box>
          </Match>
          <Match when={status() === "error"}>
            <box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column" gap={1}>
              <text fg="#ff7b72">{fileLabel()}</text>
              <text fg="#8b949e">{error()}</text>
            </box>
          </Match>
          <Match when={content()?.kind === "image"}>
            <image
              source={(content() as { kind: "image"; path: string }).path}
              fit="fit"
              protocol="auto"
              style={{ width: "100%", height: "100%" }}
            />
          </Match>
          <Match when={content()?.kind === "pages"}>
            <Show
              when={pageImage()}
              fallback={
                <box justifyContent="center" alignItems="center" flexGrow={1}>
                  <text fg="#8b949e">{pageBusy() ? "rendering page…" : ""}</text>
                </box>
              }
            >
              <image
                source={pageImage()}
                fit="fit"
                protocol="auto"
                style={{ width: "100%", height: "100%" }}
              />
            </Show>
          </Match>
          <Match when={content()?.kind === "markdown"}>
            <scrollbox ref={scrollbox} width="100%" height="100%">
              <markdown
                content={(content() as { kind: "markdown"; content: string }).content}
                syntaxStyle={style!}
                conceal
              />
            </scrollbox>
          </Match>
          <Match when={content()?.kind === "code"}>
            <scrollbox ref={scrollbox} width="100%" height="100%">
              <code
                content={(content() as { kind: "code"; content: string }).content}
                filetype={(content() as { kind: "code"; filetype?: string }).filetype}
                syntaxStyle={style!}
              />
            </scrollbox>
          </Match>
        </Switch>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg="#8b949e">{fileLabel()}</text>
        <Show when={handlerId()}>
          <text fg="#58a6ff">{handlerId()}</text>
        </Show>
        <Show when={pageInfo()}>
          <text fg="#f0f6fc">{pageInfo()}</text>
        </Show>
        <text fg="#484f58">←→ page · ↑↓/j-k scroll · pgup/dn · f full · o open · esc close</text>
      </box>
    </box>
  )
}
