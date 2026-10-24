import { Plugin } from "@opencode/plugin"

/**
 * Server-side half of the file viewer. The UI lives in ./tui.tsx (CLI plugin).
 * A `view` tool so agents can open the panel is planned; the TUI plugin works
 * standalone via the /view slash command.
 */
export default Plugin.define({
  id: "opencode.file-viewer",
  async setup() {},
})
