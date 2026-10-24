import { readFile } from "node:fs/promises"
import type { ViewerHandler } from "./types"

const EXTENSIONS = ["csv", "tsv", "json"] as const

const MAX_CELL = 60

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""))
      rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.replace(/\r$/, ""))
    rows.push(row)
  }
  return rows
}

function formatTable(rows: string[][]): string {
  if (rows.length === 0) return "(empty)"
  const width = Math.max(...rows.map((row) => row.length))
  const columnWidths = Array.from({ length: width }, (_, column) =>
    Math.min(MAX_CELL, Math.max(...rows.map((row) => (row[column] ?? "").slice(0, MAX_CELL).length))),
  )
  const lines = rows.map((row, index) => {
    const line = columnWidths
      .map((w, column) => (row[column] ?? "").slice(0, MAX_CELL).padEnd(w))
      .join("  |  ")
    return index === 0 ? line + "\n" + columnWidths.map((w) => "-".repeat(w)).join("--|---") : line
  })
  return lines.join("\n")
}

export const dataHandler: ViewerHandler = {
  id: "data",
  extensions: EXTENSIONS,
  async load(path) {
    const text = await readFile(path, "utf8")
    const ext = path.split(".").pop()?.toLowerCase()
    if (ext === "json") {
      try {
        return { kind: "code", content: JSON.stringify(JSON.parse(text), null, 2) }
      } catch {
        // not valid JSON — fall through to raw text
        return { kind: "code", content: text }
      }
    }
    const delimiter = ext === "tsv" ? "\t" : ","
    return { kind: "code", content: formatTable(parseDelimited(text, delimiter)) }
  },
}
