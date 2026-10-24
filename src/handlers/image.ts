import { readFile } from "node:fs/promises"
import * as mupdf from "mupdf"
import { cachedFile, fileKey, pruneCache, writeCacheFile } from "../lib/cache"
import type { ViewerHandler } from "./types"

/** Formats OpenTUI's image pipeline can render from the file directly. */
const NATIVE = new Set(["png", "jpg", "jpeg", "webp", "gif"])

/**
 * BMP/TIFF decode fine in mupdf but terminals can't display them as-is —
 * convert to PNG once and cache, same pattern as the office → PDF pipeline.
 * HEIC is not handled at all (mupdf can't decode it either; use `o` external open).
 */
const EXTENSIONS = [...NATIVE, "bmp", "tif", "tiff"] as const

export const imageHandler: ViewerHandler = {
  id: "image",
  extensions: EXTENSIONS,
  async load(path) {
    const ext = path.split(".").pop()?.toLowerCase()
    if (ext !== undefined && NATIVE.has(ext)) return { kind: "image", path }
    return { kind: "image", path: await decodedPng(path) }
  },
}

async function decodedPng(file: string): Promise<string> {
  const key = await fileKey(file)
  const cached = await cachedFile(key, "decoded.png")
  if (cached) return cached
  void pruneCache()

  const image = new mupdf.Image(await readFile(file))
  try {
    const pixmap = image.toPixmap()
    try {
      // Native resolution: Image.toPixmap() takes no matrix. The terminal <image>
      // component scales to fit, so oversized sources just cost cache size.
      return await writeCacheFile(key, "decoded.png", pixmap.asPNG())
    } finally {
      pixmap.destroy()
    }
  } finally {
    image.destroy()
  }
}
