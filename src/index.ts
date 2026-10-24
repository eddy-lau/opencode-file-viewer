import os from "node:os"
import { stat } from "node:fs/promises"
import path from "node:path"
import { Plugin } from "@opencode/plugin"
import { FileViewerRpc } from "./rpc"

function expandPath(raw: string, base: string | undefined): string {
  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw
  return path.resolve(base ?? process.cwd(), expanded)
}

/**
 * Server-side half of the file viewer: exposes the `view` tool to the agent
 * and relays open requests to the TUI over plugin RPC. The UI lives in
 * ./tui.tsx (CLI plugin).
 */
export default Plugin.define({
  id: "opencode.file-viewer",
  async setup(ctx) {
    const registration = await ctx.rpc.register(FileViewerRpc, {})

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "view",
        description:
          "Open a file in the user's inline viewer panel (images, PDF, EPUB, PPTX/DOCX, Markdown, CSV, code). " +
          "Use whenever the user asks to view, show, preview, or display a file.",
        input: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file (absolute, ~/…, or relative to the workspace)" },
          },
          required: ["path"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const requested = typeof (input as { path?: unknown }).path === "string" ? (input as { path: string }).path : ""
          if (!requested) return { content: "Error: no path given." }

          const file = expandPath(requested, ctx.location?.directory)
          try {
            const info = await stat(file)
            if (!info.isFile()) return { content: `Error: ${requested} is not a file.` }
          } catch {
            return { content: `Error: ${requested} does not exist.` }
          }

          await registration.events.emit("requested", { path: file })
          return { content: `Opened ${path.basename(file)} in the viewer panel.` }
        },
      })
    })

    return () => registration.dispose()
  },
})
