declare module "omggif" {
  export interface GifFrameInfo {
    x: number
    y: number
    width: number
    height: number
    /** Frame display time, in hundredths of a second (GCE declared). */
    delay: number
    /** 0 = keep, 1 = clear to background, 2 = restore previous. */
    disposal: number
    transparent_index: number | null
    interlaced: boolean
  }

  export class GifReader {
    constructor(data: Uint8Array)
    readonly width: number
    readonly height: number
    numFrames(): number
    frameInfo(index: number): GifFrameInfo
    /**
     * Composites frame `index` (applying prior frames' disposal) into
     * `buffer` as RGBA (w * h * 4).
     */
    decodeAndBlitFrameRGBA(index: number, buffer: Uint8ClampedArray): void
  }
}
