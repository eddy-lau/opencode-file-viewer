/** What the panel host knows how to render. */
export type ViewContent =
  | { readonly kind: "image"; readonly path: string }
  | {
      readonly kind: "pages"
      readonly count: number
      /** Renders one page (0-based) to a PNG path; may do slow work on first call. */
      readonly pagePath: (index: number) => Promise<string>
    }
  | { readonly kind: "markdown"; readonly content: string }
  | { readonly kind: "code"; readonly content: string; readonly filetype?: string }

export interface ViewerHandler {
  /** Handler id shown in the panel footer. */
  readonly id: string
  /** File extensions (without dot) this handler claims. Empty = fallback. */
  readonly extensions: readonly string[]
  load(path: string): Promise<ViewContent>
}
