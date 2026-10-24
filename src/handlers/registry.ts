import path from "node:path"
import { codeHandler } from "./code"
import { dataHandler } from "./data"
import { documentHandler } from "./document"
import { imageHandler } from "./image"
import { markdownHandler } from "./markdown"
import { officeHandler } from "./office"
import type { ViewerHandler } from "./types"

export const handlers: readonly ViewerHandler[] = [
  imageHandler,
  documentHandler,
  officeHandler,
  markdownHandler,
  dataHandler,
  codeHandler, // fallback last: claims everything
]

/** Handlers with concrete extension lists — drives the file picker. */
export const knownExtensions: readonly string[] = handlers.flatMap((handler) => [...handler.extensions])

export function pickHandler(file: string): ViewerHandler {
  const ext = file.split(".").pop()?.toLowerCase()
  return (
    handlers.find((handler) => ext !== undefined && handler.extensions.includes(ext)) ??
    // codeHandler (last entry) is the explicit fallback for unknown extensions
    codeHandler
  )
}
