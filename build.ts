// Compiles src/tui.tsx with the real Solid transform (babel-preset-solid via
// @opentui/solid's Bun plugin). Plain `bun build` lowers JSX with React
// semantics, which breaks at runtime: Solid needs getter-wrapped props.
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["src/tui.tsx"],
  target: "bun",
  packages: "external",
  tsconfig: "./tsconfig.build.json",
  plugins: [createSolidTransformPlugin()],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
const code = await result.outputs[0].text()
if (code.includes("jsxDEV") || code.includes("jsx-runtime")) {
  console.error("FAILED: output still contains builtin JSX transform output")
  process.exit(1)
}
await Bun.write("dist/tui.js", code)
console.log(`built dist/tui.js (${code.length} bytes, solid transform ok)`)
