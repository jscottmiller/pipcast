import { spawn } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'

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
    // In a packaged build the binary lives in app.asar.unpacked (see asarUnpack
    // in electron-builder.yml); the resolved path still points at app.asar, so
    // rewrite it. No-op in dev where the path contains no asar segment.
    const ffmpegPath = bundled.replace('app.asar', 'app.asar.unpacked')

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
