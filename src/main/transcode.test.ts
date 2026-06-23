import { describe, it, expect } from 'vitest'
import { buildFfmpegArgs } from './transcode'

describe('buildFfmpegArgs', () => {
  const args = buildFfmpegArgs('/tmp/in.webm', '/tmp/out.mp4')

  it('overwrites the output and reads the given input', () => {
    expect(args[0]).toBe('-y')
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/in.webm')
    expect(args.at(-1)).toBe('/tmp/out.mp4')
  })

  it('encodes H.264 video with a web-friendly pixel format and faststart', () => {
    expect(args).toContain('libx264')
    expect(args).toContain('yuv420p')
    expect(args).toContain('+faststart')
  })

  it('encodes AAC audio', () => {
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac')
  })
})
