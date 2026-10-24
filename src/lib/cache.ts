import { createHash } from "node:crypto"
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const ROOT = path.join(os.tmpdir(), "opencode-file-viewer")

/** Stable cache key for a file version. */
export async function fileKey(file: string): Promise<string> {
  const info = await stat(file)
  const hash = createHash("sha1").update(path.resolve(file)).update(String(info.mtimeMs)).update(String(info.size))
  return hash.digest("hex").slice(0, 16)
}

/** Per-file scratch directory: ROOT/<key>/. */
export async function cacheDir(key: string): Promise<string> {
  const dir = path.join(ROOT, key)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function cachedFile(key: string, name: string): Promise<string | undefined> {
  const file = path.join(ROOT, key, name)
  try {
    await stat(file)
    return file
  } catch {
    return undefined
  }
}

export async function writeCacheFile(key: string, name: string, data: Uint8Array): Promise<string> {
  const dir = await cacheDir(key)
  const file = path.join(dir, name)
  await writeFile(file, data)
  return file
}

/** Drops cache entries older than maxAgeMs. Fire-and-forget; safe to call on load. */
export async function pruneCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const now = Date.now()
    for (const entry of await readdir(ROOT)) {
      const dir = path.join(ROOT, entry)
      const info = await stat(dir).catch(() => undefined)
      if (info?.isDirectory() && now - info.mtimeMs > maxAgeMs) await rm(dir, { recursive: true, force: true })
    }
  } catch {
    // cache is best-effort
  }
}
