import { readFile } from "node:fs/promises"
import type { ViewerHandler } from "./types"

const EXTENSIONS = ["md", "markdown", "mdx"] as const

export const markdownHandler: ViewerHandler = {
  id: "markdown",
  extensions: EXTENSIONS,
  async load(path) {
    return { kind: "markdown", content: await readFile(path, "utf8") }
  },
}
