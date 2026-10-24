// @bun
// src/tui.tsx
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { readdir as readdir2, stat as stat5 } from "fs/promises";
import os2 from "os";
import path3 from "path";
import { fileURLToPath } from "url";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { SyntaxStyle } from "@opentui/core";
import { Match, Show, Switch, createEffect, createSignal, onCleanup, onMount } from "solid-js";

// src/handlers/code.ts
import { readFile, stat } from "fs/promises";

// src/lib/binary.ts
var CHUNK = 4096;
function looksBinary(buf) {
  const view = buf.subarray(0, CHUNK);
  let suspicious = 0;
  for (const byte of view) {
    if (byte === 0)
      return true;
    if (byte < 7 || byte > 13 && byte < 32)
      suspicious++;
  }
  return suspicious / view.length > 0.1;
}

// src/handlers/code.ts
var FILETYPES = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  md: "markdown",
  zig: "zig"
};
function hexdump(buf, limit = 4096) {
  const view = buf.subarray(0, limit);
  const rows = [];
  for (let offset = 0;offset < view.length; offset += 16) {
    const slice = view.subarray(offset, offset + 16);
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(slice, (b) => b >= 32 && b < 127 ? String.fromCharCode(b) : ".").join("");
    rows.push(offset.toString(16).padStart(8, "0") + "  " + hex.padEnd(47) + "  " + ascii);
  }
  if (buf.length > limit)
    rows.push(`\u2026 (${buf.length - limit} more bytes \u2014 press o to open externally)`);
  return rows.join(`
`);
}
var codeHandler = {
  id: "code",
  extensions: [],
  async load(path) {
    const info = await stat(path);
    if (info.isDirectory())
      throw new Error("not a file");
    const buf = await readFile(path);
    if (looksBinary(buf)) {
      return { kind: "code", content: hexdump(buf) };
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return { kind: "code", content: buf.toString("utf8"), filetype: FILETYPES[ext] };
  }
};

// src/handlers/data.ts
import { readFile as readFile2 } from "fs/promises";
var EXTENSIONS = ["csv", "tsv", "json"];
var MAX_CELL = 60;
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0;i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === `
`) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
function formatTable(rows) {
  if (rows.length === 0)
    return "(empty)";
  const width = Math.max(...rows.map((row) => row.length));
  const columnWidths = Array.from({ length: width }, (_, column) => Math.min(MAX_CELL, Math.max(...rows.map((row) => (row[column] ?? "").slice(0, MAX_CELL).length))));
  const lines = rows.map((row, index) => {
    const line = columnWidths.map((w, column) => (row[column] ?? "").slice(0, MAX_CELL).padEnd(w)).join("  |  ");
    return index === 0 ? line + `
` + columnWidths.map((w) => "-".repeat(w)).join("--|---") : line;
  });
  return lines.join(`
`);
}
var dataHandler = {
  id: "data",
  extensions: EXTENSIONS,
  async load(path) {
    const text = await readFile2(path, "utf8");
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "json") {
      try {
        return { kind: "code", content: JSON.stringify(JSON.parse(text), null, 2) };
      } catch {
        return { kind: "code", content: text };
      }
    }
    const delimiter = ext === "tsv" ? "\t" : ",";
    return { kind: "code", content: formatTable(parseDelimited(text, delimiter)) };
  }
};

// src/handlers/document.ts
import { readFile as readFile3, stat as stat3 } from "fs/promises";
import * as mupdf from "mupdf";

// src/lib/cache.ts
import { createHash } from "crypto";
import { mkdir, readdir, rm, stat as stat2, writeFile } from "fs/promises";
import os from "os";
import path from "path";
var ROOT = path.join(os.tmpdir(), "opencode-file-viewer");
async function fileKey(file) {
  const info = await stat2(file);
  const hash = createHash("sha1").update(path.resolve(file)).update(String(info.mtimeMs)).update(String(info.size));
  return hash.digest("hex").slice(0, 16);
}
async function cacheDir(key) {
  const dir = path.join(ROOT, key);
  await mkdir(dir, { recursive: true });
  return dir;
}
async function cachedFile(key, name) {
  const file = path.join(ROOT, key, name);
  try {
    await stat2(file);
    return file;
  } catch {
    return;
  }
}
async function writeCacheFile(key, name, data) {
  const dir = await cacheDir(key);
  const file = path.join(dir, name);
  await writeFile(file, data);
  return file;
}
async function pruneCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    for (const entry of await readdir(ROOT)) {
      const dir = path.join(ROOT, entry);
      const info = await stat2(dir).catch(() => {
        return;
      });
      if (info?.isDirectory() && now - info.mtimeMs > maxAgeMs)
        await rm(dir, { recursive: true, force: true });
    }
  } catch {}
}

