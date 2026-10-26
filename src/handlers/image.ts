import { readFile, stat } from "node:fs/promises"
import * as mupdf from "mupdf"
import { GifReader } from "omggif"
import { cachedFile, cacheDir, fileKey, pruneCache, writeCacheFile } from "../lib/cache"
import type { ViewContent, ViewerHandler } from "./types"

/** Formats OpenTUI's image pipeline can render from the file directly. PNG/WebP
 * proven stable; JPEG is NOT: pass-through (in contrast to BMP/TIFF) decodes
 * via mupdf instead — image renderables have stalled the TUI on some
 * JPEGs (300-DPI Photoshop metadata observed) and mupdf's decode is safe. */
const NATIVE = new Set(["png", "webp"])

/** Default pixel cap for the longest image edge when no target is given (~150dpi letter). */
const FALLBACK_LONG_EDGE = 1400
/** Safety cap so a pathological GIF can't stall the panel. */
const MAX_GIF_FRAMES = 240
/** GIFs commonly declare tiny delays; terminals playing faster than this strobe. */
const MIN_FRAME_DELAY_MS = 20

/**
 * BMP/TIFF decode fine in mupdf but terminals can't display them as-is —
 * convert to PNG once (capped at the panel's render target) and cache, same
 * pattern as the office → PDF pipeline. GIFs decode to per-frame PNGs via
 * omggif (mupdf has no frame API; OpenTUI's image component is static-only).
 * HEIC is not handled at all (mupdf can't decode it either; use `o` external open).
 */
const EXTENSIONS = [...NATIVE, "gif", "jpg", "jpeg", "bmp", "tif", "tiff"] as const

export const imageHandler: ViewerHandler = {
  id: "image",
  extensions: EXTENSIONS,
  async load(path, target) {
    const ext = path.split(".").pop()?.toLowerCase()
    if (ext !== undefined && NATIVE.has(ext)) return { kind: "image", path }
    const longEdge = target?.longEdge ?? FALLBACK_LONG_EDGE
    if (ext === "gif") return await gifFrames(path)
    return { kind: "image", path: await decodedPng(path, longEdge) }
  },
}

async function fileExists(file: string): Promise<boolean> {
  return await stat(file).then((info) => info.isFile(), () => false)
}

function frameFile(dir: string, index: number): string {
  return `${dir}/frame-${String(index + 1).padStart(4, "0")}.png`
}

async function decodedPng(file: string, longEdge: number): Promise<string> {
  const key = await fileKey(file)
  const cached = await cachedFile(key, "decoded.png")
  if (cached) return cached
  void pruneCache()

  const image = new mupdf.Image(await readFile(file))
  try {
    const pixmap = image.toPixmap()
    try {
      const natural = Math.max(pixmap.getWidth(), pixmap.getHeight()) || longEdge
      const data = natural > longEdge
        ? await renderScaledPng(
            image,
            Math.round((pixmap.getWidth() * longEdge) / natural),
            Math.round((pixmap.getHeight() * longEdge) / natural),
          )
        : pixmap.asPNG()
      return await writeCacheFile(key, "decoded.png", data)
    } finally {
      pixmap.destroy()
    }
  } finally {
    image.destroy()
  }
}

/**
 * Renders the image at the exact target size. Image unit space is 1×1, so the
 * draw matrix maps it (stretched) onto the target pixmap — the aspect is
 * preserved by computing target dimensions from the source's.
 */
async function renderScaledPng(image: mupdf.Image, width: number, height: number): Promise<Uint8Array> {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], true)
  try {
    const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap)
    try {
      device.fillImage(image, mupdf.Matrix.scale(width, height), 1)
      device.close()
    } finally {
      device.destroy()
    }
    return pixmap.asPNG()
  } finally {
    pixmap.destroy()
  }
}

async function gifFrames(file: string): Promise<ViewContent> {
  const key = await fileKey(file)
  const meta = await cachedFile(key, "frames.json")
  const dir = await cacheDir(key)
  if (meta) {
    try {
      const delays = JSON.parse(await readFile(meta, "utf8")) as number[]
      const frames = await frameContent(dir, delays, true)
      if (frames) return frames
    } catch {
      // unreadable cache redo below
    }
  }

  const reader = new GifReader(new Uint8Array(await readFile(file)))
  void pruneCache()
  const count = Math.min(reader.numFrames(), MAX_GIF_FRAMES)
  if (count === 0) throw new Error("GIF has no frames")

  const { width, height } = reader
  // asPNG() copies, so one reused pixmap serves the whole decode loop.
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], true)
  const delays: number[] = []
  try {
    for (let index = 0; index < count; index++) {
      const pixels = new Uint8ClampedArray(width * height * 4)
      // decodeAndBlit composites the frame (handling disposal) into raw RGBA.
      reader.decodeAndBlitFrameRGBA(index, pixels)
      pixmap.getPixels().set(pixels)
      // omggif reports display time in hundredths of a second (the GIF spec unit).
      delays.push(Math.max(MIN_FRAME_DELAY_MS, reader.frameInfo(index).delay * 10))
      await writeCacheFile(key, `frame-${String(index + 1).padStart(4, "0")}.png`, pixmap.asPNG())
    }
  } finally {
    pixmap.destroy()
  }

  if (count === 1) return { kind: "image", path: frameFile(dir, 0) }
  await writeCacheFile(key, "frames.json", new TextEncoder().encode(JSON.stringify(delays)))
  const frames = await frameContent(dir, delays, false)
  if (!frames) throw new Error("failed to build decoded GIF frame list")
  return frames
}

async function frameContent(
  dir: string,
  delays: readonly number[],
  verifyFiles: boolean,
): Promise<{ kind: "animation"; frames: { path: string; delayMs: number }[] } | undefined> {
  const frames = []
  for (let index = 0; index < delays.length; index++) {
    const file = frameFile(dir, index)
    if (verifyFiles && !(await fileExists(file))) return undefined // partial cache — decode again
    frames.push({ path: file, delayMs: delays[index]! })
  }
  if (delays.length <= 1) return undefined // single-frame GIFs render as plain images
  return { kind: "animation", frames }
}
