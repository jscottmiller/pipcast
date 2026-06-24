import { spawn } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'

/**
 * Rewrite a path that points inside the asar archive to its unpacked sibling.
 *
 * In a packaged build `ffmpeg-static` resolves to a path under `app.asar/`, but
 * the binary is actually extracted to `app.asar.unpacked/` (see `asarUnpack` in
 * electron-builder.yml). Only an `app.asar` path *segment* (bounded by slashes)
 * is rewritten, so an install dir or username that merely contains the substring
 * "app.asar" is left alone. In dev there is no asar segment and the path is
 * returned unchanged.
 */
export function resolveUnpackedPath(p: string): string {
  return p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}

/** Build the ffmpeg argument list to transcode `input` to an MP4 at `output`. */
export function buildFfmpegArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    output
  ]
}

/**
 * Transcode a WebM recording to MP4 (H.264 / AAC).
 * Only used as a fallback when the runtime can't record MP4 directly.
 */
export function transcodeToMp4(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const bundled = ffmpegStatic as unknown as string | null
    if (!bundled) {
      reject(new Error('ffmpeg-static binary not found'))
      return
    }
    const ffmpegPath = resolveUnpackedPath(bundled)

    const args = buildFfmpegArgs(input, output)

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })

    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-2000)}`))
    })
  })
}
