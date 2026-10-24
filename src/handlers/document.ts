import { readFile, stat } from "node:fs/promises"
import * as mupdf from "mupdf"
import { cachedFile, fileKey, pruneCache, writeCacheFile } from "../lib/cache"
import type { ViewerHandler } from "./types"

const EXTENSIONS = ["pdf", "epub", "cbz"] as const

const MAGIC: Record<(typeof EXTENSIONS)[number], string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip",
}

/** Long-edge target in pixels for page pixmaps (~150dpi letter). */
const TARGET_LONG_EDGE = 1400

async function renderPage(file: string, key: string, index: number): Promise<string> {
  const name = `page-${index + 1}.png`
  const cached = await cachedFile(key, name)
  if (cached) return cached

  const doc = mupdf.Document.openDocument(await readFile(file), magicFor(file))
  try {
    const page = doc.loadPage(index)
    try {
      const [x0, y0, x1, y1] = page.getBounds()
      const longEdge = Math.max(x1 - x0, y1 - y0) || 612
      const scale = TARGET_LONG_EDGE / longEdge
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
      try {
        return await writeCacheFile(key, name, pixmap.asPNG())
      } finally {
        pixmap.destroy()
      }
    } finally {
      page.destroy()
    }
  } finally {
    doc.destroy()
  }
}

function magicFor(file: string): string {
  const ext = extension(file) as keyof typeof MAGIC
  return MAGIC[ext] ?? MAGIC.pdf
}

function extension(file: string): string {
  return file.split(".").pop()?.toLowerCase() ?? ""
}

export const documentHandler: ViewerHandler = {
  id: "document",
  extensions: EXTENSIONS,
  async load(path) {
    const key = await fileKey(path)
    void pruneCache()
    await stat(path) // throws a clear ENOENT for missing files
    const probe = mupdf.Document.openDocument(await readFile(path), magicFor(path))
    const count = probe.countPages()
    probe.destroy()
    return {
      kind: "pages",
      count,
      pagePath: (index) => renderPage(path, key, index),
    }
  },
}
