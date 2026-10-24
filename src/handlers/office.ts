import { existsSync } from "node:fs"
import { stat } from "node:fs/promises"
import path from "node:path"
import { cacheDir, cachedFile, fileKey } from "../lib/cache"
import { documentHandler } from "./document"
import type { ViewerHandler } from "./types"

const EXTENSIONS = ["docx", "doc", "pptx", "ppt", "xlsx", "xls", "odt", "ods", "odp", "rtf", "svg"] as const

function sofficeBinary(): string | undefined {
  return (
    Bun.which("soffice") ??
    (process.platform === "win32"
      ? [
          path.join(process.env["PROGRAMFILES"] ?? "C:\\Program Files", "LibreOffice", "program", "soffice.exe"),
          path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "LibreOffice", "program", "soffice.exe"),
        ].find((candidate) => existsSync(candidate))
      : "/Applications/LibreOffice.app/Contents/MacOS/soffice")
  )
}

async function convertToPdf(file: string, key: string): Promise<string> {
  const base = path.basename(file, path.extname(file))
  const existing = await cachedFile(key, `${base}.pdf`)
  if (existing) return existing

  const soffice = sofficeBinary()
  if (!soffice) {
    throw new Error("LibreOffice not found — install with `brew install --cask libreoffice` to view office files")
  }

  const dir = await cacheDir(key)
  const proc = Bun.spawn([soffice, "--headless", "--convert-to", "pdf", "--outdir", dir, file], {
    stdout: "ignore",
    stderr: "pipe",
  })
  const timeout = setTimeout(() => proc.kill(), 120_000)
  try {
    const code = await proc.exited
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`soffice exited ${code}: ${stderr.trim().slice(0, 200)}`)
    }
  } finally {
    clearTimeout(timeout)
  }

  const converted = path.join(dir, `${base}.pdf`)
  await stat(converted) // throws if LibreOffice silently produced nothing
  return converted
}

export const officeHandler: ViewerHandler = {
  id: "office",
  extensions: EXTENSIONS,
  async load(file) {
    const key = await fileKey(file)
    const pdf = await convertToPdf(file, key)
    return documentHandler.load(pdf)
  },
}
