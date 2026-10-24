import { readFile, stat } from "node:fs/promises"
import { looksBinary } from "../lib/binary"
import type { ViewerHandler } from "./types"

/** Languages bundled with OpenTUI's Tree-sitter; everything else renders unstyled. */
const FILETYPES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  md: "markdown",
  zig: "zig",
}

function hexdump(buf: Uint8Array, limit = 4096): string {
  const view = buf.subarray(0, limit)
  const rows: string[] = []
  for (let offset = 0; offset < view.length; offset += 16) {
    const slice = view.subarray(offset, offset + 16)
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join(" ")
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")
    rows.push(offset.toString(16).padStart(8, "0") + "  " + hex.padEnd(47) + "  " + ascii)
  }
  if (buf.length > limit) rows.push(`… (${buf.length - limit} more bytes — press o to open externally)`)
  return rows.join("\n")
}

export const codeHandler: ViewerHandler = {
  id: "code",
  extensions: [], // fallback: claims any file
  async load(path) {
    const info = await stat(path)
    if (info.isDirectory()) throw new Error("not a file")
    const buf = await readFile(path)
    if (looksBinary(buf)) {
      return { kind: "code", content: hexdump(buf) }
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    return { kind: "code", content: buf.toString("utf8"), filetype: FILETYPES[ext] }
  },
}
