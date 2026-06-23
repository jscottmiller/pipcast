import { describe, it, expect } from 'vitest'
import { parseRangeHeader } from './range'

describe('parseRangeHeader', () => {
  it('returns null when no header is present', () => {
    expect(parseRangeHeader(null, 1000)).toBeNull()
    expect(parseRangeHeader('', 1000)).toBeNull()
  })

  it('returns null for an unparseable header', () => {
    expect(parseRangeHeader('garbage', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=abc-def', 1000)).toBeNull()
  })

  it('resolves an open-ended range to the last byte', () => {
    expect(parseRangeHeader('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('parses an explicit closed range', () => {
    expect(parseRangeHeader('bytes=200-499', 1000)).toEqual({ start: 200, end: 499 })
  })
})
