import { createCompositor, type Compositor, type Corner } from './compositor'

const MP4_MIME = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
const WEBM_VP9 = 'video/webm;codecs=vp9,opus'
const WEBM_VP8 = 'video/webm;codecs=vp8,opus'

function pickMime(): { mimeType: string; ext: 'mp4' | 'webm' } {
  if (MediaRecorder.isTypeSupported(MP4_MIME)) return { mimeType: MP4_MIME, ext: 'mp4' }
  if (MediaRecorder.isTypeSupported(WEBM_VP9)) return { mimeType: WEBM_VP9, ext: 'webm' }
  return { mimeType: WEBM_VP8, ext: 'webm' }
}

function makeHiddenVideo(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.autoplay = true
  video.playsInline = true
  video.srcObject = stream
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play().finally(() => resolve(video))
    }
  })
}

export interface RecorderResult {
  blob: Blob
  ext: 'mp4' | 'webm'
}

export interface StartOptions {
  sourceId: string
  /** Long-lived webcam+mic stream owned by the caller (the live self-view). */
  webcamStream: MediaStream
  previewCanvas: HTMLCanvasElement
  /** Webcam bubble diameter as a fraction of screen height (0–1). */
  bubbleScale: number
  /** Which corner the webcam bubble sits in. */
  corner: Corner
}

export class Recorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  /** Only the screen stream is owned here; the webcam stream belongs to the caller. */
  private screenStream: MediaStream | null = null
  private compositor: Compositor | null = null
  private ext: 'mp4' | 'webm' = 'webm'

  async start(opts: StartOptions): Promise<void> {
    window.pipcast.setCaptureSource(opts.sourceId)

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    })
    this.screenStream = screenStream

    const screenVideo = await makeHiddenVideo(screenStream)
    const webcamVideo = await makeHiddenVideo(opts.webcamStream)

    this.compositor = createCompositor(screenVideo, webcamVideo, opts.previewCanvas, {
      bubbleScale: opts.bubbleScale,
      corner: opts.corner
    })

    const audioTrack = opts.webcamStream.getAudioTracks()[0]
    const composed = new MediaStream([
      ...this.compositor.stream.getVideoTracks(),
      ...(audioTrack ? [audioTrack] : [])
    ])

    const { mimeType, ext } = pickMime()
    this.ext = ext
    this.chunks = []
    this.recorder = new MediaRecorder(composed, { mimeType })
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(1000)
  }

  pause(): void {
    if (this.recorder?.state === 'recording') this.recorder.pause()
  }

  resume(): void {
    if (this.recorder?.state === 'paused') this.recorder.resume()
  }

  stop(): Promise<RecorderResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder
      if (!recorder) {
        reject(new Error('Recorder not started'))
        return
      }
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.ext === 'mp4' ? 'video/mp4' : 'video/webm' })
        this.cleanup()
        resolve({ blob, ext: this.ext })
      }
      recorder.stop()
    })
  }

  private cleanup(): void {
    this.compositor?.stop()
    // Stop only the screen capture; the webcam stream is owned by the caller
    // (the persistent self-view) and must keep running after a recording.
    this.screenStream?.getTracks().forEach((t) => t.stop())
    this.screenStream = null
    this.compositor = null
    this.recorder = null
  }

  get mimeExt(): 'mp4' | 'webm' {
    return this.ext
  }
}
