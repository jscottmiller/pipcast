import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickMime } from './recorder'

/** Stub the global MediaRecorder.isTypeSupported with a predicate over the MIME type. */
function stubSupport(supported: (type: string) => boolean): void {
  vi.stubGlobal('MediaRecorder', { isTypeSupported: (t: string) => supported(t) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickMime', () => {
  it('prefers MP4 when the runtime supports it', () => {
    stubSupport((t) => t.includes('mp4'))
    const { mimeType, ext } = pickMime()
    expect(ext).toBe('mp4')
    expect(mimeType).toContain('video/mp4')
  })

  it('falls back to WebM/VP9 when MP4 is unsupported', () => {
    stubSupport((t) => t.includes('vp9'))
    const { mimeType, ext } = pickMime()
    expect(ext).toBe('webm')
    expect(mimeType).toContain('vp9')
  })

  it('falls back to WebM/VP8 when neither MP4 nor VP9 is supported', () => {
    stubSupport(() => false)
    const { mimeType, ext } = pickMime()
    expect(ext).toBe('webm')
    expect(mimeType).toContain('vp8')
  })
})
