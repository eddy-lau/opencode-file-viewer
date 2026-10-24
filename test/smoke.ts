// Non-UI smoke test for the conversion pipeline. Run: bun test/smoke.ts
import { pickHandler } from "../src/handlers/registry"

const fixtures: Array<[string, string]> = [
  ["csv", process.argv[2]! + "/sample.csv"],
  ["json", process.argv[2]! + "/sample.json"],
  ["markdown", process.argv[2]! + "/sample.md"],
  ["svg", process.argv[2]! + "/sample.svg"],
  ["ts", process.argv[2]! + "/sample.ts"],
  ["binary", process.argv[2]! + "/binary.dat"],
  ["png", "/System/Library/Desktop Pictures/.wallpapers/Sonoma Horizon/Sonoma Horizon Thumbnail.png"],
  ["pdf", "/System/Library/ProductDocuments/ProductGuides/ENERGY STAR.pdf"],
]

if (process.argv[3]) fixtures.push(["docx", process.argv[3]])

let failures = 0
for (const [label, file] of fixtures) {
  const handler = pickHandler(file)
  try {
    const content = await handler.load(file)
    if (content.kind === "pages") {
      const first = await content.pagePath(0)
      const stat = await Bun.file(first).exists()
      console.log(`✓ ${label}: ${handler.id} handler, ${content.count} pages, page0=${stat ? "png ok" : "MISSING"}`)
      if (!stat) failures++
    } else if (content.kind === "image") {
      const size = (await Bun.file(content.path).size) | 0
      console.log(`✓ ${label}: ${handler.id} handler, image ${size} bytes`)
    } else {
      const preview = content.content.replaceAll("\n", "\\n").slice(0, 80)
      console.log(`✓ ${label}: ${handler.id} handler, ${content.kind}${content.filetype ? ":" + content.filetype : ""} "${preview}"`)
    }
  } catch (cause) {
    failures++
    console.log(`✗ ${label}: FAILED — ${cause instanceof Error ? cause.message : cause}`)
  }
}
process.exit(failures === 0 ? 0 : 1)