// src/handlers/document.ts
var EXTENSIONS2 = ["pdf", "epub", "cbz"];
var MAGIC = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip"
};
var TARGET_LONG_EDGE = 1400;
async function renderPage(file, key, index) {
  const name = `page-${index + 1}.png`;
  const cached = await cachedFile(key, name);
  if (cached)
    return cached;
  const doc = mupdf.Document.openDocument(await readFile3(file), magicFor(file));
  try {
    const page = doc.loadPage(index);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      const longEdge = Math.max(x1 - x0, y1 - y0) || 612;
      const scale = TARGET_LONG_EDGE / longEdge;
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      try {
        return await writeCacheFile(key, name, pixmap.asPNG());
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}
function magicFor(file) {
  const ext = extension(file);
  return MAGIC[ext] ?? MAGIC.pdf;
}
function extension(file) {
  return file.split(".").pop()?.toLowerCase() ?? "";
}
var documentHandler = {
  id: "document",
  extensions: EXTENSIONS2,
  async load(path) {
    const key = await fileKey(path);
    pruneCache();
    await stat3(path);
    const probe = mupdf.Document.openDocument(await readFile3(path), magicFor(path));
    const count = probe.countPages();
    probe.destroy();
    return {
      kind: "pages",
      count,
      pagePath: (index) => renderPage(path, key, index)
    };
  }
};

// src/handlers/image.ts
var EXTENSIONS3 = ["png", "jpg", "jpeg", "webp", "gif"];
var imageHandler = {
  id: "image",
  extensions: EXTENSIONS3,
  async load(path) {
    return { kind: "image", path };
  }
};

// src/handlers/markdown.ts
import { readFile as readFile4 } from "fs/promises";
var EXTENSIONS4 = ["md", "markdown", "mdx"];
var markdownHandler = {
  id: "markdown",
  extensions: EXTENSIONS4,
  async load(path) {
    return { kind: "markdown", content: await readFile4(path, "utf8") };
  }
};

// src/handlers/office.ts
import { stat as stat4 } from "fs/promises";
import path2 from "path";
var EXTENSIONS5 = ["docx", "doc", "pptx", "ppt", "xlsx", "xls", "odt", "ods", "odp", "rtf", "svg"];
function sofficeBinary() {
  return Bun.which("soffice") ?? "/Applications/LibreOffice.app/Contents/MacOS/soffice";
}
async function convertToPdf(file, key) {
  const base = path2.basename(file, path2.extname(file));
  const existing = await cachedFile(key, `${base}.pdf`);
  if (existing)
    return existing;
  const soffice = sofficeBinary();
  if (!soffice) {
    throw new Error("LibreOffice not found \u2014 install with `brew install --cask libreoffice` to view office files");
  }
  const dir = await cacheDir(key);
  const proc = Bun.spawn([soffice, "--headless", "--convert-to", "pdf", "--outdir", dir, file], {
    stdout: "ignore",
    stderr: "pipe"
  });
  const timeout = setTimeout(() => proc.kill(), 120000);
  try {
    const code = await proc.exited;
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`soffice exited ${code}: ${stderr.trim().slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
  const converted = path2.join(dir, `${base}.pdf`);
  await stat4(converted);
  return converted;
}
var officeHandler = {
  id: "office",
  extensions: EXTENSIONS5,
  async load(file) {
    const key = await fileKey(file);
    const pdf = await convertToPdf(file, key);
    return documentHandler.load(pdf);
  }
};

// src/handlers/registry.ts
var handlers = [
  imageHandler,
  documentHandler,
  officeHandler,
  markdownHandler,
  dataHandler,
  codeHandler
];
var knownExtensions = handlers.flatMap((handler) => [...handler.extensions]);
function pickHandler(file) {
  const ext = file.split(".").pop()?.toLowerCase();
  return handlers.find((handler) => ext !== undefined && handler.extensions.includes(ext)) ?? codeHandler;
}

// src/tui.tsx
var PANEL_NAME = "fileviewer.view";
var COMMAND_PREFIX = "fileviewer.";
var ASK_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "pdf", "epub", "cbz", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "odt", "ods", "odp", "rtf", "svg", "md", "markdown", "mdx"];
var ASK_COOLDOWN_MS = 60000;
function expandPath(raw, base) {
  const expanded = raw.startsWith("~") ? path3.join(os2.homedir(), raw.slice(1)) : raw;
  return path3.resolve(base ?? process.cwd(), expanded);
}
async function isFile(file) {
  try {
    return (await stat5(file)).isFile();
  } catch {
    return false;
  }
}
async function requestOpen(context, file) {
  if (!await isFile(file)) {
    context.ui.toast.show({
      title: "File viewer",
      message: `${file}: not found`,
      variant: "error"
    });
    return;
  }
  setCurrentFile(file);
  const opened = context.ui.panel.open(PANEL_NAME);
  if (!opened) {
    context.ui.toast.show({
      title: "File viewer",
      message: "Open a session first \u2014 the viewer panel is session-scoped",
      variant: "warning"
    });
  }
}
function candidatePaths(event) {
  const out = [];
  const data = event.data;
  if (Array.isArray(data.content)) {
    for (const part of data.content) {
      if (part?.type === "file" && typeof part.uri === "string" && part.uri.startsWith("file://")) {
        try {
          out.push(fileURLToPath(part.uri));
        } catch {}
      } else if (part?.type === "text" && typeof part.text === "string") {
        for (const match of part.text.matchAll(/(?:\/|\.{1,2}\/|~\/)[^\s`"'<>|*?\\]+/g))
          out.push(match[0]);
      }
    }
  }
  const meta = data.metadata;
  if (meta && typeof meta === "object") {
    for (const key of ["filePath", "path", "file"]) {
      const value = meta[key];
      if (typeof value === "string")
        out.push(value);
    }
  }
  return out;
}
function hasAskExtension(context, file, askExtensions) {
  const ext = file.split(".").pop()?.toLowerCase();
  if (ext === undefined || !askExtensions.has(ext))
    return;
  return path3.isAbsolute(file) ? file : path3.resolve(context.location?.directory ?? process.cwd(), file);
}
async function pickFile(directory, context) {
  const dir = directory ?? process.cwd();
  const entries = await readdir2(dir, {
    withFileTypes: true
  });
  const options = entries.filter((entry) => {
    if (!entry.isFile())
      return false;
    const ext = entry.name.split(".").pop()?.toLowerCase();
    return ext !== undefined && knownExtensions.includes(ext);
  }).slice(0, 500).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({
    title: entry.name,
    value: path3.join(dir, entry.name)
  }));
  if (options.length === 0) {
    context.ui.toast.show({
      title: "File viewer",
      message: `No viewable files in ${dir}`,
      variant: "warning"
    });
    return;
  }
  return context.ui.dialog.select({
    title: "View file",
    options
  });
}
var tui_default = Plugin.define({
  id: "opencode.file-viewer.tui",
  setup(context) {
    const options = context.options;
    const askEnabled = options.ask !== false;
    const askExtensions = new Set(Array.isArray(options.extensions) && options.extensions.length > 0 ? options.extensions.map((ext) => ext.toLowerCase()) : ASK_EXTENSIONS);
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [{
        id: `${COMMAND_PREFIX}view`,
        title: "View file",
        group: "File viewer",
        description: "Open a file in the inline viewer (PNG, PDF, EPUB, PPTX, DOCX, Markdown, CSV, \u2026)",
        palette: true,
        slash: {
          name: "view",
          arguments: true
        },
        suggested: true,
        run: async (input) => {
          const raw = input?.trim();
          const file = raw ? expandPath(raw, context.location?.directory) : await pickFile(context.location?.directory, context);
          if (!file)
            return;
          await requestOpen(context, file);
        }
      }]
    }));
    let asking = false;
    const lastAsked = new Map;
    const unsubscribeAsk = context.data.on("session.tool.success", async (event) => {
      if (!askEnabled || asking)
        return;
      for (const candidate of candidatePaths(event)) {
        const file = hasAskExtension(context, candidate, askExtensions);
        if (!file || !await isFile(file))
          continue;
        const viewed = currentFile();
        if (viewed === file && context.ui.panel.current())
          continue;
        const previous = lastAsked.get(file) ?? 0;
        if (Date.now() - previous < ASK_COOLDOWN_MS)
          continue;
        lastAsked.set(file, Date.now());
        asking = true;
        context.ui.dialog.confirm({
          title: "View file?",
          message: `${path3.basename(file)} was just written by the agent`,
          label: {
            confirm: "View",
            cancel: "Dismiss"
          }
        }).then((confirmed) => {
          if (confirmed)
            return requestOpen(context, file);
        }).finally(() => {
          asking = false;
        });
        break;
      }
    });
    context.ui.slot({
      append: "session.panel",
      render: (panel) => _$createComponent(Show, {
        get when() {
          return panel.name === PANEL_NAME;
        },
        get children() {
          return _$createComponent(Viewer, {
            panel
          });
        }
      })
    });
    return () => unsubscribeAsk();
  }
});
var [currentFile, setCurrentFile] = createSignal();
function Viewer(props) {
  const context = usePlugin();
  const [status, setStatus] = createSignal("loading");
  const [content, setContent] = createSignal();
  const [error, setError] = createSignal("");
  const [handlerId, setHandlerId] = createSignal("");
  const [page, setPage] = createSignal(0);
  const [pageCount, setPageCount] = createSignal(0);
  const [pageImage, setPageImage] = createSignal();
  const [pageBusy, setPageBusy] = createSignal(false);
  const [fileLabel, setFileLabel] = createSignal("");
  let scrollbox;
  let style;
  onMount(() => {
    style = SyntaxStyle.fromStyles({
      default: {
        fg: "#d4d4d4"
      },
      keyword: {
        fg: "#ff7b72",
        bold: true
      },
      string: {
        fg: "#a5d6ff"
      },
      comment: {
        fg: "#8b949e",
        italic: true
      },
      number: {
        fg: "#79c0ff"
      },
      boolean: {
        fg: "#79c0ff"
      },
      constant: {
        fg: "#79c0ff"
      },
      function: {
        fg: "#d2a8ff"
      },
      "function.call": {
        fg: "#d2a8ff"
      },
      type: {
        fg: "#ffa657"
      },
      constructor: {
        fg: "#ffa657"
      },
      variable: {
        fg: "#d4d4d4"
      },
      "variable.member": {
        fg: "#79c0ff"
      },
      property: {
        fg: "#79c0ff"
      },
      operator: {
        fg: "#ff7b72"
      },
      punctuation: {
        fg: "#f0f6fc"
      },
      "punctuation.bracket": {
        fg: "#f0f6fc"
      },
      "punctuation.delimiter": {
        fg: "#c9d1d9"
      },
      "markup.heading": {
        fg: "#58a6ff",
        bold: true
      },
      "markup.heading.1": {
        fg: "#58a6ff",
        bold: true,
        underline: true
      },
      "markup.heading.2": {
        fg: "#79c0ff",
        bold: true
      },
      "markup.heading.3": {
        fg: "#79c0ff",
        bold: true
      },
      bold: {
        fg: "#f0f6fc",
        bold: true
      },
      "markup.bold": {
        fg: "#f0f6fc",
        bold: true
      },
      "markup.strong": {
        fg: "#f0f6fc",
        bold: true
      },
      "markup.italic": {
        fg: "#f0f6fc",
        italic: true
      },
      "markup.list": {
        fg: "#ff7b72"
      },
      "markup.quote": {
        fg: "#8b949e",
        italic: true
      },
      "markup.raw": {
        fg: "#a5d6ff"
      },
      "markup.raw.block": {
        fg: "#a5d6ff"
      },
      "markup.link": {
        fg: "#58a6ff",
        underline: true
      },
      "markup.link.url": {
        fg: "#58a6ff",
        underline: true
      }
    }, context.renderer.nativeScene);
    onCleanup(() => {
      context.renderer.idle().then(() => style?.destroy());
    });
    context.keymap.layer(() => ({
      mode: "global",
      priority: 20,
      commands: [{
        id: `${COMMAND_PREFIX}page.next`,
        title: "Next page",
        bind: "l",
        run: () => setPage((p) => p + 1)
      }, {
        id: `${COMMAND_PREFIX}page.next.alt`,
        title: "Next page",
        bind: "n",
        run: () => setPage((p) => p + 1)
      }, {
        id: `${COMMAND_PREFIX}page.prev`,
        title: "Previous page",
        bind: "h",
        run: () => setPage((p) => Math.max(0, p - 1))
      }, {
        id: `${COMMAND_PREFIX}page.prev.alt`,
        title: "Previous page",
        bind: "p",
        run: () => setPage((p) => Math.max(0, p - 1))
      }, {
        id: `${COMMAND_PREFIX}scroll.down`,
        bind: "j",
        run: () => scrollbox?.scrollBy(3)
      }, {
        id: `${COMMAND_PREFIX}scroll.up`,
        bind: "k",
        run: () => scrollbox?.scrollBy(-3)
      }, {
        id: `${COMMAND_PREFIX}scroll.top`,
        bind: "g",
        run: () => scrollbox?.scrollTo(0)
      }, {
        id: `${COMMAND_PREFIX}scroll.bottom`,
        bind: "shift+g",
        run: () => scrollbox?.scrollBy(Number.MAX_SAFE_INTEGER)
      }, {
        id: `${COMMAND_PREFIX}fullscreen`,
        title: "Toggle fullscreen",
        bind: "f",
        run: () => props.panel.toggleFullscreen()
      }, {
        id: `${COMMAND_PREFIX}open`,
        title: "Open externally",
        bind: "o",
        run: () => {
          const file = currentFile();
          if (file)
            Bun.spawn(["open", file], {
              stdout: "ignore",
              stderr: "ignore"
            });
        }
      }, {
        id: `${COMMAND_PREFIX}close`,
        title: "Close viewer",
        bind: "escape",
        run: () => props.panel.close()
      }]
    }));
    loadFile();
  });
  async function loadFile() {
    const file = currentFile();
    if (!file) {
      setStatus("error");
      setError("no file selected \u2014 use /view <path>");
      return;
    }
    setFileLabel(path3.basename(file));
    setStatus("loading");
    setError("");
    setPage(0);
    setPageImage(undefined);
    try {
      const handler = pickHandler(file);
      setHandlerId(handler.id);
      const loaded = await handler.load(file);
      setContent(loaded);
      if (loaded.kind === "pages")
        setPageCount(loaded.count);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  createEffect(() => {
    const loaded = content();
    if (loaded?.kind !== "pages")
      return;
    const index = Math.min(Math.max(page(), 0), loaded.count - 1);
    setPageBusy(true);
    loaded.pagePath(index).then((image) => {
      if (page() === index) {
        setPageImage(image);
        setPageBusy(false);
      }
    }).catch((cause) => {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  });
  const pageInfo = () => {
    const loaded = content();
    if (loaded?.kind !== "pages")
      return;
    return `${Math.min(page(), loaded.count - 1) + 1}/${loaded.count}`;
  };
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$12 = _$createElement("box"), _el$13 = _$createElement("text"), _el$16 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$12);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "height", "100%");
    _$setProp(_el$2, "flexGrow", 1);
    _$setProp(_el$2, "flexDirection", "column");
    _$insert(_el$2, _$createComponent(Switch, {
      get children() {
        return [_$createComponent(Match, {
          get when() {
            return status() === "loading";
          },
          get children() {
            var _el$3 = _$createElement("box"), _el$4 = _$createElement("text");
            _$insertNode(_el$3, _el$4);
            _$setProp(_el$3, "justifyContent", "center");
            _$setProp(_el$3, "alignItems", "center");
            _$setProp(_el$3, "flexGrow", 1);
            _$setProp(_el$4, "fg", "#8b949e");
            _$insert(_el$4, () => handlerId() === "office" ? "converting with LibreOffice\u2026" : "loading\u2026");
            return _el$3;
          }
        }), _$createComponent(Match, {
          get when() {
            return status() === "error";
          },
          get children() {
            var _el$5 = _$createElement("box"), _el$6 = _$createElement("text"), _el$7 = _$createElement("text");
            _$insertNode(_el$5, _el$6);
            _$insertNode(_el$5, _el$7);
            _$setProp(_el$5, "justifyContent", "center");
            _$setProp(_el$5, "alignItems", "center");
            _$setProp(_el$5, "flexGrow", 1);
            _$setProp(_el$5, "flexDirection", "column");
            _$setProp(_el$5, "gap", 1);
            _$setProp(_el$6, "fg", "#ff7b72");
            _$insert(_el$6, fileLabel);
            _$setProp(_el$7, "fg", "#8b949e");
            _$insert(_el$7, error);
            return _el$5;
          }
        }), _$createComponent(Match, {
          get when() {
            return content()?.kind === "image";
          },
          get children() {
            var _el$8 = _$createElement("image");
            _$setProp(_el$8, "fit", "fit");
            _$setProp(_el$8, "protocol", "auto");
            _$setProp(_el$8, "style", {
              width: "100%",
              height: "100%"
            });
            _$effect((_$p) => _$setProp(_el$8, "source", content().path, _$p));
            return _el$8;
          }
        }), _$createComponent(Match, {
          get when() {
            return content()?.kind === "pages";
          },
          get children() {
            return _$createComponent(Show, {
              get when() {
                return pageImage();
              },
              get fallback() {
                return (() => {
                  var _el$18 = _$createElement("box"), _el$19 = _$createElement("text");
                  _$insertNode(_el$18, _el$19);
                  _$setProp(_el$18, "justifyContent", "center");
                  _$setProp(_el$18, "alignItems", "center");
                  _$setProp(_el$18, "flexGrow", 1);
                  _$setProp(_el$19, "fg", "#8b949e");
                  _$insert(_el$19, () => pageBusy() ? "rendering page\u2026" : "");
                  return _el$18;
                })();
              },
              get children() {
                var _el$9 = _$createElement("image");
                _$setProp(_el$9, "fit", "fit");
                _$setProp(_el$9, "protocol", "auto");
                _$setProp(_el$9, "style", {
                  width: "100%",
                  height: "100%"
                });
                _$effect((_$p) => _$setProp(_el$9, "source", pageImage(), _$p));
                return _el$9;
              }
            });
          }
        }), _$createComponent(Match, {
          get when() {
            return content()?.kind === "markdown";
          },
          get children() {
            var _el$0 = _$createElement("scrollbox"), _el$1 = _$createElement("markdown");
            _$insertNode(_el$0, _el$1);
            var _ref$ = scrollbox;
            typeof _ref$ === "function" ? _$use(_ref$, _el$0) : scrollbox = _el$0;
            _$setProp(_el$0, "width", "100%");
            _$setProp(_el$0, "height", "100%");
            _$setProp(_el$1, "syntaxStyle", style);
            _$setProp(_el$1, "conceal", true);
            _$effect((_$p) => _$setProp(_el$1, "content", content().content, _$p));
            return _el$0;
          }
        }), _$createComponent(Match, {
          get when() {
            return content()?.kind === "code";
          },
          get children() {
            var _el$10 = _$createElement("scrollbox"), _el$11 = _$createElement("code");
            _$insertNode(_el$10, _el$11);
            var _ref$2 = scrollbox;
            typeof _ref$2 === "function" ? _$use(_ref$2, _el$10) : scrollbox = _el$10;
            _$setProp(_el$10, "width", "100%");
            _$setProp(_el$10, "height", "100%");
            _$setProp(_el$11, "syntaxStyle", style);
            _$effect((_p$) => {
              var _v$ = content().content, _v$2 = content().filetype;
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$11, "content", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$11, "filetype", _v$2, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$10;
          }
        })];
      }
    }));
    _$insertNode(_el$12, _el$13);
    _$insertNode(_el$12, _el$16);
    _$setProp(_el$12, "flexDirection", "row");
    _$setProp(_el$12, "gap", 2);
    _$setProp(_el$13, "fg", "#8b949e");
    _$insert(_el$13, fileLabel);
    _$insert(_el$12, _$createComponent(Show, {
      get when() {
        return handlerId();
      },
      get children() {
        var _el$14 = _$createElement("text");
        _$setProp(_el$14, "fg", "#58a6ff");
        _$insert(_el$14, handlerId);
        return _el$14;
      }
    }), _el$16);
    _$insert(_el$12, _$createComponent(Show, {
      get when() {
        return pageInfo();
      },
      get children() {
        var _el$15 = _$createElement("text");
        _$setProp(_el$15, "fg", "#f0f6fc");
        _$insert(_el$15, pageInfo);
        return _el$15;
      }
    }), _el$16);
    _$insertNode(_el$16, _$createTextNode(`h/l page \xB7 j/k scroll \xB7 f fullscreen \xB7 o open \xB7 esc close`));
    _$setProp(_el$16, "fg", "#484f58");
    return _el$;
  })();
}
export {
  tui_default as default
};
