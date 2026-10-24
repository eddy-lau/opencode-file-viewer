/** What the panel host knows how to render. */
export type ViewContent =
  | { readonly kind: "image"; readonly path: string }
  | {
      readonly kind: "pages"
      readonly count: number
      /** Renders one page (0-based) to a PNG path; may do slow work on first call. */
      readonly pagePath: (index: number) => Promise<string>
    }
  | {
      readonly kind: "animation"
      /** Pre-decoded frames (PNG paths), looping in the listed order. */
      readonly frames: readonly { readonly path: string; readonly delayMs: number }[]
    }
  | { readonly kind: "markdown"; readonly content: string }
  | { readonly kind: "code"; readonly content: string; readonly filetype?: string }

export interface ViewerHandler {
  /** Handler id shown in the panel footer. */
  readonly id: string
  /** File extensions (without dot) this handler claims. Empty = fallback. */
  readonly extensions: readonly string[]
  /**
   * Optional render target: cap the longest image edge at this pixel count so
   * decoded (BMP/TIFF) assets aren't cached far larger than any terminal shows.
   * Handlers may ignore it; native passthroughs do.
   */
  load(path: string, target?: { longEdge: number }): Promise<ViewContent>
}
