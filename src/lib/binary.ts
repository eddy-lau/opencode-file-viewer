const CHUNK = 4096

/** Cheap content sniff: NUL byte or >10% suspicious bytes means binary. */
export function looksBinary(buf: Uint8Array): boolean {
  const view = buf.subarray(0, CHUNK)
  let suspicious = 0
  for (const byte of view) {
    if (byte === 0) return true
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious++
  }
  return suspicious / view.length > 0.1
}
