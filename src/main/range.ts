export interface ByteRange {
  start: number
  end: number
}

/**
 * Parse an HTTP `Range` header for a resource of `size` bytes.
 * Returns null when the header is absent or unparseable (caller serves the
 * full resource). An open-ended range (`bytes=N-`) resolves `end` to size-1.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | null {
  const match = /bytes=(\d+)-(\d*)/.exec(header ?? '')
  if (!match) return null
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  return { start, end }
}
