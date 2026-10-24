import type { ViewerHandler } from "./types"

const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const

export const imageHandler: ViewerHandler = {
  id: "image",
  extensions: EXTENSIONS,
  async load(path) {
    return { kind: "image", path }
  },
}
