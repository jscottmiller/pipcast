import { describe, it, expect } from 'vitest'
import { buildFfmpegArgs, resolveUnpackedPath } from './transcode'

describe('resolveUnpackedPath', () => {
  it('rewrites the app.asar segment to app.asar.unpacked (posix)', () => {
    expect(
      resolveUnpackedPath('/Applications/PipCast.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg')
    ).toBe('/Applications/PipCast.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg')
  })

  it('rewrites the app.asar segment on Windows backslash paths', () => {
    expect(
      resolveUnpackedPath('C:\\Users\\Jo\\AppData\\Local\\Temp\\PipCast\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe')
    ).toBe('C:\\Users\\Jo\\AppData\\Local\\Temp\\PipCast\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe')
  })

  it('leaves dev paths (no asar segment) unchanged', () => {
    const dev = '/home/dev/pipcast/node_modules/ffmpeg-static/ffmpeg'
    expect(resolveUnpackedPath(dev)).toBe(dev)
  })

  it('does not touch "app.asar" appearing only as a substring of a dir name', () => {
    const tricky = '/home/app.asar-backup/node_modules/ffmpeg-static/ffmpeg'
    expect(resolveUnpackedPath(tricky)).toBe(tricky)
  })
})

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
