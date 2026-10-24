import type { Rpc } from "@opencode/plugin/rpc"

/**
 * Server ↔ TUI channel for the file viewer. The server-side `view` tool emits
 * `requested`; the TUI plugin subscribes and opens the panel.
 *
 * Declared as a plain PortableDefinition (not Rpc.define) because register()
 * requires JSON-Schema-shaped values and zero-method definitions.
 */
export const FileViewerRpc = {
  id: "file-viewer",
  methods: {},
  events: {
    requested: {
      schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
} as const satisfies Rpc.PortableDefinition
