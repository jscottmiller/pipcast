import { describe, it, expect } from 'vitest'
import { computeBubbleLayout, coverFitSquare } from './compositor'

describe('computeBubbleLayout', () => {
  // 1280x720 canvas, 26% bubble, 3% padding → diameter 187.2, radius 93.6, padding 21.6.
  const w = 1280
  const h = 720

  it('derives diameter, radius, and padding from canvas height', () => {
    const l = computeBubbleLayout(w, h, 0.26, 0.03, 'bottom-left')
    expect(l.diameter).toBeCloseTo(187.2)
    expect(l.radius).toBeCloseTo(93.6)
    expect(l.padding).toBeCloseTo(21.6)
  })

  it('places the bubble in the bottom-left corner', () => {
    const { cx, cy } = computeBubbleLayout(w, h, 0.26, 0.03, 'bottom-left')
    expect(cx).toBeCloseTo(115.2) // padding + radius
    expect(cy).toBeCloseTo(604.8) // height - padding - radius
  })

  it('places the bubble in the top-right corner', () => {
    const { cx, cy } = computeBubbleLayout(w, h, 0.26, 0.03, 'top-right')
    expect(cx).toBeCloseTo(1164.8) // width - padding - radius
    expect(cy).toBeCloseTo(115.2) // padding + radius
  })

  it('mirrors x for left vs right and y for top vs bottom', () => {
    const tl = computeBubbleLayout(w, h, 0.26, 0.03, 'top-left')
    const br = computeBubbleLayout(w, h, 0.26, 0.03, 'bottom-right')
    expect(tl.cx + br.cx).toBeCloseTo(w) // symmetric about the center
    expect(tl.cy + br.cy).toBeCloseTo(h)
  })
})

describe('coverFitSquare', () => {
  it('fills the square so the smaller dimension matches the diameter', () => {
    const { dw, dh } = coverFitSquare(640, 480, 200) // landscape → height is limiting
    expect(dh).toBeCloseTo(200)
    expect(dw).toBeCloseTo(266.667, 2)
    expect(Math.min(dw, dh)).toBeGreaterThanOrEqual(200) // fully covers, no gaps
  })

  it('handles portrait sources', () => {
    const { dw, dh } = coverFitSquare(480, 640, 200) // portrait → width is limiting
    expect(dw).toBeCloseTo(200)
    expect(dh).toBeCloseTo(266.667, 2)
  })

  it('returns the diameter on both axes for a square source', () => {
    const { dw, dh } = coverFitSquare(720, 720, 187.2)
    expect(dw).toBeCloseTo(187.2)
    expect(dh).toBeCloseTo(187.2)
  })
})
