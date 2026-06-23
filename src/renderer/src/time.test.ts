import { describe, it, expect } from 'vitest'
import { formatElapsed } from './time'

describe('formatElapsed', () => {
  it('formats zero as 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00')
  })

  it('floors sub-second remainders', () => {
    expect(formatElapsed(500)).toBe('00:00')
    expect(formatElapsed(1999)).toBe('00:01')
  })

  it('zero-pads seconds and minutes', () => {
    expect(formatElapsed(1000)).toBe('00:01')
    expect(formatElapsed(61_000)).toBe('01:01')
    expect(formatElapsed(59_999)).toBe('00:59')
  })

  it('rolls minutes over at 60 seconds', () => {
    expect(formatElapsed(600_000)).toBe('10:00')
  })

  it('does not cap minutes at 60', () => {
    expect(formatElapsed(3_600_000)).toBe('60:00')
  })
})
